import express from "express";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in environment variables.");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * --------------------------------
 * In-memory session store
 * --------------------------------
 */
const sessions = new Map();

/**
 * --------------------------------
 * Demo menu knowledge
 * --------------------------------
 */
const DEMO_MENU = {
  wingStyles: ["traditional", "boneless"],
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
  dipSauces: ["ranch", "blue cheese"]
};

/**
 * --------------------------------
 * Helpers
 * --------------------------------
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
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function xml(res, twiml) {
  res.type("text/xml");
  res.send(twiml.toString());
}

function createSession(callId) {
  return {
    callId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    language: null,
    stage: "language_choice",
    turns: 0,
    repeatCount: 0,
    lastQuestionKey: null,
    recapDone: false,
    upsellAttempted: false,
    callClosed: false,
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
    }
  };
}

function getOrCreateSession(callId) {
  if (!callId) throw new Error("callId is required");
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
}

function findSauces(text) {
  const normalized = normalizeText(text);
  const found = [];

  for (const sauce of DEMO_MENU.wingSauces) {
    if (normalized.includes(sauce)) found.push(sauce);
  }

  if (
    normalized.includes("buffalo") &&
    !found.includes("buffalo mild") &&
    !found.includes("buffalo hot")
  ) {
    found.push("buffalo mild");
  }

  if (normalized.includes("garlic parm") && !found.includes("garlic parmesan")) {
    found.push("garlic parmesan");
  }

  if (normalized.includes("no sauce") || normalized.includes("plain")) {
    if (!found.includes("plain")) found.push("plain");
  }

  return [...new Set(found)];
}

function findDips(text) {
  const normalized = normalizeText(text);
  const found = [];
  if (normalized.includes("ranch")) found.push("ranch");
  if (normalized.includes("blue cheese") || normalized.includes("bleu cheese")) {
    found.push("blue cheese");
  }
  return [...new Set(found)];
}

function findWingStyle(text) {
  const normalized = normalizeText(text);
  if (normalized.includes("traditional") || normalized.includes("bone in")) {
    return "traditional";
  }
  if (normalized.includes("boneless")) {
    return "boneless";
  }
  return null;
}

function findQuantity(text) {
  const normalized = normalizeText(text);

  const numericMatch = normalized.match(/\b(6|8|10|12|16|20|24|30|40|50)\b/);
  if (numericMatch) return Number(numericMatch[1]);

  const words = {
    six: 6,
    eight: 8,
    ten: 10,
    twelve: 12,
    sixteen: 16,
    twenty: 20,
    twentyfour: 24,
    thirty: 30,
    forty: 40,
    fifty: 50,
    seis: 6,
    ocho: 8,
    diez: 10,
    doce: 12,
    dieciseis: 16,
    veinte: 20,
    treinta: 30,
    cuarenta: 40,
    cincuenta: 50
  };

  const compact = normalized.replace(/\s+/g, "");
  for (const [word, num] of Object.entries(words)) {
    if (compact.includes(word)) return num;
  }

  return null;
}

function detectLanguageChoice(text) {
  const normalized = normalizeText(text);

  const englishSignals = ["english", "ingles", "in english"];
  const spanishSignals = ["spanish", "espanol", "español", "in spanish"];

  if (englishSignals.some((s) => normalized.includes(normalizeText(s)))) {
    return "english";
  }
  if (spanishSignals.some((s) => normalized.includes(normalizeText(s)))) {
    return "spanish";
  }
  return null;
}

function detectCompletion(text) {
  const normalized = normalizeText(text);
  const phrases = [
    "thats all",
    "that's all",
    "thats it",
    "that's it",
    "nothing else",
    "im good",
    "i'm good",
    "done",
    "eso es todo",
    "nada mas",
    "nada más",
    "ya seria todo",
    "ya sería todo"
  ];
  return phrases.some((p) => normalized.includes(normalizeText(p)));
}

function detectNegative(text) {
  const normalized = normalizeText(text);
  return ["no", "nope", "nah", "none", "ninguno", "ninguna"].some(
    (p) => normalized === normalizeText(p)
  );
}

function detectYes(text) {
  const normalized = normalizeText(text);
  return ["yes", "yeah", "yep", "sure", "ok", "okay", "si", "sí", "claro"].some(
    (p) => normalized === normalizeText(p) || normalized.includes(normalizeText(p))
  );
}

function findDipQuantity(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/\b(1|2|3|4)\b/);
  if (match) return Number(match[1]);

  if (normalized.includes("one") || normalized.includes("uno")) return 1;
  if (normalized.includes("two") || normalized.includes("dos")) return 2;
  if (normalized.includes("three") || normalized.includes("tres")) return 3;
  if (normalized.includes("four") || normalized.includes("cuatro")) return 4;

  return null;
}

function extractLikelyName(text) {
  const cleaned = String(text || "").trim();
  if (!cleaned || cleaned.length > 40) return null;

  const normalized = normalizeText(cleaned);
  const blocked = [
    "buffalo",
    "ranch",
    "traditional",
    "boneless",
    "wings",
    "fries",
    "drink",
    "thats all",
    "that's all"
  ];
  if (blocked.some((s) => normalized.includes(normalizeText(s)))) return null;

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
  return {
    quantity: findQuantity(text),
    style: findWingStyle(text),
    sauces: findSauces(text),
    dips: findDips(text),
    dipQty: findDipQuantity(text),
    languageChoice: detectLanguageChoice(text),
    done: detectCompletion(text),
    negative: detectNegative(text),
    positive: detectYes(text),
    likelyName: extractLikelyName(text),
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
      if (!session.currentItem.sauces.includes(sauce) && session.currentItem.sauces.length < 2) {
        session.currentItem.sauces.push(sauce);
      }
    }
  }

  if (scan.dips.length && session.stage === "dips") {
    for (const dipType of scan.dips) {
      session.order.dips.push({
        type: dipType,
        quantity: scan.dipQty || 1
      });
    }
  }

  if (scan.likelyName && session.stage === "name" && !session.order.customerName) {
    session.order.customerName = scan.likelyName;
  }
}

function addWingItemToOrder(session) {
  const ready =
    session.currentItem.quantity &&
    session.currentItem.style &&
    session.currentItem.sauces.length > 0;

  if (!ready) return;

  session.order.items.push({
    category: "wings",
    quantity: session.currentItem.quantity,
    style: session.currentItem.style,
    sauces: [...session.currentItem.sauces]
  });

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
    ? order.dips.map((d) => `${d.quantity} ${d.type}`).join(", ")
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

function determineStage(session) {
  if (!session.language) return "language_choice";
  if (!session.currentItem.quantity || !session.currentItem.style) return "wings";
  if (!session.currentItem.sauces.length) return "wing_sauce";
  if (!session.upsellAttempted) return "upsell";
  if (!session.recapDone && session.order.items.length === 0) return "dips";
  if (!session.recapDone) return "recap";
  if (!session.order.customerName) return "name";
  return "close";
}

function buildFallbackReply(session) {
  const lang = session.language || "english";
  const antiLoop = session.repeatCount >= 2;
  const stage = determineStage(session);
  ask(session, stage);

  const messages = {
    english: {
      language_choice: antiLoop
        ? "No problem. We can continue in English. What can I get started for you today?"
        : "Thank you for calling Flaps and Racks. This is Jeffrey. Would you like English or Spanish today?",
      wings: antiLoop
        ? "You can say something like 12 traditional wings or 12 boneless wings."
        : "What can I get started for you today?",
      wing_sauce: antiLoop
        ? "You can choose a sauce like buffalo mild, buffalo hot, lime pepper, garlic parmesan, or barbecue."
        : "What sauce would you like on those?",
      upsell: antiLoop
        ? "Would you like fries or a drink with that?"
        : "Would you like to add fries or a drink today?",
      dips: antiLoop
        ? "I can leave dips off, or add ranch or blue cheese."
        : "Any dipping sauce like ranch or blue cheese?",
      recap:
        "Let me read that back real quick.",
      name: antiLoop
        ? "I just need a name for the order."
        : "Perfect. What name should I put on the order?",
      close:
        "Perfect. Your order is all set. Thank you for calling Flaps and Racks."
    },
    spanish: {
      language_choice: antiLoop
        ? "No hay problema. Seguimos en español. ¿Qué le puedo preparar hoy?"
        : "Gracias por llamar a Flaps and Racks. Le atiende Jeffrey. ¿Prefiere inglés o español?",
      wings: antiLoop
        ? "Me puede decir algo como 12 alitas tradicionales o 12 boneless."
        : "¿Qué le puedo preparar hoy?",
      wing_sauce: antiLoop
        ? "Puede escoger una salsa como buffalo mild, buffalo hot, lime pepper, garlic parmesan o barbecue."
        : "¿Qué salsa le gustaría para esas alitas?",
      upsell: antiLoop
        ? "¿Le gustaría agregar papas o una bebida?"
        : "¿Le gustaría agregar papas o una bebida?",
      dips: antiLoop
        ? "Puedo dejarlas sin dip o agregar ranch o blue cheese."
        : "¿Quiere algún dip como ranch o blue cheese?",
      recap:
        "Permítame leerle la orden para confirmar.",
      name: antiLoop
        ? "Solo necesito el nombre para la orden."
        : "Perfecto. ¿A nombre de quién pongo la orden?",
      close:
        "Perfecto. Su orden quedó lista. Gracias por llamar a Flaps and Racks."
    }
  };

  return messages[lang][stage];
}

async function generateAiTurn(session, customerText) {
  const language = session.language || "english";
  const orderSummary = summarizeOrder(session.order, language);

  const systemPrompt = `
You are Jeffrey, a warm and natural phone-order cashier for Flaps and Racks.

Goal:
Sound fluid, believable, and reliable for a restaurant owner demo.

Keep replies:
- short
- natural
- warm
- conversational
- usually 1 or 2 sentences

Current purpose:
Guide a narrow order path:
1. language choice
2. wings
3. sauce
4. dipping sauce
5. one light upsell
6. recap
7. customer name
8. close

Rules:
- Do not sound robotic.
- Do not over-explain.
- Treat short answers as normal conversation.
- If context makes the answer obvious, move forward.
- Do not repeat the exact same question too many times.
- If uncertain, confirm lightly instead of restarting.
- Never mention AI, system, policy, state, or demo mode.

Return ONLY valid JSON:
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

Current language: ${language}
Current stage: ${session.stage}
Order summary: ${orderSummary}
Current item: ${JSON.stringify(session.currentItem)}
Repeat count: ${session.repeatCount}
`;

  const userPrompt = `
Customer said: "${customerText}"

Current state:
${JSON.stringify(
  {
    language: session.language,
    stage: session.stage,
    recapDone: session.recapDone,
    upsellAttempted: session.upsellAttempted,
    order: session.order,
    currentItem: session.currentItem
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
    addWingItemToOrder(session);
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
  const text = normalizeText(customerText);

  const readyItem =
    session.currentItem.quantity &&
    session.currentItem.style &&
    session.currentItem.sauces.length > 0;

  if (
    readyItem &&
    session.order.items.length === 0 &&
    ["upsell", "dips", "recap", "name", "close"].includes(session.stage)
  ) {
    addWingItemToOrder(session);
  }

  if (session.stage === "upsell" && (detectNegative(text) || detectCompletion(text))) {
    session.upsellAttempted = true;
    session.stage = "dips";
  }

  if (session.stage === "dips" && detectNegative(text)) {
    session.stage = "recap";
  }

  if (detectCompletion(text) && session.order.items.length > 0 && !session.recapDone) {
    session.stage = "recap";
  }

  if (session.stage === "recap" && !session.recapDone) {
    session.recapDone = true;
    return lang === "spanish"
      ? `Permítame leerle la orden para confirmar. Llevo ${summarizeOrder(session.order, "spanish")}. ¿Se escucha bien así?`
      : `Let me read that back real quick. I have ${summarizeOrder(session.order, "english")}. Does that sound right?`;
  }

  if (session.recapDone && !session.order.customerName && detectYes(text)) {
    session.stage = "name";
    return lang === "spanish"
      ? "Perfecto. ¿A nombre de quién pongo la orden?"
      : "Perfect. What name should I put on the order?";
  }

  if (session.recapDone && session.order.customerName) {
    session.stage = "close";
    session.callClosed = true;
    return lang === "spanish"
      ? `Perfecto, ${session.order.customerName}. Su orden quedó lista para llevar. Gracias por llamar a Flaps and Racks.`
      : `Perfect, ${session.order.customerName}. Your to-go order is all set. Thank you for calling Flaps and Racks.`;
  }

  return aiMessage;
}

/**
 * --------------------------------
 * Jeffrey engine
 * --------------------------------
 */
