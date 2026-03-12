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
    orderName: null,
    extraRequests: []
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
function stripAccents(text) {
  return (text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(text) {
  return stripAccents(text || "")
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text, words) {
  return words.some((w) => text.includes(w));
}

function detectLanguage(text) {
  const lower = normalizeText(text);
  if (
    containsAny(lower, [
      "espanol",
      "quiero",
      "orden",
      "para llevar",
      "si",
      "alitas",
      "con hueso",
      "sin hueso",
      "nada mas",
      "eso seria todo"
    ])
  ) {
    return "spanish";
  }
  return "english";
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
  const traditional = {
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
  return type === "boneless" ? boneless[qty] || 0 : traditional[qty] || 0;
}

function addItemToOrder(session, item) {
  session.order.items.push(item);
  session.order.subtotalEstimate += item.estimatedPrice || 0;
  session.currentItem = null;
}

function summarizeCountedList(items) {
  const counts = {};
  for (const item of items) {
    counts[item] = (counts[item] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => `${count} ${name}`)
    .join(", ");
}

function formatOrderSummary(order) {
  if (!order.items.length && !order.extraRequests.length) {
    return "No items on the order yet.";
  }

  const lines = [];

  for (const item of order.items) {
    let line = item.name;

    if (item.details?.wingType) line += `, ${item.details.wingType}`;
    if (item.details?.quantity) line += `, ${item.details.quantity} pieces`;

    if (item.details?.sauces?.length) {
      line += `, sauces: ${item.details.sauces.join(", ")}`;
    } else if (item.details?.saucesConfirmed) {
      line += `, no sauce`;
    }

    if (item.details?.dips?.length) {
      line += `, dips: ${summarizeCountedList(item.details.dips)}`;
    } else if (item.details?.dipsConfirmed) {
      line += `, no dip`;
    }

    if (item.details?.side) line += `, side: ${item.details.side}`;
    if (item.details?.drink) line += `, drink: ${item.details.drink}`;
    if (item.details?.notes?.length) line += `, notes: ${item.details.notes.join(", ")}`;

    lines.push(line);
  }

  if (order.extraRequests.length) {
    lines.push(`extra sauces on the side: ${summarizeCountedList(order.extraRequests)}`);
  }

  return lines.join(". ");
}

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
      "bone in",
      "bone-in",
      "con hueso"
    ])
  ) {
    wingType = "traditional";
  } else if (containsAny(lower, ["boneless", "sin hueso"])) {
    wingType = "boneless";
  }

  const mentionsWings = containsAny(lower, ["wings", "wing", "alitas"]);
  return { qty, wingType, mentionsWings };
}

function parseSauces(text) {
  const lower = normalizeText(text);

  const sauceAliases = [
    { key: "al pastor", aliases: ["al pastor"] },
    { key: "bbq chiltepin", aliases: ["bbq chiltepin", "barbecue chiltepin"] },
    { key: "buffalo hot", aliases: ["buffalo hot"] },
    { key: "buffalo mild", aliases: ["buffalo mild"] },
    { key: "buffalo medium", aliases: ["buffalo medium"] },
    { key: "chocolate chiltepin", aliases: ["chocolate chiltepin"] },
    { key: "chorizo", aliases: ["chorizo"] },
    { key: "cinnamon roll", aliases: ["cinnamon roll"] },
    { key: "citrus chipotle", aliases: ["citrus chipotle"] },
    { key: "garlic parmesan", aliases: ["garlic parmesan"] },
    { key: "green chile", aliases: ["green chile", "green chili"] },
    { key: "lime pepper", aliases: ["lime pepper"] },
    { key: "mango habanero", aliases: ["mango habanero"] },
    { key: "pizza", aliases: ["pizza"] },
    { key: "sweet and spicy", aliases: ["sweet and spicy", "sweet n spicy"] },
    { key: "teriyaki", aliases: ["teriyaki"] },
    { key: "bbq", aliases: ["bbq", "barbecue"] },
    { key: "hot", aliases: ["hot"] },
    { key: "mild", aliases: ["mild"] }
  ];

  const found = [];

  for (const sauce of sauceAliases) {
    if (sauce.aliases.some((alias) => lower.includes(alias))) {
      found.push(sauce.key);
    }
  }

  const unique = [...new Set(found)];

  if (unique.includes("buffalo hot") && unique.includes("hot")) {
    return unique.filter((s) => s !== "hot");
  }
  if (unique.includes("buffalo mild") && unique.includes("mild")) {
    return unique.filter((s) => s !== "mild");
  }

  return unique;
}

