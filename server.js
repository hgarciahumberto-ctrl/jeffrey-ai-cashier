"use strict";

/**
 * Demo Mode Jeffrey 1.2
 * Presentation-first AI cashier backend for Flaps & Racks
 *
 * What this server does:
 * - Keeps lightweight in-memory sessions by callId
 * - Handles one polished demo order path
 * - Uses AI for fluid conversation, but keeps local memory/state
 * - Prevents robotic looping
 * - Supports English / Spanish choice
 *
 * Demo scope:
 * - greeting
 * - language choice
 * - wings order
 * - sauces
 * - dipping sauces
 * - one upsell
 * - recap
 * - customer name
 *
 * Notes:
 * - This is NOT the final production cashier
 * - Sessions are stored in memory only
 * - If Railway restarts, sessions are lost
 * - Good for owner demo / pilot proof of concept
 */

import express from "express";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in environment variables.");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * -----------------------------
 * In-memory session store
 * -----------------------------
 */
const sessions = new Map();

/**
 * -----------------------------
 * Demo menu knowledge
 * -----------------------------
 */
const DEMO_MENU = {
  wingStyles: ["traditional", "boneless"],
  wingQuantities: [6, 8, 10, 12, 16, 20, 24, 30, 40, 50],
  wingSauces: [
    "buffalo mild",
    "buffalo hot",
    "lime pepper",
    "garlic parmesan",
    "bbq",
    "mango habanero",
    "teriyaki",
    "sweet and spicy",
    "green chile",
    "bbq chiltepin",
    "citrus chipotle",
    "chocolate chiltepin",
    "plain"
  ],
  dipSauces: ["ranch", "blue cheese"],
  upsells: ["fries", "drink", "corn ribs", "mozzarella sticks"]
};

/**
 * -----------------------------
 * Utility helpers
 * -----------------------------
 */
function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s&']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(text = "") {
  return String(text)
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function createSession(callId) {
  return {
    callId,
    createdAt: nowIso(),
    updatedAt: nowIso(),

    language: null, // "english" | "spanish"
    stage: "language_choice",

    order: {
      toGo: true,
      items: [],
      dips: [],
      customerName: null
    },

    currentItem: {
      category: "wings",
      quantity: null,
      style: null,
      sauces: []
    },

    askHistory: [],
    lastQuestionKey: null,
    repeatCount: 0,
    turns: 0,
    recapDone: false,
    upsellAttempted: false,
    callClosed: false
  };
}

function getOrCreateSession(callId) {
  if (!callId) {
    throw new Error("callId is required");
  }
  if (!sessions.has(callId)) {
    sessions.set(callId, createSession(callId));
  }
  return sessions.get(callId);
}

function saveSession(session) {
  session.updatedAt = nowIso();
  sessions.set(session.callId, session);
}

function ask(session, questionKey) {
  if (session.lastQuestionKey === questionKey) {
    session.repeatCount += 1;
  } else {
    session.repeatCount = 0;
  }

  session.lastQuestionKey = questionKey;
  session.askHistory.push({
    at: nowIso(),
    questionKey
  });
}

function addWingItemToOrder(session) {
  const item = {
    category: "wings",
    quantity: session.currentItem.quantity,
    style: session.currentItem.style,
    sauces: [...session.currentItem.sauces]
  };

  session.order.items.push(item);

  session.currentItem = {
    category: "wings",
    quantity: null,
    style: null,
    sauces: []
  };
}