async function processJeffreyTurn(callId, transcript) {
  const session = getOrCreateSession(callId);
  session.turns += 1;

  const text = String(transcript || "").trim();

  if (!text) {
    const fallback = buildFallbackReply(session);
    saveSession(session);
    return fallback;
  }

  const scan = localIntentScan(text, session);
  mergeLocalSignals(session, scan);

  if (!session.language && scan.languageChoice) {
    session.language = scan.languageChoice;
    session.stage = "wings";
    saveSession(session);
    return session.language === "spanish"
      ? "Perfecto. ¿Qué le puedo preparar hoy?"
      : "Perfect. What can I get started for you today?";
  }

  session.stage = determineStage(session);

  const ai = await generateAiTurn(session, text);
  applyAiDecisions(session, ai);

  let reply = enforceFlow(session, text, ai?.assistantMessage);

  if (!reply || typeof reply !== "string" || !reply.trim()) {
    reply = buildFallbackReply(session);
  }

  saveSession(session);
  return reply;
}

/**
 * --------------------------------
 * Routes
 * --------------------------------
 */
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "Demo Mode Jeffrey 1.2",
    time: nowIso()
  });
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
 * Twilio entry route
 */
app.post("/voice", (req, res) => {
  try {
    const callId = req.body.CallSid || req.query.callId || `call-${Date.now()}`;
    const session = createSession(callId);
    sessions.set(callId, session);

    const twiml = new twilio.twiml.VoiceResponse();

    const gather = twiml.gather({
      input: "speech",
      action: `/speech?callId=${encodeURIComponent(callId)}`,
      method: "POST",
      speechTimeout: "auto"
    });

    gather.say(
      "Thank you for calling Flaps and Racks. This is Jeffrey. Would you like English or Spanish today?"
    );

    xml(res, twiml);
  } catch (error) {
    console.error("/voice error:", error);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("We are sorry, an application error has occurred.");
    xml(res, twiml);
  }
});