function getNumberValue(word) {
  const normalized = normalizeText(word);
  const map = {
    "1": 1,
    one: 1,
    un: 1,
    uno: 1,
    una: 1,
    "2": 2,
    two: 2,
    dos: 2,
    "3": 3,
    three: 3,
    tres: 3,
    "4": 4,
    four: 4,
    cuatro: 4,
    "5": 5,
    five: 5,
    cinco: 5,
    "6": 6,
    six: 6,
    seis: 6,
    "7": 7,
    seven: 7,
    siete: 7,
    "8": 8,
    eight: 8,
    ocho: 8
  };
  return map[normalized] || null;
}

function parseDipRequest(text, includedCount = 0) {
  const lower = normalizeText(text);

  const dipNames = [
    { key: "chipotle ranch", aliases: ["chipotle ranch"] },
    { key: "jalapeño ranch", aliases: ["jalapeno ranch", "jalapeno", "jalapeño ranch", "jalapeño"] },
    { key: "blue cheese", aliases: ["blue cheese"] },
    { key: "ranch", aliases: ["ranch", "ranches"] }
  ];

  const result = [];

  for (const dip of dipNames) {
    for (const alias of dip.aliases) {
      if (lower.includes(alias)) {
        let count = 1;

        const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const beforeMatch = lower.match(new RegExp(`\\b(\\d+|one|two|three|four|five|six|seven|eight|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho)\\b\\s+${escapedAlias}`));
        const afterMatch = lower.match(new RegExp(`${escapedAlias}\\s+\\b(\\d+|one|two|three|four|five|six|seven|eight|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho)\\b`));

        if (beforeMatch) {
          count = getNumberValue(beforeMatch[1]) || 1;
        } else if (afterMatch) {
          count = getNumberValue(afterMatch[1]) || 1;
        } else if (
          containsAny(lower, [
            `all ${alias}`,
            `just ${alias}`,
            `only ${alias}`,
            `todo ${alias}`,
            `todos ${alias}`,
            `solo ${alias}`
          ])
        ) {
          count = includedCount > 0 ? includedCount : 1;
        }

        for (let i = 0; i < count; i++) {
          result.push(dip.key);
        }
        break;
      }
    }
  }

  if (result.length === 1 && includedCount > 1) {
    if (
      containsAny(lower, [
        "just ranch",
        "only ranch",
        "all ranch",
        "solo ranch",
        "puro ranch",
        "todo ranch",
        "todos ranch"
      ]) ||
      (!lower.includes(" and ") && !lower.includes(" y "))
    ) {
      return Array(includedCount).fill(result[0]);
    }
  }

  return result.slice(0, includedCount || result.length);
}

function userSaysNoSauce(text) {
  const lower = normalizeText(text);
  return containsAny(lower, [
    "no sauce",
    "plain",
    "dry",
    "plain wings",
    "sin salsa",
    "sin salsas",
    "naturales"
  ]);
}

function userSaysNoDip(text) {
  const lower = normalizeText(text);
  return containsAny(lower, [
    "no dip",
    "no dips",
    "no dressing",
    "no dressings",
    "no ranch",
    "none",
    "ninguno",
    "ninguna",
    "sin aderezo",
    "sin aderezos"
  ]);
}

function isYesPhrase(text) {
  const lower = normalizeText(text);
  return containsAny(lower, [
    "yes",
    "yeah",
    "yep",
    "sure",
    "ok",
    "okay",
    "si",
    "sí",
    "claro"
  ]);
}

