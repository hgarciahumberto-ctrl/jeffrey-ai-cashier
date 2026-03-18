const express = require("express");
const bodyParser = require("body-parser");
const { twiml: { VoiceResponse } } = require("twilio");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ------------------------
// In-memory sessions
// ------------------------
const sessions = new Map();

// ------------------------
// Menu data from Flaps & Racks board
// ------------------------
const VALID_WING_COUNTS = [6, 9, 12, 18, 24, 48];

const SAUCE_ALIASES = {
  "al pastor": ["al pastor"],
  "barbeque": ["barbecue", "barbeque", "bbq"],
  "barbeque chiltepin": ["barbeque chiltepin", "barbecue chiltepin", "bbq chiltepin"],
  "chorizo": ["chorizo"],
  "chocolate chiltepin": ["chocolate chiltepin"],
  "cinnamon roll": ["cinnamon roll"],
  "citrus chipotle": ["citrus chipotle"],
  "garlic parmesan": ["garlic parmesan", "garlic parm", "garlic parmeasan", "garlic parmesean"],
  "green chile": ["green chile", "green chili"],
  "hot": ["hot", "buffalo hot"],
  "lime pepper": ["lime pepper", "lemon pepper"],
  "mild": ["mild", "buffalo mild"],
  "mango habanero": ["mango habanero"],
  "pizza": ["pizza"],
  "teriyaki": ["teriyaki"]
};

const DIP_ALIASES = {
  "ranch": ["ranch", "ranches"],
  "blue cheese": ["blue cheese", "bleu cheese"]
};

const SIDE_ALIASES = {
  "fries": ["fries", "french fries"],
  "mac bites": ["mac bites", "macbite", "mac and cheese bites"],
  "mozzarella sticks": ["mozzarella sticks", "mozz sticks", "mozzarella"],
  "onion rings": ["onion rings"],
  "potato salad": ["potato salad"],
  "sweet potato fries": ["sweet potato fries", "sweet potato"],
  "flyin corn": ["flyin corn", "flying corn"],
  "corn ribs": ["corn ribs"],
  "buffalo ranch fries": ["buffalo ranch fries"],
  "sampler platter": ["sampler platter", "sampler"]
};

const STYLE_ALIASES = {
  "traditional": ["traditional", "bone in", "bone-in", "classic wings"],
  "boneless": ["boneless"]
};

const NUMBER_WORDS = {
  "one": 1,
  "two": 2,
  "three": 3,
  "four": 4,
  "five": 5,
  "six": 6,
  "seven": 7,
  "eight": 8,
  "nine": 9,
  "ten": 10,
  "eleven": 11,
  "twelve": 12,
  "thirteen": 13,
  "fourteen": 14,
  "fifteen": 15,
  "sixteen": 16,
  "seventeen": 17,
  "eighteen": 18,
  "nineteen": 19,
  "twenty": 20,
  "twenty four": 24,
  "twenty-four": 24,
  "forty eight": 48,
  "forty-eight": 48
};

const FRIENDLY_OPENERS = [
  "Got it.",
  "Perfect.",
  "Sounds good.",
  "Sure thing.",
  "Alright."
];

const ANYTHING_ELSE_LINES = [
  "Anything else for you today?",
  "Want to add fries or corn ribs with that?",
  "Mozzarella sticks and mac bites are really popular, want to add one?",
  "Can I get you a side to go with that?"
];

const POPULAR_SAUCES = ["mild", "lime pepper", "garlic parmesan", "mango habanero"];

// ------------------------
// Helpers
// ------------------------
function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, buildFreshSession());
  }
  return sessions.get(callSid);
}

function buildFreshSession() {
  return {
    stage: "language",
    language: "en",
    order: {
      quantity: null,
      style: null,
      sauce: null,
      sauce2: null,
      splitSauce: false,
      dip: null,
      dipQty: null,
      side: null,
      name: null
    }
  };
}

function resetForNewCall(session) {
  const fresh = buildFreshSession();
  session.stage = fresh.stage;
  session.language = fresh.language;
  session.order = fresh.order;
}