/**
 * Twilio speech loop
 */
app.post("/speech", async (req, res) => {
  try {
    const callId = req.query.callId || req.body.CallSid || `call-${Date.now()}`;
    const speech = req.body.SpeechResult || "";

    const reply = await processJeffreyTurn(callId, speech);

    const session = sessions.get(callId);
    const twiml = new twilio.twiml.VoiceResponse();

    if (session?.callClosed || session?.stage === "close") {
      twiml.say(reply);
      twiml.hangup();
      return xml(res, twiml);
    }

    const gather = twiml.gather({
      input: "speech",
      action: `/speech?callId=${encodeURIComponent(callId)}`,
      method: "POST",
      speechTimeout: "auto"
    });

    gather.say(reply);

    xml(res, twiml);
  } catch (error) {
    console.error("/speech error:", error);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("We are sorry, an application error has occurred.");
    xml(res, twiml);
  }
});

/**
 * API debug routes
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
      message: "Thank you for calling Flaps and Racks. This is Jeffrey. Would you like English or Spanish today?"
    });
  } catch (error) {
    console.error("/session/start error:", error);
    res.status(400).json({
      ok: false,
      error: error.message || "Unable to start session"
    });
  }
});

app.post("/session/turn", async (req, res) => {
  try {
    const { callId, transcript } = req.body || {};
    if (!callId) {
      return res.status(400).json({ ok: false, error: "callId is required" });
    }

    const reply = await processJeffreyTurn(callId, transcript);

    const session = sessions.get(callId);

    res.json({
      ok: true,
      callId,
      reply,
      state: session
    });
  } catch (error) {
    console.error("/session/turn error:", error);
    res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
});

app.get("/session/:callId", (req, res) => {
  const session = sessions.get(req.params.callId);

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