function isNoPhrase(text) {
  const lower = normalizeText(text);
  return containsAny(lower, [
    "no",
    "nope",
    "no thanks",
    "no thank you",
    "no gracias"
  ]);
}

function isTransferRequest(text) {
  const lower = normalizeText(text);
  return containsAny(lower, [
    "manager",
    "person",
    "human",
    "representative",
    "someone",
    "employee",
    "cashier",
    "operator",
    "speak to someone",
    "hablar con alguien",
    "gerente",
    "persona"
  ]);
}

function nextQuestionForWings(session) {
  const item = session.currentItem;
  if (!item) return null;

  const sauceLimit = getIncludedSauceLimit(item.details.quantity);
  const dipLimit = getIncludedDips(item.details.quantity);

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

  if (!item.details.saucesConfirmed) {
    return session.language === "spanish"
      ? `Perfecto. Esa orden incluye hasta ${sauceLimit} salsa${sauceLimit > 1 ? "s" : ""}. ¿Qué salsa le gustaría?`
      : `Perfect. That order includes up to ${sauceLimit} sauce${sauceLimit > 1 ? "s" : ""}. What sauce would you like?`;
  }

  if (!item.details.dipsConfirmed) {
    return session.language === "spanish"
      ? `Perfecto. Esa orden incluye ${dipLimit} aderezo${dipLimit > 1 ? "s" : ""}. ¿Qué aderezo le gustaría? Puede decir, por ejemplo, ${dipLimit === 2 ? "dos ranch, o un ranch y un blue cheese" : "ranch, blue cheese, chipotle ranch o jalapeño ranch"}.`
      : `Perfect. That order includes ${dipLimit} dipping sauce${dipLimit > 1 ? "s" : ""}. What dipping sauce would you like? You can say, for example, ${dipLimit === 2 ? "two ranch, or one ranch and one blue cheese" : "ranch, blue cheese, chipotle ranch, or jalapeño ranch"}.`;
  }

  return null;
}

function isEndOfOrderPhrase(text) {
  const lower = normalizeText(text);
  return containsAny(lower, [
    "that will be it",
    "thatll be it",
    "that is all",
    "thats all",
    "that's all",
    "that is it",
    "that will be all",
    "thank you",
    "thank you thats all",
    "thank you that's all",
    "no thats all",
    "no that's all",
    "no thank you",
    "nothing else",
    "nothing more",
    "nada mas",
    "eso seria todo",
    "ya seria todo",
    "seria todo"
  ]);
}