function normalizeText(text = "") {
  return text
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function speak(res, message, action = "/speech", callSid = "", hangup = false) {
  const vr = new VoiceResponse();

  if (hangup) {
    vr.say({ voice: "alice" }, message);
    vr.hangup();
    return res.type("text/xml").send(vr.toString());
  }

  const gather = vr.gather({
    input: "speech",
    action,
    method: "POST",
    speechTimeout: "auto",
    timeout: 4,
    enhanced: true
  });

  gather.say({ voice: "alice" }, message);

  return res.type("text/xml").send(vr.toString());
}

function isYes(text) {
  const t = normalizeText(text);
  return [
    "yes",
    "yeah",
    "yep",
    "sure",
    "okay",
    "ok",
    "correct"
  ].includes(t);
}

function isNo(text) {
  const t = normalizeText(text);
  return [
    "no",
    "nope",
    "that's all",
    "that is all",
    "nothing else",
    "done",
    "no that's it",
    "no that is it"
  ].includes(t);
}

function isDone(text) {
  return isNo(text);
}

function wordToNumber(word) {
  const t = normalizeText(word);
  if (NUMBER_WORDS[t] != null) return NUMBER_WORDS[t];
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function extractFirstNumber(text) {
  const t = normalizeText(text);

  const digitMatch = t.match(/\b\d+\b/);
  if (digitMatch) return parseInt(digitMatch[0], 10);

  const phrases = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    if (t.includes(phrase)) return NUMBER_WORDS[phrase];
  }

  return null;
}

function matchAlias(text, aliasMap) {
  const t = normalizeText(text);
  for (const [canonical, aliases] of Object.entries(aliasMap)) {
    for (const alias of aliases) {
      if (t.includes(alias)) return canonical;
    }
  }
  return null;
}

function extractAllMatches(text, aliasMap) {
  const t = normalizeText(text);
  const found = [];

  for (const [canonical, aliases] of Object.entries(aliasMap)) {
    for (const alias of aliases) {
      if (t.includes(alias)) {
        found.push(canonical);
        break;
      }
    }
  }

  return [...new Set(found)];
}

function extractStyle(text) {
  return matchAlias(text, STYLE_ALIASES);
}

function extractDip(text) {
  return matchAlias(text, DIP_ALIASES);
}

function extractSide(text) {
  return matchAlias(text, SIDE_ALIASES);
}

function extractDipQuantity(text) {
  const t = normalizeText(text);

  const patterns = [
    /\b(\d+)\s+(ranch|ranches|blue cheese|bleu cheese)\b/,
    /\b(one|two|three|four|five|six)\s+(ranch|ranches|blue cheese|bleu cheese)\b/
  ];

  for (const pattern of patterns) {
    const m = t.match(pattern);
    if (m) {
      return wordToNumber(m[1]);
    }
  }

  if (extractDip(text)) return 1;
  return null;
}

function extractName(text) {
  const raw = text.trim();

  const patterns = [
    /my name is ([a-zA-Z\s'-]+)/i,
    /it's ([a-zA-Z\s'-]+)/i,
    /it is ([a-zA-Z\s'-]+)/i,
    /this is ([a-zA-Z\s'-]+)/i,
    /^([a-zA-Z\s'-]{2,})$/i
  ];

  for (const pattern of patterns) {
    const m = raw.match(pattern);
    if (m && m[1]) {
      return m[1]
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  return null;
}

function extractSauces(text) {
  return extractAllMatches(text, SAUCE_ALIASES);
}

function isValidWingQuantity(quantity) {
  return VALID_WING_COUNTS.includes(quantity);
}

function parseOrderFromSpeech(text) {
  const t = normalizeText(text);

  let quantity = extractFirstNumber(t);
  if (quantity != null && !isValidWingQuantity(quantity)) {
    quantity = null;
  }

  const style = extractStyle(t);
  const sauces = extractSauces(t);
  const dip = extractDip(t);
  const dipQty = extractDipQuantity(t);
  const side = extractSide(t);

  const splitSauceHints = [
    "half",
    "split",
    "half and half",
    "one half"
  ].some(hint => t.includes(hint));

  let sauce = null;
  let sauce2 = null;
  let splitSauce = false;

  if (sauces.length >= 2) {
    sauce = sauces[0];
    sauce2 = sauces[1];
    splitSauce = splitSauceHints || t.includes(" and ");
  } else if (sauces.length === 1) {
    sauce = sauces[0];
  }

  return {
    quantity,
    style,
    sauce,
    sauce2,
    splitSauce,
    dip,
    dipQty,
    side
  };
}

function mergeOrder(order, parsed) {
  if (parsed.quantity != null) order.quantity = parsed.quantity;
  if (parsed.style) order.style = parsed.style;
  if (parsed.sauce) order.sauce = parsed.sauce;
  if (parsed.sauce2) order.sauce2 = parsed.sauce2;
  if (parsed.splitSauce) order.splitSauce = true;
  if (parsed.dip) order.dip = parsed.dip;
  if (parsed.dipQty != null) order.dipQty = parsed.dipQty;
  if (parsed.side) order.side = parsed.side;
}

function dipText(order) {
  if (!order.dip) return null;

  const qty = order.dipQty || 1;

  if (qty === 1) return order.dip;
  if (order.dip === "ranch") return `${qty} ranches`;

  return `${qty} ${order.dip}`;
}

function buildOrderSummary(order) {
  const parts = [];

  if (order.quantity && order.style) {
    parts.push(`${order.quantity} ${order.style} wings`);
  } else if (order.quantity) {
    parts.push(`${order.quantity} wings`);
  } else if (order.style) {
    parts.push(`${order.style} wings`);
  }

  if (order.sauce && order.sauce2 && order.splitSauce) {
    parts.push(`half ${order.sauce} and half ${order.sauce2}`);
  } else if (order.sauce && order.sauce2) {
    parts.push(`${order.sauce} and ${order.sauce2}`);
  } else if (order.sauce) {
    parts.push(order.sauce);
  }

  const dips = dipText(order);
  if (dips) {
    parts.push(`with ${dips}`);
  }

  if (order.side) {
    parts.push(`plus ${order.side}`);
  }

  return parts.join(" ");
}

function hasCompleteMainWingOrder(order) {
  return !!(order.quantity && order.style && order.sauce);
}

function nextMissingQuestion(order) {
  if (!order.quantity && !order.style) {
    return "How many wings would you like, and would you like traditional or boneless?";
  }

  if (!order.quantity) {
    return "How many wings would you like? We have 6, 9, 12, 18, 24, or 48.";
  }

  if (!order.style) {
    return "Would you like traditional or boneless?";
  }

  if (!order.sauce) {
    return "What sauce would you like? Mild, lime pepper, garlic parmesan, and mango habanero are popular.";
  }

  return null;
}

function looksLikeCorrection(text) {
  const t = normalizeText(text);
  return (
    t.includes("actually") ||
    t.includes("change") ||
    t.includes("make that") ||
    t.includes("instead") ||
    t.includes("no make it") ||
    t.includes("switch it")
  );
}

function looksLikeWingsIntent(text) {
  const t = normalizeText(text);
  return (
    t.includes("wings") ||
    t.includes("bone in") ||
    t.includes("bone-in") ||
    t.includes("traditional") ||
    t.includes("boneless") ||
    extractFirstNumber(t) != null ||
    extractStyle(t) != null ||
    extractSauces(t).length > 0
  );
}

// ------------------------
// Routes
// ------------------------
app.post("/voice", (req, res) => {
  const callSid = req.body.CallSid || `call_${Date.now()}`;
  const session = getSession(callSid);
  resetForNewCall(session);

  return speak(
    res,
    "Thank you for calling Flaps and Racks, this is Jeffrey. Would you like to order in English or Spanish?",
    "/speech",
    callSid
  );
});

app.post("/speech", (req, res) => {
  const callSid = req.body.CallSid || `call_${Date.now()}`;
  const speech = req.body.SpeechResult || "";
  const text = normalizeText(speech);
  const session = getSession(callSid);

  // ------------------------
  // LANGUAGE
  // ------------------------
  if (session.stage === "language") {
    if (text.includes("spanish") || text.includes("español") || text.includes("espanol")) {
      session.language = "es";
      session.stage = "order";
      return speak(
        res,
        "Gracias por llamar a Flaps and Racks. Por ahora esta demo funciona mejor en inglés. If that's okay, what can I get started for you?",
        "/speech",
        callSid
      );
    }

    session.language = "en";
    session.stage = "order";
    return speak(
      res,
      "Great. What can I get started for you today?",
      "/speech",
      callSid
    );
  }

  // ------------------------
  // ORDER
  // ------------------------
  if (session.stage === "order") {
    const parsed = parseOrderFromSpeech(speech);
    mergeOrder(session.order, parsed);

    const missingQuestion = nextMissingQuestion(session.order);

    if (missingQuestion) {
      return speak(
        res,
        `${pick(FRIENDLY_OPENERS)} ${missingQuestion}`,
        "/speech",
        callSid
      );
    }

    session.stage = "dip_or_more";

    const summary = buildOrderSummary(session.order);
    return speak(
      res,
      `${pick(FRIENDLY_OPENERS)} I have ${summary}. Would you like to add fries, corn ribs, mozzarella sticks, or maybe a dipping sauce?`,
      "/speech",
      callSid
    );
  }

  // ------------------------
  // DIP / SIDE / ANYTHING ELSE
  // ------------------------
  if (session.stage === "dip_or_more") {
    if (isDone(speech) || isNo(speech)) {
      session.stage = "name";
      return speak(
        res,
        "Perfect. Can I get a name for the order?",
        "/speech",
        callSid
      );
    }

    const parsed = parseOrderFromSpeech(speech);

    if (looksLikeCorrection(speech)) {
      mergeOrder(session.order, parsed);
      const summary = buildOrderSummary(session.order);

      return speak(
        res,
        `No problem. I updated it to ${summary}. ${pick(ANYTHING_ELSE_LINES)}`,
        "/speech",
        callSid
      );
    }

    if (parsed.dip || parsed.side) {
      mergeOrder(session.order, parsed);
      const summary = buildOrderSummary(session.order);

      return speak(
        res,
        `${pick(FRIENDLY_OPENERS)} Now I have ${summary}. ${pick(ANYTHING_ELSE_LINES)}`,
        "/speech",
        callSid
      );
    }

    if (looksLikeWingsIntent(speech)) {
      mergeOrder(session.order, parsed);

      if (!hasCompleteMainWingOrder(session.order)) {
        const missingQuestion = nextMissingQuestion(session.order);
        return speak(
          res,
          `${pick(FRIENDLY_OPENERS)} ${missingQuestion}`,
          "/speech",
          callSid
        );
      }

      const summary = buildOrderSummary(session.order);
      return speak(
        res,
        `${pick(FRIENDLY_OPENERS)} Now I have ${summary}. ${pick(ANYTHING_ELSE_LINES)}`,
        "/speech",
        callSid
      );
    }

    return speak(
      res,
      "I got most of the order, but I missed that last part. You can add a dipping sauce, fries, corn ribs, mozzarella sticks, or say that's all.",
      "/speech",
      callSid
    );
  }

  // ------------------------
  // NAME
  // ------------------------
  if (session.stage === "name") {
    const name = extractName(speech);

    if (name) {
      session.order.name = name;
      session.stage = "done";

      const summary = buildOrderSummary(session.order);

      return speak(
        res,
        `Perfect, ${session.order.name}. I have ${summary}. Your order is all set. Thank you for calling Flaps and Racks.`,
        "/speech",
        callSid,
        true
      );
    }

    return speak(
      res,
      "Sorry, I missed the name. Can I get the name for the order one more time?",
      "/speech",
      callSid
    );
  }

  // ------------------------
  // FALLBACK
  // ------------------------
  return speak(
    res,
    "Sorry, something got off track. Let's start again. What can I get started for you today?",
    "/speech",
    callSid
  );
});

// ------------------------
// Health check
// ------------------------
app.get("/", (req, res) => {
  res.send("Jeffrey AI Cashier 1.4.1 menu version is running.");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
