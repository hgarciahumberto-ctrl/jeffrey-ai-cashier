import express from "express";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ----------------------------------
// Session Store
// ----------------------------------
const callSessions = new Map();

function createEmptyOrder() {
  return {
    items: [],
    subtotalEstimate: 0,
    upsellOffered: false,
    extraSauceAsked: false,
    paymentWarningGiven: false,
    orderName: null
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
      createdAt: Date.now()
    });
  }
  return callSessions.get(callSid);
}

setInterval(() => {
  const now = Date.now();
  for (const [callSid, session] of callSessions.entries()) {
    if (now - session.createdAt > 1000 * 60 * 60) {
      callSessions.delete(callSid);
    }
  }
}, 1000 * 60 * 10);

// ----------------------------------
// Helpers
// ----------------------------------
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
      "alitas",
      "con hueso",
      "sin hueso"
    ])
  ) {
    return "spanish";
  }
  return "english";
}

function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  return qty ? Math.floor(qty / 6) : 0;
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

function addItemToOrder(session, item) {
  session.order.items.push(item);
  session.order.subtotalEstimate += item.estimatedPrice || 0;
  session.currentItem = null;
}

function formatOrderSummary(order) {
  if (!order.items.length) return "No items on the order yet.";

  return order.items
    .map((item) => {
      let line = item.name;

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

// ----------------------------------
// Parsing helpers
// ----------------------------------
function parseWingInput(text) {
  const lower = normalizeText(text);

  const qtyMatch = lower.match(/\b(6|9|12|18|24|48)\b/);
  const qty = qtyMatch ? Number(qtyMatch[1]) : null;

  let wingType = null;
  if (
    containsAny(lower, [
      "traditional",
      "classic",
      "clasicas",
      "clásicas",
      "bone in",
      "bone-in",
      "con hueso"
    ])
  ) {
    wingType = "traditional";
  } else if (
    containsAny(lower, [
      "boneless",
      "sin hueso"
    ])
  ) {
    wingType = "boneless";
  }

  const mentionsWings = containsAny(lower, ["wings", "wing", "alitas"]);
  return { qty, wingType, mentionsWings };
}

function parseSauces(text) {
  const lower = normalizeText(text);

  const sauceMap = [
    "al pastor",
    "bbq",
    "bbq chiltepin",
    "buffalo hot",
    "buffalo mild",
    "buffalo medium",
    "chocolate chiltepin",
    "chorizo",
    "cinnamon roll",
    "citrus chipotle",
    "garlic parmesan",
    "green chile",
    "hot",
    "lime pepper",
    "mango habanero",
    "mild",
    "pizza",
    "sweet and spicy",
    "teriyaki"
  ];

  const found = [];
  for (const sauce of sauceMap) {
    if (lower.includes(sauce)) {
      found.push(sauce);
    }
  }

  // Avoid duplicate "hot" if "buffalo hot" already matched
  if (found.includes("buffalo hot") && found.includes("hot")) {
    return found.filter((s) => s !== "hot");
  }
  if (found.includes("buffalo mild") && found.includes("mild")) {
    return found.filter((s) => s !== "mild");
  }

  return [...new Set(found)];
}

function parseDips(text) {
  const lower = normalizeText(text);
  const dipMap = [
    "ranch",
    "blue cheese",
    "chipotle ranch",
    "jalapeno ranch",
    "jalapeño ranch"
  ];

  const found = [];
  for (const dip of dipMap) {
    if (lower.includes(dip)) {
      found.push(dip.replace("jalapeno", "jalapeño"));
    }
  }
  return [...new Set(found)];
}

function nextQuestionForWings(session) {
  const item = session.currentItem;
  if (!item.details.wingType) {
    return session.language === "spanish"
      ? "¿Las quiere tradicionales con hueso o boneless?"
      : "Would you like traditional bone-in or boneless?";
  }
  if (!item.details.quantity) {
    return session.language === "spanish"
      ? "¿Cuántas piezas le gustaría? Tenemos 6, 9, 12, 18, 24 o 48."
      : "How many would you like? We have 6, 9, 12, 18, 24, or 48.";
  }
  if (!item.details.sauces.length) {
    const limit = getIncludedSauceLimit(item.details.quantity);
    return session.language === "spanish"
      ? `Perfecto. Esa orden incluye hasta ${limit} salsa${limit > 1 ? "s" : ""}. ¿Qué salsa le gustaría?`
      : `Perfect. That order includes up to ${limit} sauce${limit > 1 ? "s" : ""}. What sauce would you like?`;
  }
  if (!item.details.dips.length) {
    const dips = getIncludedDips(item.details.quantity);
    return session.language === "spanish"
      ? `Perfecto. Esa orden incluye ${dips} aderezo${dips > 1 ? "s" : ""}. ¿Le gustaría ranch, blue cheese, chipotle ranch o jalapeño ranch?`
      : `Perfect. That order includes ${dips} dipping sauce${dips > 1 ? "s" : ""}. Would you like ranch, blue cheese, chipotle ranch, or jalapeño ranch?`;
  }
  return null;
}

// ----------------------------------
// AI Prompt
// ----------------------------------
const SYSTEM_PROMPT = `
You are Jeffrey, the phone cashier for Flaps and Racks restaurant in Tucson, Arizona.

You are warm, polite, calm, friendly, and service-oriented.
You sound like a real restaurant cashier, not a robot.

Rules:
- Speak in short, clear sentences.
- Ask one question at a time.
- Do not repeat the greeting after the call has started.
- Do not act like every turn is a new call.
- Move the order forward naturally.
- Confirm instead of assuming.
- Keep the conversation easy to follow.
- Never use robotic phrases.

Restaurant guidance:
- Default to To-Go.
- Never offer delivery.
- If customer says wings, confirm traditional bone-in or boneless.
- Wing sizes: 6, 9, 12, 18, 24, 48
- Sauce limit: 1 sauce per 6 pieces
- Dipping sauces: 1 per 6 pieces
- Extra sauces: 75 cents and on the side
- Ribs: half rack = 1 sauce, full rack = up to 2 sauces
- Popular sauces: Lime Pepper, Garlic Parmesan, Mango Habanero, Green Chile, BBQ Chiltepin
- Top upsells: corn ribs, mozzarella sticks, mac bites
- If order is near or above 50 dollars, payment is required before placing the order
- Only offer upsell once near the end
- Only recap at the end
- If customer asks for help or gets frustrated, offer transfer

Always behave like a cashier following the order process.
`;

// ----------------------------------
// Main Route
// ----------------------------------
app.post("/voice", async (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const callSid = req.body.CallSid || "unknown-call";
  const userSpeech = (req.body.SpeechResult || "").trim();
  const lower = normalizeText(userSpeech);
  const session = getSession(callSid);

  try {
    let reply = "";

    // ------------------------------
    // First greeting only once
    // ------------------------------
    if (!session.greeted && !userSpeech) {
      session.greeted = true;
      session.stage = "language";
      reply =
        "Thank you for calling Flaps and Racks. This is Jeffrey. Would you like to order in English or en Español?";
    }

    // ------------------------------
    // Language state
    // ------------------------------
    if (!reply && session.stage === "language") {
      if (userSpeech) {
        session.language = detectLanguage(userSpeech);

        if (containsAny(lower, ["english", "ingles", "inglés"])) {
          session.language = "english";
        }
        if (containsAny(lower, ["español", "espanol", "spanish"])) {
          session.language = "spanish";
        }

        session.stage = "order_type";
        reply =
          session.language === "spanish"
            ? "Perfecto. ¿Este pedido será para llevar?"
            : "Perfect. Will this order be To-Go?";
      }
    }

    // ------------------------------
    // To-Go state
    // ------------------------------
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
          "i want to place an order",
          "i want to order",
          "quiero hacer una orden",
          "quiero ordenar"
        ])
      ) {
        session.orderTypeConfirmed = true;
        session.stage = "item_capture";
        reply =
          session.language === "spanish"
            ? "Perfecto. ¿Qué le preparo hoy?"
            : "Great. What can I get started for you today?";
      } else if (userSpeech) {
        session.orderTypeConfirmed = true;
        session.stage = "item_capture";
      }
    }

    // ------------------------------
    // Item capture state
    // ------------------------------
    if (!reply && session.stage === "item_capture") {
      const parsedWing = parseWingInput(userSpeech);

      if (parsedWing.mentionsWings) {
        session.currentItem = {
          type: "wings",
          name: parsedWing.wingType === "boneless" ? "Boneless Wings" : "Traditional Wings",
          details: {
            wingType: parsedWing.wingType,
            quantity: parsedWing.qty,
            sauces: [],
            dips: [],
            notes: []
          },
          estimatedPrice:
            parsedWing.wingType && parsedWing.qty
              ? estimateWingPrice(parsedWing.wingType, parsedWing.qty)
              : 0
        };

        session.stage = "wings_detail";
        reply = nextQuestionForWings(session);
      } else if (containsAny(lower, ["corn ribs"])) {
        session.currentItem = {
          type: "side",
          name: "Corn Ribs",
          details: { sauces: [] },
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
          details: { sauces: ["marinara"] },
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
      } else {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.3,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "system",
              content: `Language: ${session.language || "english"}. Stage: ${session.stage}. Current order: ${formatOrderSummary(session.order)}`
            },
            { role: "user", content: userSpeech || "Ask what the customer wants to order." }
          ]
        });

        reply =
          completion.choices?.[0]?.message?.content?.trim() ||
          "What can I get started for you today?";
      }
    }

    // ------------------------------
    // Wings detail state
    // ------------------------------
    if (!reply && session.stage === "wings_detail" && session.currentItem?.type === "wings") {
      const item = session.currentItem;
      const parsedWing = parseWingInput(userSpeech);
      const sauces = parseSauces(userSpeech);
      const dips = parseDips(userSpeech);

      if (!item.details.wingType && parsedWing.wingType) {
        item.details.wingType = parsedWing.wingType;
        item.name = parsedWing.wingType === "boneless" ? "Boneless Wings" : "Traditional Wings";
      }

      if (!item.details.quantity && parsedWing.qty) {
        item.details.quantity = parsedWing.qty;
        item.estimatedPrice = estimateWingPrice(item.details.wingType || "traditional", parsedWing.qty);
      }

      if (item.details.quantity && sauces.length && !item.details.sauces.length) {
        const limit = getIncludedSauceLimit(item.details.quantity);
        item.details.sauces = sauces.slice(0, limit);
      }

      if (item.details.quantity && dips.length && !item.details.dips.length) {
        const limit = getIncludedDips(item.details.quantity);
        item.details.dips = dips.slice(0, limit);
      }

      const nextQ = nextQuestionForWings(session);

      if (nextQ) {
        reply = nextQ;
      } else {
        addItemToOrder(session, item);
        session.stage = "next_item";
        reply =
          session.language === "spanish"
            ? "Perfecto. ¿Qué más le puedo preparar?"
            : "Perfect. What else can I get for you?";
      }
    }

    // ------------------------------
    // Corn ribs sauce
    // ------------------------------
    if (!reply && session.stage === "corn_ribs_sauce" && session.currentItem?.name === "Corn Ribs") {
      const sauces = parseSauces(userSpeech);
      if (sauces.length) {
        session.currentItem.details.sauces = [sauces[0]];
      } else if (userSpeech) {
        session.currentItem.details.sauces = [userSpeech];
      }

      addItemToOrder(session, session.currentItem);
      session.stage = "next_item";
      reply =
        session.language === "spanish"
          ? "Perfecto. ¿Qué más le puedo preparar?"
          : "Perfect. What else can I get for you?";
    }

    // ------------------------------
    // Next item / upsell / recap
    // ------------------------------
    if (!reply && session.stage === "next_item") {
      if (containsAny(lower, ["no", "that's all", "thats all", "no thanks", "no gracias", "nada más", "nada mas"])) {
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
      if (containsAny(lower, ["no", "no thanks", "no gracias"])) {
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
      if (session.order.subtotalEstimate >= 45 && !session.order.paymentWarningGiven) {
        session.order.paymentWarningGiven = true;
        session.stage = "payment";
        reply =
          session.language === "spanish"
            ? "Antes de continuar, nuestra política requiere pago para órdenes de más de 50 dólares antes de enviarla. Puede pagar por teléfono o por un enlace seguro por mensaje. ¿Desea continuar?"
            : "Before we continue, our policy requires payment for orders over 50 dollars before we place the order. You can pay over the phone or through a secure text link. Would you like to continue?";
      } else {
        session.stage = "recap";
      }
    }

    if (!reply && session.stage === "payment") {
      if (containsAny(lower, ["no"])) {
        session.stage = "closing";
        reply =
          session.language === "spanish"
            ? "No hay problema. También puede hacer la orden en flapsandracks.com."
            : "No problem. You can also place the order online at flapsandracks.com.";
      } else {
        session.stage = "recap";
      }
    }

    if (!reply && session.stage === "recap") {
      reply =
        session.language === "spanish"
          ? `Permítame confirmar su orden. ${formatOrderSummary(session.order)}. ¿Está todo correcto?`
          : `Let me confirm your order. ${formatOrderSummary(session.order)}. Is everything correct?`;
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
            ? "Claro. Dígame qué quiere corregir."
            : "Of course. Tell me what you would like to correct.";
      }
    }

    if (!reply && session.stage === "order_name") {
      session.order.orderName = userSpeech;
      session.stage = "closing";
      reply =
        session.language === "spanish"
          ? "Perfecto. Su orden estará lista en aproximadamente 25 minutos. Gracias por llamar a Flaps and Racks."
          : "Perfect. Your order should be ready in about 25 minutes. Thank you for calling Flaps and Racks.";
    }

    if (!reply && session.stage === "closing") {
      reply =
        session.language === "spanish"
          ? "Gracias por llamar a Flaps and Racks."
          : "Thank you for calling Flaps and Racks.";
    }

    // Final fallback to AI, but never for greeting
    if (!reply) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "system",
            content: `Current stage: ${session.stage}. Language: ${session.language || "english"}. Current order: ${formatOrderSummary(session.order)}`
          },
          { role: "user", content: userSpeech || "Continue the order naturally without greeting again." }
        ]
      });

      reply =
        completion.choices?.[0]?.message?.content?.trim() ||
        "What can I get started for you today?";
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