function maybeAddExtrasToOrder(session, text) {
  const sauces = parseSauces(text);
  const dips = parseDipRequest(text, 8);
  const extras = [...dips, ...sauces];

  if (extras.length) {
    session.order.extraRequests.push(...extras);
    session.order.subtotalEstimate += extras.length * 0.75;
    return true;
  }

  return false;
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
// Health Routes
// ----------------------------------
app.get("/", (_req, res) => {
  res.send("Jeffrey AI cashier is running.");
});

app.get("/voice", (_req, res) => {
  res.type("text/plain").send("Voice endpoint is live.");
});

// ----------------------------------
// Main Voice Route
// ----------------------------------
app.post("/voice", async (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const callSid = req.body.CallSid || "unknown-call";
  const userSpeech = (req.body.SpeechResult || "").trim();
  const lower = normalizeText(userSpeech);
  const session = getSession(callSid);

  console.log("Incoming voice webhook:", {
    callSid: req.body.CallSid,
    speech: req.body.SpeechResult,
    from: req.body.From,
    to: req.body.To
  });

  try {
    let reply = "";

    if (!session.greeted && !userSpeech) {
      session.greeted = true;
      session.stage = "language";
      reply =
        "Thank you for calling Flaps and Racks. This is Jeffrey. Would you like to order in English or en Español?";
    }

    if (!reply && isTransferRequest(userSpeech)) {
      reply =
        session.language === "spanish"
          ? "Claro. Un momento por favor mientras le ayudo con eso."
          : "Of course. One moment please while I help with that.";
    }

    if (!reply && session.stage === "language") {
      if (userSpeech) {
        session.language = detectLanguage(userSpeech);

        if (containsAny(lower, ["english", "ingles", "inglés"])) {
          session.language = "english";
        }
        if (containsAny(lower, ["espanol", "español", "spanish"])) {
          session.language = "spanish";
        }

        session.stage = "order_type";
        reply =
          session.language === "spanish"
            ? "Perfecto. ¿Este pedido será para llevar?"
            : "Perfect. Will this order be To-Go?";
      }
    }

    if (!reply && session.stage === "order_type") {
      if (
        containsAny(lower, [
          "yes",
          "si",
          "sí",
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
            saucesConfirmed: false,
            dipsConfirmed: false,
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

    if (!reply && session.stage === "wings_detail" && session.currentItem?.type === "wings") {
      const item = session.currentItem;
      const parsedWing = parseWingInput(userSpeech);

      if (!item.details.wingType && parsedWing.wingType) {
        item.details.wingType = parsedWing.wingType;
        item.name = parsedWing.wingType === "boneless" ? "Boneless Wings" : "Traditional Wings";
      }

      if (!item.details.quantity && parsedWing.qty) {
        item.details.quantity = parsedWing.qty;
        item.estimatedPrice = estimateWingPrice(item.details.wingType || "traditional", parsedWing.qty);
      }

      if (item.details.quantity) {
        const sauceLimit = getIncludedSauceLimit(item.details.quantity);
        const dipLimit = getIncludedDips(item.details.quantity);

        const sauces = parseSauces(userSpeech);
        const dips = parseDipRequest(userSpeech, dipLimit);

        if (!item.details.saucesConfirmed) {
          if (sauces.length) {
            item.details.sauces = sauces.slice(0, sauceLimit);
            item.details.saucesConfirmed = true;
          } else if (userSaysNoSauce(userSpeech)) {
            item.details.sauces = [];
            item.details.saucesConfirmed = true;
          }
        }

        if (!item.details.dipsConfirmed) {
          if (dips.length) {
            item.details.dips = dips.slice(0, dipLimit);
            item.details.dipsConfirmed = true;
          } else if (userSaysNoDip(userSpeech)) {
            item.details.dips = [];
            item.details.dipsConfirmed = true;
          }
        }

        if (
          !item.details.saucesConfirmed &&
          item.details.wingType &&
          item.details.quantity &&
          userSpeech &&
          !sauces.length &&
          dips.length
        ) {
          reply = session.language === "spanish"
            ? "Perfecto. Ya anoté los aderezos. Ahora, ¿qué salsa le gustaría para las alitas?"
            : "Perfect. I got the dips. Now, what sauce would you like for the wings?";
        }

        if (
          !reply &&
          !item.details.dipsConfirmed &&
          item.details.saucesConfirmed &&
          userSpeech &&
          sauces.length &&
          !dips.length &&
          containsAny(lower, ["thats it", "that's it", "that is all", "nada mas", "seria todo"])
        ) {
          item.details.dips = [];
          item.details.dipsConfirmed = true;
        }
      }

      if (!reply) {
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
    }

    if (!reply && session.stage === "corn_ribs_sauce" && session.currentItem?.name === "Corn Ribs") {
      const sauces = parseSauces(userSpeech);

      if (sauces.length) {
        session.currentItem.details.sauces = [sauces[0]];
      } else if (userSaysNoSauce(userSpeech)) {
        session.currentItem.details.sauces = [];
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

    if (!reply && session.stage === "next_item") {
      if (isEndOfOrderPhrase(userSpeech)) {
        if (!session.order.upsellOffered) {
          session.order.upsellOffered = true;
          session.stage = "upsell";
          reply =
            session.language === "spanish"
              ? "Antes de terminar, ¿le gustaría agregar corn ribs, mozzarella sticks o mac bites?"
              : "Before I finish, would you like to add corn ribs, mozzarella sticks, or mac bites?";
        } else {
          session.stage = "extras";
          reply =
            session.language === "spanish"
              ? "¿Le gustaría alguna salsa o aderezo extra al lado? Cuestan 75 centavos cada uno."
              : "Would you like any extra sauces or extra dressings on the side? They are 75 cents each.";
        }
      } else if (userSpeech) {
        session.stage = "item_capture";
      }
    }

    if (!reply && session.stage === "upsell") {
      if (isNoPhrase(userSpeech)) {
        session.stage = "extras";
        reply =
          session.language === "spanish"
            ? "¿Le gustaría alguna salsa o aderezo extra al lado? Cuestan 75 centavos cada uno."
            : "Would you like any extra sauces or extra dressings on the side? They are 75 cents each.";
      } else if (userSpeech) {
        session.stage = "item_capture";
      }
    }

    if (!reply && session.stage === "extras") {
      session.order.extraSauceAsked = true;

      if (isNoPhrase(userSpeech)) {
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
      } else if (maybeAddExtrasToOrder(session, userSpeech)) {
        if (session.order.subtotalEstimate >= 45 && !session.order.paymentWarningGiven) {
          session.order.paymentWarningGiven = true;
          session.stage = "payment";
          reply =
            session.language === "spanish"
              ? "Perfecto. Ya agregué las salsas extra. Antes de continuar, nuestra política requiere pago para órdenes de más de 50 dólares antes de enviarla. Puede pagar por teléfono o por un enlace seguro por mensaje. ¿Desea continuar?"
              : "Perfect. I added the extra sauces. Before we continue, our policy requires payment for orders over 50 dollars before we place the order. You can pay over the phone or through a secure text link. Would you like to continue?";
        } else {
          session.stage = "recap";
        }
      } else if (isYesPhrase(userSpeech)) {
        session.stage = "extras_detail";
        reply =
          session.language === "spanish"
            ? "Claro. ¿Qué salsa o aderezo extra le gustaría?"
            : "Of course. What extra sauce or dressing would you like?";
      } else if (userSpeech) {
        session.stage = "extras_detail";
        reply =
          session.language === "spanish"
            ? "Claro. Dígame qué salsa o aderezo extra le gustaría."
            : "Sure. Tell me which extra sauce or dressing you would like.";
      }
    }

    if (!reply && session.stage === "extras_detail") {
      if (maybeAddExtrasToOrder(session, userSpeech)) {
        if (session.order.subtotalEstimate >= 45 && !session.order.paymentWarningGiven) {
          session.order.paymentWarningGiven = true;
          session.stage = "payment";
          reply =
            session.language === "spanish"
              ? "Perfecto. Ya agregué las salsas extra. Antes de continuar, nuestra política requiere pago para órdenes de más de 50 dólares antes de enviarla. Puede pagar por teléfono o por un enlace seguro por mensaje. ¿Desea continuar?"
              : "Perfect. I added the extra sauces. Before we continue, our policy requires payment for orders over 50 dollars before we place the order. You can pay over the phone or through a secure text link. Would you like to continue?";
        } else {
          session.stage = "recap";
        }
      } else if (isNoPhrase(userSpeech)) {
        session.stage = "recap";
      } else {
        reply =
          session.language === "spanish"
            ? "Perdón, no entendí la salsa extra. Puede decir, por ejemplo, ranch, blue cheese, buffalo mild o lime pepper."
            : "Sorry, I did not catch the extra sauce. You can say, for example, ranch, blue cheese, buffalo mild, or lime pepper.";
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
      if (containsAny(lower, ["yes", "si", "sí", "correct", "correcto"])) {
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
      {
        voice: "Polly.Joanna-Generative",
        language: session.language === "spanish" ? "es-MX" : "en-US"
      },
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

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Jeffrey AI cashier running on port " + PORT);
});
