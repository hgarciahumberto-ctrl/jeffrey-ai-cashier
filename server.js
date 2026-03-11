import express from "express";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// -------------------------------
// In-memory session store
// -------------------------------
const callSessions = new Map();

function createEmptyOrder() {
  return {
    items: [],
    notes: [],
    subtotalEstimate: 0,
    upsellOffered: false,
    extraSauceAsked: false,
    paymentWarningGiven: false,
    orderName: null,
    pickupPerson: null
  };
}

function getSession(callSid) {
  if (!callSessions.has(callSid)) {
    callSessions.set(callSid, {
      greeted: false,
      language: null,
      stage: "greeting",
      orderTypeConfirmed: false,
      currentItem: null,
      order: createEmptyOrder(),
      lastUserMessage: "",
      createdAt: Date.now()
    });
  }
  return callSessions.get(callSid);
}

// Cleanup old sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [callSid, session] of callSessions.entries()) {
    if (now - session.createdAt > 1000 * 60 * 60) {
      callSessions.delete(callSid);
    }
  }
}, 1000 * 60 * 10);

// -------------------------------
// Helpers
// -------------------------------
function containsAny(text, words) {
  return words.some((w) => text.includes(w));
}

function detectLanguage(text) {
  const lower = text.toLowerCase();
  if (
    containsAny(lower, [
      "español",
      "espanol",
      "quiero",
      "orden",
      "para llevar",
      "sí",
      "si",
      "con hueso",
      "sin hueso",
      "boneless",
      "alitas"
    ])
  ) {
    return "spanish";
  }
  return "english";
}

function estimateWingPrice(type, qty) {
  const classic = {
    6: 10.10,
    9: 14.20,
    12: 18.30,
    18: 23.65,
    24: 30.65,
    48: 58.50
  };
  const boneless = {
    6: 9.05,
    9: 13.35,
    12: 16.45,
    18: 22.65,
    24: 28.85,
    48: 56.85
  };
  return type === "boneless" ? boneless[qty] || 0 : classic[qty] || 0;
}

function estimateSidePrice(name) {
  const prices = {
    "corn ribs": 6.45,
    "mozzarella sticks": 7.50,
    "mac bites": 7.50,
    fries: 4.15,
    "sweet potato fries": 4.95,
    "potato salad": 2.99
  };
  return prices[name.toLowerCase()] || 0;
}

function formatOrderSummary(order) {
  if (!order.items.length) return "No items yet.";

  return order.items
    .map((item, idx) => {
      let line = `${idx + 1}. ${item.name}`;

      if (item.details?.wingType) line += `, ${item.details.wingType}`;
      if (item.details?.quantity) line += `, ${item.details.quantity} pieces`;
      if (item.details?.sauces?.length) line += `, sauces: ${item.details.sauces.join(", ")}`;
      if (item.details?.dips?.length) line += `, dips: ${item.details.dips.join(", ")}`;
      if (item.details?.side) line += `, side: ${item.details.side}`;
      if (item.details?.drink) line += `, drink: ${item.details.drink}`;
      if (item.details?.notes?.length) line += `, notes: ${item.details.notes.join(", ")}`;

      return line;
    })
    .join(". ");
}

function addItemToOrder(session, item) {
  session.order.items.push(item);
  session.order.subtotalEstimate += item.estimatedPrice || 0;
  session.currentItem = null;
}

function getIncludedSauceLimit(qty) {
  if (qty === 6 || qty === 9) return 1;
  if (qty === 12) return 2;
  if (qty === 18) return 3;
  if (qty === 24) return 4;
  if (qty === 48) return 8;
  return 0;
}

function getIncludedDips(qty) {
  if (!qty) return 0;
  return Math.floor(qty / 6);
}