function summarizeOrder(order, language = "english") {
  const itemParts = order.items.map((item) => {
    const sauces = item.sauces.length ? item.sauces.join(" and ") : "plain";
    if (language === "spanish") {
      return `${item.quantity} alitas ${item.style === "traditional" ? "tradicionales" : "boneless"} con ${sauces}`;
    }
    return `${item.quantity} ${item.style} wings with ${sauces}`;
  });

  const dipsPart = order.dips.length
    ? language === "spanish"
      ? `dips: ${order.dips.map((d) => `${d.quantity} ${d.type}`).join(", ")}`
      : `dips: ${order.dips.map((d) => `${d.quantity} ${d.type}`).join(", ")}`
    : language === "spanish"
      ? "sin dips"
      : "no dips";

  const namePart = order.customerName
    ? language === "spanish"
      ? `a nombre de ${order.customerName}`
      : `under ${order.customerName}`
    : language === "spanish"
      ? "sin nombre aun"
      : "no name yet";

  return `${itemParts.join("; ")}; ${dipsPart}; ${namePart}`;
}

function findSauces(text) {
  const normalized = normalizeText(text);
  const found = [];

  for (const sauce of DEMO_MENU.wingSauces) {
    if (normalized.includes(sauce)) {
      found.push(sauce);
    }
  }

  if (normalized.includes("buffalo") && !found.includes("buffalo mild") && !found.includes("buffalo hot")) {
    found.push("buffalo mild");
  }

  if (normalized.includes("garlic parm") && !found.includes("garlic parmesan")) {
    found.push("garlic parmesan");
  }

  if (normalized.includes("sweet spicy") && !found.includes("sweet and spicy")) {
    found.push("sweet and spicy");
  }

  if (normalized.includes("plain") || normalized.includes("no sauce")) {
    found.push("plain");
  }

  return [...new Set(found)];
}

function findDips(text) {
  const normalized = normalizeText(text);
  const found = [];

  if (normalized.includes("ranch")) found.push("ranch");
  if (normalized.includes("blue cheese") || normalized.includes("bleu cheese")) found.push("blue cheese");

  return [...new Set(found)];
}

function findWingStyle(text) {
  const normalized = normalizeText(text);
  if (normalized.includes("traditional") || normalized.includes("bone in")) return "traditional";
  if (normalized.includes("boneless")) return "boneless";
  return null;
}

function findQuantity(text) {
  const normalized = normalizeText(text);

  const numericMatch = normalized.match(/\b(6|8|10|12|16|20|24|30|40|50)\b/);
  if (numericMatch) return Number(numericMatch[1]);

  const wordToNum = {
    six: 6,
    eight: 8,
    ten: 10,
    twelve: 12,
    sixteen: 16,
    twenty: 20,
    twentyfour: 24,
    thirty: 30,
    forty: 40,
    fifty: 50
  };

  const compact = normalized.replace(/\s+/g, "");
  for (const [word, num] of Object.entries(wordToNum)) {
    if (compact.includes(word)) return num;
  }

  return null;
}

function detectLanguageChoice(text) {
  const normalized = normalizeText(text);

  const englishSignals = ["english", "ingles", "in english"];
  const spanishSignals = ["spanish", "espanol", "español", "in spanish"];

  if (englishSignals.some((s) => normalized.includes(normalizeText(s)))) return "english";
  if (spanishSignals.some((s) => normalized.includes(normalizeText(s)))) return "spanish";

  return null;
}

function detectCompletion(text) {
  const normalized = normalizeText(text);
  const stopPhrases = [
    "thats all",
    "that's all",
    "nothing else",
    "im good",
    "i'm good",
    "no thats it",
    "no that's it",
    "done",
    "thats it",
    "that's it",
    "eso es todo",
    "nada mas",
    "nada más",
    "ya seria todo",
    "ya seria todo"
  ];

  return stopPhrases.some((p) => normalized.includes(normalizeText(p)));
}

function detectNegative(text) {
  const normalized = normalizeText(text);
  return ["no", "nope", "nah", "none", "ninguno", "ninguna"].some((p) =>
    normalized === normalizeText(p) || normalized.includes(` ${normalizeText(p)} `)
  );
}

function detectYes(text) {
  const normalized = normalizeText(text);
  return ["yes", "yeah", "yep", "sure", "ok", "okay", "si", "sí", "claro"].some((p) =>
    normalized === normalizeText(p) || normalized.includes(normalizeText(p))
  );
}