// -------------------------------
// Jeffrey prompt
// -------------------------------
const SYSTEM_PROMPT = `
You are Jeffrey, the phone cashier for Flaps and Racks restaurant in Tucson, Arizona.

You are warm, polite, calm, friendly, and service-oriented.
You sound like a real restaurant cashier, not a robot.

Speaking rules:
- Keep responses short.
- Ask one question at a time.
- Do not repeat the greeting after the call has started.
- Do not act like each turn is a new call.
- Guide the order naturally, step by step.
- Be confident and helpful.
- Never sound technical.
- Never use robotic phrases.

Main job:
You are helping a customer place a To-Go order.

Important rules:
- Default to To-Go
- Never offer delivery
- If customer says wings, ask traditional bone-in or boneless
- Only upsell once, near the end
- Only full recap at the end
- If customer sounds confused, simplify
- If customer wants help from a person, offer transfer

Menu logic:
Wings and boneless sizes:
6, 9, 12, 18, 24, 48

Sauce limits:
6 = 1 sauce
9 = 1 sauce
12 = 2 sauces
18 = 3 sauces
24 = 4 sauces
48 = 8 sauces

Extra sauces:
- $0.75
- on the side only

Dipping sauces:
- 1 dip per 6 wings/boneless
- Ranch
- Blue Cheese
- Chipotle Ranch
- Jalapeño Ranch

Ribs:
- half rack = 1 sauce
- full rack = 2 sauces max

Popular recommendations:
- ribs: Green Chile, BBQ Chiltepin
- corn ribs: Lime Pepper, Garlic Parmesan
- pork belly: Green Chile, BBQ Chiltepin

Top upsells:
- corn ribs
- mozzarella sticks
- mac bites

Payment rule:
If the order approaches or exceeds $50, say:
"Before we continue, our policy requires payment for orders over 50 dollars before we place the order. You can pay over the phone or through a secure text link. Would you like to continue?"

If the customer says they want to place an order:
- do not greet again
- move to To-Go confirmation if not already confirmed
- otherwise move to the next cashier question

Always behave like a cashier following the order process, not a chatbot making small talk.
`;