function findDipQuantity(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/\b(1|2|3|4)\b/);
  if (match) return Number(match[1]);

  if (normalized.includes("one")) return 1;
  if (normalized.includes("two")) return 2;
  if (normalized.includes("three")) return 3;
  if (normalized.includes("four")) return 4;

  if (normalized.includes("uno")) return 1;
  if (normalized.includes("dos")) return 2;
  if (normalized.includes("tres")) return 3;
  if (normalized.includes("cuatro")) return 4;

  return null;
}

function extractLikelyName(text) {
  const cleaned = String(text || "").trim();

  if (!cleaned) return null;
  if (cleaned.length > 40) return null;

  const normalized = normalizeText(cleaned);
  const badSignals = [
    "thats all",
    "that's all",
    "buffalo",
    "ranch",
    "traditional",
    "boneless",
    "wings",
    "fries",
    "drink"
  ];

  if (badSignals.some((s) => normalized.includes(normalizeText(s)))) return null;

  const patterns = [
    /my name is ([a-zA-Z\s'-]+)/i,
    /name is ([a-zA-Z\s'-]+)/i,
    /its ([a-zA-Z\s'-]+)/i,
    /it's ([a-zA-Z\s'-]+)/i,
    /this is ([a-zA-Z\s'-]+)/i,
    /^([a-zA-Z][a-zA-Z\s'-]{1,30})$/i
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      return titleCase(match[1].trim());
    }
  }

  return null;
}

function localIntentScan(text, session) {
  const sauces = findSauces(text);
  const dips = findDips(text);
  const quantity = findQuantity(text);
  const style = findWingStyle(text);
  const languageChoice = detectLanguageChoice(text);
  const done = detectCompletion(text);
  const negative = detectNegative(text);
  const positive = detectYes(text);
  const dipQty = findDipQuantity(text);
  const likelyName = extractLikelyName(text);

  return {
    quantity,
    style,
    sauces,
    dips,
    dipQty,
    languageChoice,
    done,
    negative,
    positive,
    likelyName,
    stage: session.stage
  };
}

function mergeLocalSignals(session, scan) {
  if (scan.languageChoice && !session.language) {
    session.language = scan.languageChoice;
  }

  if (scan.quantity && !session.currentItem.quantity) {
    session.currentItem.quantity = scan.quantity;
  }

  if (scan.style && !session.currentItem.style) {
    session.currentItem.style = scan.style;
  }

  if (scan.sauces.length) {
    for (const sauce of scan.sauces) {
      if (!session.currentItem.sauces.includes(sauce)) {
        if (session.currentItem.sauces.length < 2) {
          session.currentItem.sauces.push(sauce);
        }
      }
    }
  }

  // Context clue:
  // If wing sauce is already chosen and user says "ranch", treat as dip by default
  if (scan.dips.length && session.currentItem.sauces.length > 0 && session.stage === "dips") {
    for (const dipType of scan.dips) {
      const qty = scan.dipQty || 1;
      session.order.dips.push({ type: dipType, quantity: qty });
    }
  }

  if (scan.likelyName && !session.order.customerName && session.stage === "name") {
    session.order.customerName = scan.likelyName;
  }
}

function determineStage(session) {
  if (!session.language) return "language_choice";

  if (!session.currentItem.quantity || !session.currentItem.style) return "wings";

  if (!session.currentItem.sauces.length) return "wing_sauce";

  if (!session.recapDone && !session.upsellAttempted) return "upsell";

  if (!session.recapDone) return "dips";

  if (!session.order.customerName) return "name";

  return "close";
}

function buildRuleFallback(session) {
  const lang = session.language || "english";

  const antiLoop = session.repeatCount >= 2;

  const messages = {
    english: {
      language_choice: antiLoop
        ? "No problem. We can continue in English. What can I get started for you today?"
        : "Thank you for calling Flaps and Racks, this is Jeffrey. Would you like to continue in English or Spanish?",
      wings: antiLoop
        ? "You can tell me something like 12 traditional wings or 12 boneless wings."
        : "What wings can I get started for you today?",
      wing_sauce: antiLoop
        ? "No problem. You can choose a sauce like buffalo mild, lime pepper, garlic parmesan, or BBQ."
        : "What sauce would you like on those?",
      upsell: antiLoop
        ? "You’re all set on the wings. Would you like fries or a drink with that?"
        : "Would you like to add fries or a drink today?",
      dips: antiLoop
        ? "No problem. I can leave dips off, or add ranch or blue cheese."
        : "Any dipping sauce like ranch or blue cheese?",
      name: antiLoop
        ? "I just need a name for the order."
        : "Perfect. What name should I put on the order?",
      close: "Perfect. I have that ready. Thank you for calling Flaps and Racks."
    },
    spanish: {
      language_choice: antiLoop
        ? "No hay problema. Seguimos en español. ¿Qué le puedo preparar hoy?"
        : "Gracias por llamar a Flaps and Racks, le atiende Jeffrey. ¿Prefiere continuar en inglés o en español?",
      wings: antiLoop
        ? "Me puede decir algo como 12 alitas tradicionales o 12 boneless."
        : "¿Qué pedido le puedo tomar hoy?",
      wing_sauce: antiLoop
        ? "No hay problema. Puede escoger una salsa como buffalo mild, lime pepper, garlic parmesan o BBQ."
        : "¿Qué salsa le gustaría para esas alitas?",
      upsell: antiLoop
        ? "Sus alitas ya están listas. ¿Le gustaría agregar papas o una bebida?"
        : "¿Le gustaría agregar papas o una bebida?",
      dips: antiLoop
        ? "No hay problema. Puedo dejarlas sin dip o agregar ranch o blue cheese."
        : "¿Quiere algún dip como ranch o blue cheese?",
      name: antiLoop
        ? "Solo necesito el nombre para la orden."
        : "Perfecto. ¿A nombre de quién pongo la orden?",
      close: "Perfecto. Ya quedó listo. Gracias por llamar a Flaps and Racks."
    }
  };

  const stage = determineStage(session);
  ask(session, stage);
  return messages[lang][stage];
}

async function generateAiTurn(session, customerText) {
  const lang = session.language || "english";
  const orderSummary = summarizeOrder(session.order, lang);
  const currentItemSummary = JSON.stringify(session.currentItem);

  const systemPrompt = `
You are Jeffrey, a warm, natural, phone-order cashier for Flaps & Racks.

Mission:
Sound convincing, fluid, and reliable enough for an owner demo.
Do NOT sound robotic, legalistic, or overly scripted.
Keep responses short and natural.
One or two sentences is ideal.

You are in DEMO MODE, not full production mode.
Your job is to gracefully guide a simple order path:
1) language choice
2) wings
3) sauce
4) dips
5) one light upsell
6) recap
7) customer name
8) close

Behavior rules:
- Be friendly and concise.
- Do not over-explain.
- If the customer gives a short answer, treat it as normal.
- If context makes the answer obvious, move forward.
- Avoid repeating the exact same question wording.
- If confusion appears, recover gently instead of restarting.
- Never mention "demo mode", "AI", "system", "policy", or "state".
- Never sound like a bot menu.
- Use the current stage as guidance, but prioritize conversation flow.

Output format:
Return ONLY valid JSON with these keys:
{
  "assistantMessage": string,
  "stageDecision": string,
  "shouldFinalizeCurrentItem": boolean,
  "markRecapDone": boolean,
  "markUpsellAttempted": boolean,
  "captureDip": {
    "type": string | null,
    "quantity": number | null
  },
  "captureCustomerName": string | null
}

Allowed stageDecision values:
"language_choice", "wings", "wing_sauce", "upsell", "dips", "recap", "name", "close"

Current language: ${lang}
Current stage: ${session.stage}
Repeat count for last question: ${session.repeatCount}
Order summary so far: ${orderSummary}
Current item: ${currentItemSummary}

Demo menu hints:
- Wing styles: traditional, boneless
- Common wing sauces: buffalo mild, buffalo hot, lime pepper, garlic parmesan, bbq, mango habanero, teriyaki
- Dips: ranch, blue cheese
- Upsell options: fries or a drink

Important recap behavior:
- Once the item has quantity, style, and at least one sauce, you may guide to dips or upsell.
- Recap should sound natural, like "Let me read that back real quick..."
- Ask for customer name after recap.
- Closing should be brief and warm.

If the user already gave a valid name and stage is name, capture it.
`;

  const userPrompt = `
Customer said: "${customerText}"

Current local state:
${JSON.stringify(
  {
    language: session.language,
    stage: session.stage,
    order: session.order,
    currentItem: session.currentItem,
    repeatCount: session.repeatCount,
    recapDone: session.recapDone,
    upsellAttempted: session.upsellAttempted
  },
  null,
  2
)}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const parsed = safeJsonParse(raw, {});

    return {
      assistantMessage: parsed.assistantMessage || null,
      stageDecision: parsed.stageDecision || null,
      shouldFinalizeCurrentItem: Boolean(parsed.shouldFinalizeCurrentItem),
      markRecapDone: Boolean(parsed.markRecapDone),
      markUpsellAttempted: Boolean(parsed.markUpsellAttempted),
      captureDip: parsed.captureDip || { type: null, quantity: null },
      captureCustomerName: parsed.captureCustomerName || null
    };
  } catch (error) {
    console.error("OpenAI error:", error?.message || error);
    return null;
  }
}

function applyAiDecisions(session, ai) {
  if (!ai) return;

  if (
    ai.captureDip &&
    ai.captureDip.type &&
    DEMO_MENU.dipSauces.includes(ai.captureDip.type)
  ) {
    session.order.dips.push({
      type: ai.captureDip.type,
      quantity: Number(ai.captureDip.quantity) > 0 ? Number(ai.captureDip.quantity) : 1
    });
  }

  if (ai.captureCustomerName && !session.order.customerName) {
    session.order.customerName = titleCase(ai.captureCustomerName.trim());
  }

  if (ai.shouldFinalizeCurrentItem) {
    const ready =
      session.currentItem.quantity &&
      session.currentItem.style &&
      session.currentItem.sauces.length > 0;

    if (ready) {
      addWingItemToOrder(session);
    }
  }

  if (ai.markUpsellAttempted) {
    session.upsellAttempted = true;
  }

  if (ai.markRecapDone) {
    session.recapDone = true;
  }

  if (ai.stageDecision) {
    session.stage = ai.stageDecision;
  }
}

function enforceFlow(session, customerText, aiMessage) {
  const lang = session.language || "english";
  const normalized = normalizeText(customerText);

  // Auto-finalize wing item once it is complete and we're moving beyond wing_sauce
  const readyItem =
    session.currentItem.quantity &&
    session.currentItem.style &&
    session.currentItem.sauces.length > 0;

  if (
    readyItem &&
    session.order.items.length === 0 &&
    (session.stage === "upsell" || session.stage === "dips" || session.stage === "recap" || session.stage === "name" || session.stage === "close")
  ) {
    addWingItemToOrder(session);
  }

  // If upsell was attempted and user says no / that's all, move to recap
  if (
    session.stage === "upsell" &&
    (detectNegative(normalized) || detectCompletion(normalized))
  ) {
    session.upsellAttempted = true;
    session.stage = "recap";
  }

  // If dips stage and user says no, move to recap
  if (session.stage === "dips" && detectNegative(normalized)) {
    session.stage = "recap";
  }

  // If recap stage not yet marked, keep it
  if (session.stage === "recap" && !session.recapDone) {
    return lang === "spanish"
      ? `Permítame leerle la orden para confirmar. Llevo ${summarizeOrder(session.order, "spanish")}.`
      : `Let me read that back real quick. I have ${summarizeOrder(session.order, "english")}.`;
  }

  // If recap is done and no name, ask for name
  if (session.recapDone && !session.order.customerName) {
    session.stage = "name";
  }

  // If name captured, move to close
  if (session.order.customerName && session.recapDone) {
    session.stage = "close";
  }

  return aiMessage;
}

function greetingForStart(language = null) {
  if (language === "spanish") {
    return "Gracias por llamar a Flaps and Racks, le atiende Jeffrey. ¿Prefiere continuar en inglés o en español?";
  }
  return "Thank you for calling Flaps and Racks, this is Jeffrey. Would you like to continue in English or Spanish?";
}

/**
 * -----------------------------
 * Routes
 * -----------------------------
 */

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "Demo Mode Jeffrey 1.2",
    time: nowIso()
  });
});

});
  
// TWILIO CALL ENTRY
app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: "/speech",
    method: "POST",
    speechTimeout: "auto"
  });

  gather.say(
    "Thank you for calling Flaps and Racks. This is Jeffrey. Would you like to continue in English or Spanish?"
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

// SPEECH HANDLER
app.post("/speech", (req, res) => {
  const speech = req.body.SpeechResult || "";

  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: "/speech",
    method: "POST",
    speechTimeout: "auto"
  });

  gather.say(`You said ${speech}. Jeffrey is now learning this demo flow.`);

  res.type("text/xml");
  res.send(twiml.toString());
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "Demo Mode Jeffrey 1.2",
    sessions: sessions.size,
    time: nowIso()
  });
});

/**
 * Start a new call/session
 * Body:
 * {
 *   "callId": "abc123"
 * }
 */
app.post("/session/start", (req, res) => {
  try {
    const { callId } = req.body || {};
    const session = getOrCreateSession(callId);

    session.language = null;
    session.stage = "language_choice";
    session.turns = 0;
    session.callClosed = false;
    saveSession(session);

    res.json({
      ok: true,
      callId: session.callId,
      message: greetingForStart()
    });
  } catch (error) {
    console.error("/session/start error:", error);
    res.status(400).json({
      ok: false,
      error: error.message || "Unable to start session"
    });
  }
});

/**
 * Main conversation turn
 * Body:
 * {
 *   "callId": "abc123",
 *   "transcript": "12 traditional wings buffalo mild"
 * }
 */
app.post("/session/turn", async (req, res) => {
  try {
    const { callId, transcript } = req.body || {};
    if (!callId) {
      return res.status(400).json({ ok: false, error: "callId is required" });
    }

    const text = String(transcript || "").trim();
    const session = getOrCreateSession(callId);
    session.turns += 1;

    if (!text) {
      const fallback = buildRuleFallback(session);
      saveSession(session);
      return res.json({
        ok: true,
        callId,
        reply: fallback,
        state: {
          language: session.language,
          stage: session.stage,
          order: session.order,
          currentItem: session.currentItem
        }
      });
    }

    // 1) Local scan first
    const scan = localIntentScan(text, session);
    mergeLocalSignals(session, scan);

    // 2) Fast-path language selection
    if (!session.language && scan.languageChoice) {
      session.language = scan.languageChoice;
      session.stage = "wings";

      const reply =
        session.language === "spanish"
          ? "Perfecto. ¿Qué le puedo preparar hoy?"
          : "Perfect. What can I get started for you today?";

      saveSession(session);
      return res.json({
        ok: true,
        callId,
        reply,
        state: {
          language: session.language,
          stage: session.stage,
          order: session.order,
          currentItem: session.currentItem
        }
      });
    }

    // 3) Determine stage from current memory before AI
    session.stage = determineStage(session);

    // 4) Ask recap before AI when flow reaches that point
    const readyForRecap =
      session.language &&
      session.order.items.length > 0 &&
      !session.recapDone &&
      (session.stage === "name" || session.stage === "close" || detectCompletion(text));

    if (readyForRecap) {
      session.stage = "recap";
      const recapReply =
        session.language === "spanish"
          ? `Permítame leerle la orden para confirmar. Llevo ${summarizeOrder(session.order, "spanish")}. ¿Se escucha bien así?`
          : `Let me read that back real quick. I have ${summarizeOrder(session.order, "english")}. Does that sound right?`;

      session.recapDone = true;
      saveSession(session);

      return res.json({
        ok: true,
        callId,
        reply: recapReply,
        state: {
          language: session.language,
          stage: session.stage,
          order: session.order,
          currentItem: session.currentItem
        }
      });
    }

    // 5) Generate AI turn
    const ai = await generateAiTurn(session, text);
    applyAiDecisions(session, ai);

    // 6) Enforce flow safety
    let reply = enforceFlow(session, text, ai?.assistantMessage);

    // 7) Fallback if AI didn’t give a usable response
    if (!reply || typeof reply !== "string" || !reply.trim()) {
      reply = buildRuleFallback(session);
    }

    // 8) If recap is already done and user confirms, ask for name
    if (session.recapDone && !session.order.customerName && detectYes(text)) {
      session.stage = "name";
      reply =
        session.language === "spanish"
          ? "Perfecto. ¿A nombre de quién pongo la orden?"
          : "Perfect. What name should I put on the order?";
    }

    // 9) If name exists, close warmly
    if (session.order.customerName && session.recapDone) {
      session.stage = "close";
      session.callClosed = true;
      reply =
        session.language === "spanish"
          ? `Perfecto, ${session.order.customerName}. Su orden quedó lista para llevar. Gracias por llamar a Flaps and Racks.`
          : `Perfect, ${session.order.customerName}. Your to-go order is all set. Thank you for calling Flaps and Racks.`;
    }

    saveSession(session);

    return res.json({
      ok: true,
      callId,
      reply,
      state: {
        language: session.language,
        stage: session.stage,
        repeatCount: session.repeatCount,
        recapDone: session.recapDone,
        upsellAttempted: session.upsellAttempted,
        order: session.order,
        currentItem: session.currentItem
      }
    });
  } catch (error) {
    console.error("/session/turn error:", error);
    res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
});

/**
 * Inspect session state for debugging
 */
app.get("/session/:callId", (req, res) => {
  const { callId } = req.params;
  const session = sessions.get(callId);

  if (!session) {
    return res.status(404).json({
      ok: false,
      error: "Session not found"
    });
  }

  res.json({
    ok: true,
    session
  });
});

/**
 * End session and optionally delete it
 */
app.post("/session/end", (req, res) => {
  try {
    const { callId, deleteSession = false } = req.body || {};
    if (!callId) {
      return res.status(400).json({ ok: false, error: "callId is required" });
    }

    const session = sessions.get(callId);
    if (!session) {
      return res.json({ ok: true, message: "Session already ended or not found" });
    }

    session.callClosed = true;
    saveSession(session);

    if (deleteSession) {
      sessions.delete(callId);
    }

    res.json({
      ok: true,
      message: "Session ended",
      callId
    });
  } catch (error) {
    console.error("/session/end error:", error);
    res.status(500).json({
      ok: false,
      error: "Unable to end session"
    });
  }
});

/**
 * Optional cleanup route for testing
 */
app.post("/admin/clear-sessions", (_req, res) => {
  sessions.clear();
  res.json({
    ok: true,
    message: "All sessions cleared"
  });
});

app.listen(PORT, () => {
  console.log(`Demo Mode Jeffrey 1.2 listening on port ${PORT}`);
});