// -------------------------------
// Main voice route
// -------------------------------
app.post("/voice", async (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const callSid = req.body.CallSid || "unknown-call";
  const userSpeech = (req.body.SpeechResult || "").trim();
  const lower = userSpeech.toLowerCase();
  const session = getSession(callSid);

  try {
    let reply = "";

    // ---------------------------
    // First greeting
    // ---------------------------
    if (!session.greeted && !userSpeech) {
      session.greeted = true;
      session.stage = "language";
      reply =
        "Thank you for calling Flaps and Racks. This is Jeffrey. Would you like to order in English or en Español?";
    }

    // ---------------------------
    // Language selection
    // ---------------------------
    if (!reply && session.stage === "language") {
      if (userSpeech) {
        session.language = detectLanguage(userSpeech);

        if (
          containsAny(lower, ["english", "inglés", "ingles"])
        ) {
          session.language = "english";
        } else if (
          containsAny(lower, ["español", "espanol", "spanish"])
        ) {
          session.language = "spanish";
        }

        session.stage = "order_type";
        reply =
          session.language === "spanish"
            ? "Perfecto. ¿Este pedido será para llevar?"
            : "Perfect. Will this order be To-Go?";
      }
    }

    // ---------------------------
    // To-Go confirmation
    // ---------------------------
    if (!reply && session.stage === "order_type") {
      if (
        containsAny(lower, [
          "yes",
          "sí",
          "si",
          "to go",
          "pickup",
          "pick up",
          "para llevar",
          "quiero ordenar",
          "i want to place an order",
          "i want to order"
        ])
      ) {
        session.orderTypeConfirmed = true;
        session.stage = "item_capture";
        reply =
          session.language === "spanish"
            ? "Perfecto. ¿Qué le preparo hoy?"
            : "Great. What can I get started for you today?";
      } else if (userSpeech) {
        // If they skip the answer and start ordering, move on
        session.orderTypeConfirmed = true;
        session.stage = "item_capture";
      }
    }

    // ---------------------------
    // Item capture
    // ---------------------------
    if (!reply && session.stage === "item_capture") {
      if (containsAny(lower, ["wings", "wing", "alitas"])) {
        session.currentItem = {
          type: "wings",
          name: null,
          details: {
            wingType: null,
            quantity: null,
            sauces: [],
            dips: [],
            notes: []
          }
        };
        session.stage = "wings_type";
        reply =
          session.language === "spanish"
            ? "¿Las quiere tradicionales con hueso o boneless?"
            : "Would you like traditional bone-in or boneless?";
      } else if (containsAny(lower, ["half rack", "full rack", "ribs", "costillas"])) {
        session.currentItem = {
          type: "ribs",
          name: null,
          details: {
            size: null,
            sauces: []
          }
        };
        session.stage = "ribs_size";
        reply =
          session.language === "spanish"
            ? "¿Las quiere media orden o orden completa?"
            : "Would you like a half rack or a full rack?";
      } else if (containsAny(lower, ["corn ribs"])) {
        session.currentItem = {
          type: "side",
          name: "Corn Ribs",
          details: {
            sauces: []
          },
          estimatedPrice: 6.45
        };
        session.stage = "corn_ribs_sauce";
        reply =
          session.language === "spanish"
            ? "Las corn ribs incluyen una salsa. ¿Qué salsa le gustaría?"
            : "Corn ribs include one sauce. What sauce would you like?";
      } else if (containsAny(lower, ["mozzarella"])) {
        addItemToOrder(session, {
          type: "side",
          name: "Mozzarella Sticks",
          details: {
            sauces: ["Marinara"]
          },
          estimatedPrice: 7.50
        });
        session.stage = "next_item";
        reply =
          session.language === "spanish"
            ? "Perfecto. ¿Qué más le puedo preparar?"
            : "Perfect. What else can I get for you?";
      } else if (containsAny(lower, ["mac bites"])) {
        addItemToOrder(session, {
          type: "side",
          name: "Mac Bites",
          details: {},
          estimatedPrice: 7.50
        });
        session.stage = "next_item";
        reply =
          session.language === "spanish"
            ? "Perfecto. ¿Qué más le puedo preparar?"
            : "Perfect. What else can I get for you?";
      } else if (containsAny(lower, ["chicken sandwich", "sandwich de pollo"])) {
        session.currentItem = {
          type: "chicken_sandwich",
          name: "Chicken Sandwich",
          details: {
            chickenStyle: null,
            combo: false,
            side: null,
            drink: null,
            notes: []
          },
          estimatedPrice: 8.85
        };
        session.stage = "chicken_style";
        reply =
          session.language === "spanish"
            ? "¿Le gustaría el pollo a la parrilla o empanizado?"
            : "Would you like the chicken grilled or fried?";
      } else {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.4,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "system",
              content: `Current stage: ${session.stage}. Language: ${session.language || "english"}. Order summary so far: ${formatOrderSummary(session.order)}`
            },
            { role: "user", content: userSpeech || "Ask what the customer would like to order." }
          ]
        });

        reply =
          completion.choices?.[0]?.message?.content?.trim() ||
          "What can I get started for you today?";
      }
    }

    // ---------------------------
    // Wings flow
    // ---------------------------
    if (!reply && session.stage === "wings_type" && session.currentItem?.type === "wings") {
      if (containsAny(lower, ["bone", "traditional", "classic", "clasicas", "con hueso"])) {
        session.currentItem.details.wingType = "traditional";
        session.currentItem.name = "Traditional Wings";
        session.stage = "wings_quantity";
        reply =
          session.language === "spanish"
            ? "¿Cuántas piezas le gustaría? Tenemos 6, 9, 12, 18, 24 o 48."
            : "How many would you like? We have 6, 9, 12, 18, 24, or 48.";
      } else if (containsAny(lower, ["boneless", "sin hueso"])) {
        session.currentItem.details.wingType = "boneless";
        session.currentItem.name = "Boneless Wings";
        session.stage = "wings_quantity";
        reply =
          session.language === "spanish"
            ? "¿Cuántas piezas le gustaría? Tenemos 6, 9, 12, 18, 24 o 48."
            : "How many would you like? We have 6, 9, 12, 18, 24, or 48.";
      }
    }

    if (!reply && session.stage === "wings_quantity" && session.currentItem?.type === "wings") {
      const qtyMatch = lower.match(/\b(6|9|12|18|24|48)\b/);
      if (qtyMatch) {
        const qty = Number(qtyMatch[1]);
        session.currentItem.details.quantity = qty;
        session.currentItem.estimatedPrice = estimateWingPrice(
          session.currentItem.details.wingType,
          qty
        );
        session.stage = "wings_sauces";
        const sauceLimit = getIncludedSauceLimit(qty);
        reply =
          session.language === "spanish"
            ? `Perfecto. Esa orden incluye hasta ${sauceLimit} salsa${sauceLimit > 1 ? "s" : ""}. ¿Qué salsa le gustaría?`
            : `Perfect. That order includes up to ${sauceLimit} sauce${sauceLimit > 1 ? "s" : ""}. What sauce would you like?`;
      }
    }

    if (!reply && session.stage === "wings_sauces" && session.currentItem?.type === "wings") {
      if (userSpeech) {
        const sauceLimit = getIncludedSauceLimit(session.currentItem.details.quantity);
        session.currentItem.details.sauces = [userSpeech];
        session.stage = "wings_dips";
        const dips = getIncludedDips(session.currentItem.details.quantity);
        reply =
          session.language === "spanish"
            ? `Perfecto. Esa orden incluye ${dips} aderezo${dips > 1 ? "s" : ""}. ¿Le gustaría ranch, blue cheese, chipotle ranch o jalapeño ranch?`
            : `Perfect. That order includes ${dips} dipping sauce${dips > 1 ? "s" : ""}. Would you like ranch, blue cheese, chipotle ranch, or jalapeño ranch?`;
      }
    }

    if (!reply && session.stage === "wings_dips" && session.currentItem?.type === "wings") {
      if (userSpeech) {
        session.currentItem.details.dips = [userSpeech];
        addItemToOrder(session, session.currentItem);
        session.stage = "next_item";
        reply =
          session.language === "spanish"
            ? "Perfecto. ¿Qué más le puedo preparar?"
            : "Perfect. What else can I get for you?";
      }
    }

    // ---------------------------
    // Ribs flow
    // ---------------------------
    if (!reply && session.stage === "ribs_size" && session.currentItem?.type === "ribs") {
      if (containsAny(lower, ["half", "media"])) {
        session.currentItem.details.size = "half rack";
        session.currentItem.name = "Half Rack Ribs";
        session.currentItem.estimatedPrice = 13.25;
        session.stage = "ribs_sauces";
        reply =
          session.language === "spanish"
            ? "Perfecto. La media orden incluye una salsa. ¿Qué salsa le gustaría?"
            : "Perfect. The half rack includes one sauce. What sauce would you like?";
      } else if (containsAny(lower, ["full", "completa"])) {
        session.currentItem.details.size = "full rack";
        session.currentItem.name = "Full Rack Ribs";
        session.currentItem.estimatedPrice = 20.99;
        session.stage = "ribs_sauces";
        reply =
          session.language === "spanish"
            ? "Perfecto. La orden completa incluye hasta dos salsas. ¿Qué salsa le gustaría?"
            : "Perfect. The full rack includes up to two sauces. What sauce would you like?";
      }
    }

    if (!reply && session.stage === "ribs_sauces" && session.currentItem?.type === "ribs") {
      if (userSpeech) {
        session.currentItem.details.sauces = [userSpeech];
        addItemToOrder(session, session.currentItem);
        session.stage = "next_item";
        reply =
          session.language === "spanish"
            ? "Perfecto. ¿Qué más le puedo preparar?"
            : "Perfect. What else can I get for you?";
      }
    }

    // ---------------------------
    // Corn ribs flow
    // ---------------------------
    if (!reply && session.stage === "corn_ribs_sauce" && session.currentItem?.name === "Corn Ribs") {
      if (userSpeech) {
        session.currentItem.details.sauces = [userSpeech];
        addItemToOrder(session, session.currentItem);
        session.stage = "next_item";
        reply =
          session.language === "spanish"
            ? "Perfecto. ¿Qué más le puedo preparar?"
            : "Perfect. What else can I get for you?";
      }
    }

    // ---------------------------
    // Chicken sandwich flow
    // ---------------------------
    if (!reply && session.stage === "chicken_style" && session.currentItem?.type === "chicken_sandwich") {
      if (containsAny(lower, ["grilled", "parrilla"])) {
        session.currentItem.details.chickenStyle = "grilled";
        session.stage = "chicken_mods";
        reply =
          session.language === "spanish"
            ? "El chicken sandwich viene con queso, mayonesa, lechuga, cebolla, tomate y pepinillos. ¿Le gustaría dejarlo así o quitar algo?"
            : "The chicken sandwich comes with cheese, mayo, lettuce, onion, tomato, and pickles. Would you like to leave it as it comes or remove anything?";
      } else if (containsAny(lower, ["fried", "empanizado", "frito"])) {
        session.currentItem.details.chickenStyle = "fried";
        session.stage = "chicken_mods";
        reply =
          session.language === "spanish"
            ? "El chicken sandwich viene con queso, mayonesa, lechuga, cebolla, tomate y pepinillos. ¿Le gustaría dejarlo así o quitar algo?"
            : "The chicken sandwich comes with cheese, mayo, lettuce, onion, tomato, and pickles. Would you like to leave it as it comes or remove anything?";
      }
    }

    if (!reply && session.stage === "chicken_mods" && session.currentItem?.type === "chicken_sandwich") {
      if (userSpeech) {
        session.currentItem.details.notes.push(userSpeech);
        session.stage = "chicken_combo";
        reply =
          session.language === "spanish"
            ? "¿Le gustaría hacerlo combo con papas y bebida?"
            : "Would you like to make it a combo with fries and a drink?";
      }
    }

    if (!reply && session.stage === "chicken_combo" && session.currentItem?.type === "chicken_sandwich") {
      if (containsAny(lower, ["yes", "sí", "si", "combo"])) {
        session.currentItem.details.combo = true;
        session.currentItem.estimatedPrice = 12.35;
        session.stage = "combo_side";
        reply =
          session.language === "spanish"
            ? "¿Le gustaría papas regulares, sweet potato fries o potato salad?"
            : "Would you like regular fries, sweet potato fries, or potato salad?";
      } else if (containsAny(lower, ["no"])) {
        addItemToOrder(session, session.currentItem);
        session.stage = "next_item";
        reply =
          session.language === "spanish"
            ? "Perfecto. ¿Qué más le puedo preparar?"
            : "Perfect. What else can I get for you?";
      }
    }

    if (!reply && session.stage === "combo_side" && session.currentItem) {
      if (userSpeech) {
        session.currentItem.details.side = userSpeech;
        session.stage = "combo_drink";
        reply =
          session.language === "spanish"
            ? "¿Qué bebida le gustaría?"
            : "What drink would you like?";
      }
    }

    if (!reply && session.stage === "combo_drink" && session.currentItem) {
      if (userSpeech) {
        session.currentItem.details.drink = userSpeech;
        addItemToOrder(session, session.currentItem);
        session.stage = "next_item";
        reply =
          session.language === "spanish"
            ? "Perfecto. ¿Qué más le puedo preparar?"
            : "Perfect. What else can I get for you?";
      }
    }

    // ---------------------------
    // Next item / upsell / recap
    // ---------------------------
    if (!reply && session.stage === "next_item") {
      if (
        containsAny(lower, ["no", "that's all", "thats all", "nada más", "nada mas", "ya"])
      ) {
        if (!session.order.upsellOffered) {
          session.order.upsellOffered = true;
          session.stage = "upsell";
          reply =
            session.language === "spanish"
              ? "Antes de terminar, ¿le gustaría agregar corn ribs, mozzarella sticks o mac bites?"
              : "Before I finish, would you like to add corn ribs, mozzarella sticks, or mac bites?";
        } else {
          session.stage = "extras";
        }
      } else if (userSpeech) {
        session.stage = "item_capture";
      }
    }

    if (!reply && session.stage === "upsell") {
      if (
        containsAny(lower, ["no", "no thanks", "no gracias"])
      ) {
        session.stage = "extras";
        reply =
          session.language === "spanish"
            ? "¿Le gustaría alguna salsa o aderezo extra al lado?"
            : "Would you like any extra sauces or extra dressings on the side?";
      } else {
        session.stage = "item_capture";
      }
    }

    if (!reply && session.stage === "extras") {
      session.order.extraSauceAsked = true;
      session.stage = "payment_check";

      if (session.order.subtotalEstimate >= 45 && !session.order.paymentWarningGiven) {
        session.order.paymentWarningGiven = true;
        reply =
          session.language === "spanish"
            ? "Antes de continuar, nuestra política requiere pago para órdenes de más de 50 dólares antes de enviarla. Puede pagar por teléfono o por un enlace seguro por mensaje. ¿Desea continuar?"
            : "Before we continue, our policy requires payment for orders over 50 dollars before we place the order. You can pay over the phone or through a secure text link. Would you like to continue?";
      } else {
        session.stage = "final_recap";
      }
    }

    if (!reply && session.stage === "payment_check") {
      if (containsAny(lower, ["yes", "sí", "si"])) {
        session.stage = "final_recap";
      } else if (containsAny(lower, ["no"])) {
        reply =
          session.language === "spanish"
            ? "No hay problema. También puede hacer su orden en línea en flapsandracks.com."
            : "No problem. You can also place the order online at flapsandracks.com.";
        session.stage = "closing";
      } else {
        session.stage = "final_recap";
      }
    }

    if (!reply && session.stage === "final_recap") {
      const summary = formatOrderSummary(session.order);
      reply =
        session.language === "spanish"
          ? `Permítame confirmar su orden. ${summary}. ¿Está todo correcto?`
          : `Let me confirm your order. ${summary}. Is everything correct?`;
      session.stage = "confirm_recap";
    }

    if (!reply && session.stage === "confirm_recap") {
      if (containsAny(lower, ["yes", "sí", "si", "correct", "correcto"])) {
        session.stage = "order_name";
        reply =
          session.language === "spanish"
            ? "¿A nombre de quién va la orden?"
            : "What name should I put on the order?";
      } else {
        session.stage = "item_capture";
        reply =
          session.language === "spanish"
            ? "Claro. Dígame qué le gustaría corregir."
            : "Of course. Tell me what you would like to correct.";
      }
    }

    if (!reply && session.stage === "order_name") {
      if (userSpeech) {
        session.order.orderName = userSpeech;
        session.stage = "closing";
        reply =
          session.language === "spanish"
            ? `Perfecto. La orden estará lista en aproximadamente 25 minutos. Gracias por llamar a Flaps and Racks.`
            : `Perfect. Your order should be ready in about 25 minutes. Thank you for calling Flaps and Racks.`;
      }
    }

    if (!reply && session.stage === "closing") {
      reply =
        session.language === "spanish"
          ? "Gracias por llamar a Flaps and Racks."
          : "Thank you for calling Flaps and Racks.";
    }

    // Fallback to AI if needed
    if (!reply) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "system",
            content: `Current stage: ${session.stage}. Language: ${session.language || "english"}. Order summary so far: ${formatOrderSummary(session.order)}`
          },
          { role: "user", content: userSpeech || "Continue the order naturally." }
        ]
      });

      reply =
        completion.choices?.[0]?.message?.content?.trim() ||
        "How can I help you today?";
    }

    const gather = twiml.gather({
      input: ["speech"],
      action: "/voice",
      method: "POST",
      speechTimeout: "auto",
      enhanced: true
    });

    gather.say(
      { voice: "Polly.Joanna-Generative", language: "en-US" },
      reply
    );

    res.type("text/xml");
    res.status(200).send(twiml.toString());
  } catch (error) {
    console.error("VOICE ERROR:", error);

    const gather = twiml.gather({
      input: ["speech"],
      action: "/voice",
      method: "POST",
      speechTimeout: "auto",
      enhanced: true
    });

    gather.say(
      { voice: "Polly.Joanna-Generative", language: "en-US" },
      "Thank you for calling Flaps and Racks. This is Jeffrey. How can I help you today?"
    );

    res.type("text/xml");
    res.status(200).send(twiml.toString());
  }
});

app.get("/", (_req, res) => {
  res.send("Jeffrey AI cashier is running.");
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Jeffrey AI cashier running on port " + PORT);
});
