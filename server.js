import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";

const { twiml: { VoiceResponse } } = twilio;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const VOICE = "Polly.Matthew";

// =====================================================
// MENU / CONFIG
// =====================================================
const VALID_WING_COUNTS = [6, 9, 12, 18, 24, 48];

const SAUCE_ALIASES = [
  { keys: ["mild", "buffalo mild"], value: "mild" },
  { keys: ["hot", "buffalo hot"], value: "hot" },
  { keys: ["lime pepper", "lemon pepper"], value: "lime pepper" },
  { keys: ["garlic parmesan", "garlic parm", "parmesan"], value: "garlic parmesan" },
  { keys: ["mango habanero"], value: "mango habanero" },
  { keys: ["teriyaki"], value: "teriyaki" },
  { keys: ["barbecue", "barbeque", "bbq"], value: "barbeque" },
  { keys: ["green chile", "green chili"], value: "green chile" },
  { keys: ["sweet and spicy", "sweet & spicy"], value: "sweet and spicy" },
  { keys: ["citrus chipotle"], value: "citrus chipotle" },
  { keys: ["bbq chiltepin"], value: "bbq chiltepin" },
  { keys: ["chocolate chiltepin"], value: "chocolate chiltepin" },
  { keys: ["cinnamon roll"], value: "cinnamon roll" }
];

const COMBO_SIDE_ALIASES = [
  { keys: ["regular fries", "fries", "french fries"], value: "regular fries" },
  { keys: ["sweet potato fries", "sweet fries"], value: "sweet potato fries" },
  { keys: ["potato salad"], value: "potato salad" }
];

const EXTRA_SIDE_ALIASES = [
  { keys: ["fries", "regular fries", "french fries"], value: "regular fries" },
  { keys: ["sweet potato fries", "sweet fries"], value: "sweet potato fries" },
  { keys: ["potato salad"], value: "potato salad" },
  { keys: ["corn ribs", "corn"], value: "corn ribs" },
  { keys: ["mac bites", "mac bite", "mac", "mac and cheese bites"], value: "mac bites" },
  { keys: ["mozzarella sticks", "mozz sticks", "mozzarella", "mozz"], value: "mozzarella sticks" }
];

const DIP_ALIASES = [
  { keys: ["ranch"], value: "ranch" },
  { keys: ["blue cheese", "bleu cheese"], value: "blue cheese" }
];

// =====================================================
// SESSION
// =====================================================
const sessions = new Map();

function blankOrder() {
  return {
    quantity: null,
    style: null, // classic | boneless
    sauces: [],
    includedDips: [],
    extraDips: [],
    isCombo: null,
    comboSide: null,
    extraSide: null,
    name: null
  };
}

function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, {
      stage: "language",
      lastPrompt: "",
      hold: false,
      order: blankOrder()
    });
  }
  return sessions.get(callSid);
}

function resetSession(session) {
  session.stage = "language";
  session.lastPrompt = "";
  session.hold = false;
  session.order = blankOrder();
}

// =====================================================
// HELPERS
// =====================================================
function normalize(text = "") {
  return text
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function speak(res, message, hangup = false) {
  const vr = new VoiceResponse();

  if (hangup) {
    vr.say({ voice: VOICE }, message);
    vr.hangup();
  } else {
    const gather = vr.gather({
      input: "speech",
      action: "/speech",
      method: "POST",
      speechTimeout: "auto",
      timeout: 5
    });
    gather.say({ voice: VOICE }, message);
  }

  res.type("text/xml").send(vr.toString());
}

function sayAndStore(session, res, message, hangup = false) {
  session.lastPrompt = message;
  return speak(res, message, hangup);
}

function findAlias(text, aliasList) {
  for (const item of aliasList) {
    for (const key of item.keys) {
      if (text.includes(key)) return item.value;
    }
  }
  return null;
}

function extractNumber(text) {
  const match = text.match(/\b(6|9|12|18|24|48)\b/);
  return match ? parseInt(match[1], 10) : null;
}

function extractStyle(text) {
  if (text.includes("boneless")) return "boneless";
  if (
    text.includes("classic") ||
    text.includes("traditional") ||
    text.includes("bone in") ||
    text.includes("bone-in") ||
    text.includes("bone")
  ) {
    return "classic";
  }
  return null;
}

function extractSauces(text) {
  const found = [];
  for (const item of SAUCE_ALIASES) {
    for (const key of item.keys) {
      if (text.includes(key)) {
        if (!found.includes(item.value)) found.push(item.value);
      }
    }
  }
  return found;
}

function extractComboSide(text) {
  return findAlias(text, COMBO_SIDE_ALIASES);
}

function extractExtraSide(text) {
  return findAlias(text, EXTRA_SIDE_ALIASES);
}

function extractDip(text) {
  return findAlias(text, DIP_ALIASES);
}

function extractDipQty(text) {
  const match = text.match(/\b(\d+)\b/);
  return match ? parseInt(match[1], 10) : 1;
}

function extractName(text) {
  const cleaned = text.replace(/[^\w\s'-]/g, "").trim();

  const patterns = [
    /my name is (.+)/i,
    /name is (.+)/i,
    /it's (.+)/i,
    /it is (.+)/i,
    /this is (.+)/i,
    /under (.+)/i
  ];

  for (const p of patterns) {
    const m = cleaned.match(p);
    if (m && m[1]) return formatName(m[1]);
  }

  if (/^[a-zA-Z\s'-]{2,30}$/.test(cleaned)) {
    return formatName(cleaned);
  }

  return null;
}

function formatName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function isYes(text) {
  return /\b(yes|yeah|yep|sure|okay|ok|sounds good|combo|make it a combo)\b/.test(text);
}

function isNo(text) {
  return /\b(no|nope|nah|nothing else|that s all|thats all|no thank you|im good|i m good|just that)\b/.test(text);
}

function wantsCombo(text) {
  return /\b(combo|make it a combo|as a combo|with a combo)\b/.test(text);
}

function wantsRepeat(text) {
  return /\b(repeat|say that again|again|what was that|come again)\b/.test(text);
}

function wantsHold(text) {
  return /\b(wait|hold on|one second|one sec|just a second|give me a second)\b/.test(text);
}

function wantsResume(text) {
  return /\b(ready|go ahead|continue|okay|ok|i m ready|im ready)\b/.test(text);
}

function wantsStartOver(text) {
  return /\b(start over|restart|begin again|let s start over|lets start over)\b/.test(text);
}

function wantsChangeSauce(text) {
  return /\b(change the sauce|different sauce|switch the sauce|another sauce)\b/.test(text);
}

function saucesAllowed(quantity) {
  return Math.max(1, Math.floor(quantity / 6));
}

function dipsIncluded(quantity) {
  return Math.max(1, Math.floor(quantity / 6));
}

function dipCountByType(list) {
  const counts = {};
  for (const item of list) {
    counts[item] = (counts[item] || 0) + 1;
  }
  return counts;
}

function dipSummary(list) {
  if (!list.length) return "";
  const counts = dipCountByType(list);
  return Object.entries(counts)
    .map(([type, qty]) => `${qty} ${type}${qty > 1 ? (type === "ranch" ? "es" : "") : ""}`)
    .join(", ");
}

function sauceSummary(list) {
  if (!list.length) return "";
  const counts = {};
  for (const sauce of list) counts[sauce] = (counts[sauce] || 0) + 1;

  return Object.entries(counts)
    .map(([sauce, qty]) => qty > 1 ? `${qty} ${sauce}` : sauce)
    .join(", ");
}

function orderSummary(order) {
  let base = `${order.quantity} ${order.style} wings with ${sauceSummary(order.sauces)}`;

  if (order.isCombo) {
    base += ` as a combo with ${order.comboSide}`;
  }

  if (order.includedDips.length) {
    base += `, with included ${dipSummary(order.includedDips)}`;
  }

  if (order.extraDips.length) {
    base += `, plus extra ${dipSummary(order.extraDips)}`;
  }

  if (order.extraSide) {
    base += `, and ${order.extraSide}`;
  }

  return base;
}

function parseCoreOrder(text, order) {
  const quantity = extractNumber(text);
  const style = extractStyle(text);
  const sauces = extractSauces(text);
  const comboSide = extractComboSide(text);

  if (quantity) order.quantity = quantity;
  if (style) order.style = style;
  if (sauces.length) order.sauces = sauces;
  if (comboSide) order.comboSide = comboSide;
  if (wantsCombo(text)) order.isCombo = true;
}

function missingCore(order) {
  if (!order.quantity) return "quantity";
  if (!order.style) return "style";
  if (!order.sauces.length) return "sauce";
  return null;
}

function nextPromptForMissing(order) {
  const missing = missingCore(order);
  if (missing === "quantity") return "How many wings would you like? We have 6, 9, 12, 18, 24, or 48.";
  if (missing === "style") return "Would you like classic or boneless?";
  if (missing === "sauce") return "What sauce would you like?";
  return null;
}

function sauceSlotsSatisfied(order) {
  if (!order.quantity) return false;
  return order.sauces.length >= saucesAllowed(order.quantity);
}

function includedDipsSatisfied(order) {
  if (!order.quantity) return false;
  return order.includedDips.length >= dipsIncluded(order.quantity);
}

function addIncludedDip(order, dipType, qty = 1) {
  const limit = dipsIncluded(order.quantity);
  for (let i = 0; i < qty; i++) {
    if (order.includedDips.length < limit) {
      order.includedDips.push(dipType);
    }
  }
}

function addExtraDip(order, dipType, qty = 1) {
  for (let i = 0; i < qty; i++) {
    order.extraDips.push(dipType);
  }
}

// =====================================================
// INTERRUPTION HANDLER
// =====================================================
function handleInterruptions(session, speech, res) {
  if (wantsStartOver(speech)) {
    resetSession(session);
    session.stage = "order";
    return sayAndStore(session, res, "No problem, let's start fresh. What can I get started for you?");
  }

  if (wantsRepeat(speech)) {
    return sayAndStore(session, res, session.lastPrompt || "Sure. What can I get started for you?");
  }

  if (wantsHold(speech)) {
    session.hold = true;
    return sayAndStore(session, res, "Of course. Take your time. Just say ready when you're set.");
  }

  if (session.hold) {
    if (wantsResume(speech)) {
      session.hold = false;
      return sayAndStore(session, res, "Perfect. Go ahead.");
    }
    return sayAndStore(session, res, "No rush. Just say ready when you're set.");
  }

  if (wantsChangeSauce(speech)) {
    session.order.sauces = [];
    session.stage = "sauce";
    return sayAndStore(session, res, "Absolutely. What sauce would you like?");
  }

  return null;
}

// =====================================================
// ROUTES
// =====================================================
app.post("/voice", (req, res) => {
  const session = getSession(req.body.CallSid);
  resetSession(session);
  session.stage = "language";
  session.lastPrompt = "Thank you for calling Flaps and Racks. English or Spanish?";
  return speak(res, "Thank you for calling Flaps and Racks. English or Spanish?");
});

app.post("/speech", (req, res) => {
  const callSid = req.body.CallSid;
  const session = getSession(callSid);
  const speech = normalize(req.body.SpeechResult || "");

  console.log("Stage:", session.stage, "| Speech:", speech);
  console.log("Order:", JSON.stringify(session.order));

  const interrupt = handleInterruptions(session, speech, res);
  if (interrupt) return interrupt;

  // LANGUAGE
  if (session.stage === "language") {
    session.stage = "order";
    return sayAndStore(session, res, "What can I get started for you today?");
  }

  // ORDER
  if (session.stage === "order") {
    parseCoreOrder(speech, session.order);

    const missing = missingCore(session.order);
    if (missing) {
      if (missing === "sauce") {
        session.stage = "sauce";
      }
      return sayAndStore(session, res, nextPromptForMissing(session.order));
    }

    if (!sauceSlotsSatisfied(session.order)) {
      session.stage = "sauce";
      const needed = saucesAllowed(session.order.quantity) - session.order.sauces.length;
      return sayAndStore(
        session,
        res,
        `Got it. ${session.order.quantity} ${session.order.style} wings. I still need ${needed} more sauce${needed > 1 ? "s" : ""}. What sauce would you like?`
      );
    }

    if (session.order.isCombo === true) {
      if (session.order.comboSide) {
        session.stage = "included_dip";
        const dipCount = dipsIncluded(session.order.quantity);
        return sayAndStore(
          session,
          res,
          `Perfect. I have ${session.order.quantity} ${session.order.style} wings with ${sauceSummary(session.order.sauces)} as a combo with ${session.order.comboSide}. That comes with ${dipCount} dipping sauce${dipCount > 1 ? "s" : ""}. Would you like ranch or blue cheese?`
        );
      }

      session.stage = "combo_side";
      return sayAndStore(
        session,
        res,
        `Got it. ${session.order.quantity} ${session.order.style} wings with ${sauceSummary(session.order.sauces)} as a combo. For the combo side, would you like regular fries, sweet potato fries, or potato salad?`
      );
    }

    if (session.order.isCombo === null) {
      session.stage = "combo_offer";
      return sayAndStore(
        session,
        res,
        `Got it. ${session.order.quantity} ${session.order.style} wings with ${sauceSummary(session.order.sauces)}. Would you like to make that a combo?`
      );
    }

    session.stage = "included_dip";
    const dipCount = dipsIncluded(session.order.quantity);
    return sayAndStore(
      session,
      res,
      `Perfect. I have ${session.order.quantity} ${session.order.style} wings with ${sauceSummary(session.order.sauces)}. That comes with ${dipCount} dipping sauce${dipCount > 1 ? "s" : ""}. Would you like ranch or blue cheese?`
    );
  }

  // SAUCE
  if (session.stage === "sauce") {
    const sauces = extractSauces(speech);

    if (!sauces.length) {
      return sayAndStore(session, res, "Sorry, I missed that. What sauce would you like?");
    }

    for (const sauce of sauces) {
      if (session.order.sauces.length < saucesAllowed(session.order.quantity)) {
        session.order.sauces.push(sauce);
      }
    }

    if (!sauceSlotsSatisfied(session.order)) {
      const needed = saucesAllowed(session.order.quantity) - session.order.sauces.length;
      return sayAndStore(
        session,
        res,
        `Perfect. I still need ${needed} more sauce${needed > 1 ? "s" : ""}. What other sauce would you like?`
      );
    }

    if (session.order.isCombo === true) {
      if (session.order.comboSide) {
        session.stage = "included_dip";
        const dipCount = dipsIncluded(session.order.quantity);
        return sayAndStore(
          session,
          res,
          `Perfect. That comes with ${dipCount} dipping sauce${dipCount > 1 ? "s" : ""}. Would you like ranch or blue cheese?`
        );
      }

      session.stage = "combo_side";
      return sayAndStore(
        session,
        res,
        "Perfect. For the combo side, would you like regular fries, sweet potato fries, or potato salad?"
      );
    }

    if (session.order.isCombo === null) {
      session.stage = "combo_offer";
      return sayAndStore(
        session,
        res,
        `Got it. ${session.order.quantity} ${session.order.style} wings with ${sauceSummary(session.order.sauces)}. Would you like to make that a combo?`
      );
    }

    session.stage = "included_dip";
    const dipCount = dipsIncluded(session.order.quantity);
    return sayAndStore(
      session,
      res,
      `Perfect. That comes with ${dipCount} dipping sauce${dipCount > 1 ? "s" : ""}. Would you like ranch or blue cheese?`
    );
  }

  // COMBO OFFER
  if (session.stage === "combo_offer") {
    if (isYes(speech) || wantsCombo(speech)) {
      session.order.isCombo = true;
      const comboSide = extractComboSide(speech);
      if (comboSide) session.order.comboSide = comboSide;

      if (session.order.comboSide) {
        session.stage = "included_dip";
        const dipCount = dipsIncluded(session.order.quantity);
        return sayAndStore(
          session,
          res,
          `Perfect. I have ${session.order.quantity} ${session.order.style} wings with ${sauceSummary(session.order.sauces)} as a combo with ${session.order.comboSide}. That comes with ${dipCount} dipping sauce${dipCount > 1 ? "s" : ""}. Would you like ranch or blue cheese?`
        );
      }

      session.stage = "combo_side";
      return sayAndStore(
        session,
        res,
        "Perfect. For the combo side, would you like regular fries, sweet potato fries, or potato salad?"
      );
    }

    if (isNo(speech)) {
      session.order.isCombo = false;
      session.stage = "included_dip";
      const dipCount = dipsIncluded(session.order.quantity);
      return sayAndStore(
        session,
        res,
        `No problem. That comes with ${dipCount} dipping sauce${dipCount > 1 ? "s" : ""}. Would you like ranch or blue cheese?`
      );
    }

    const comboSide = extractComboSide(speech);
    if (comboSide) {
      session.order.isCombo = true;
      session.order.comboSide = comboSide;
      session.stage = "included_dip";
      const dipCount = dipsIncluded(session.order.quantity);
      return sayAndStore(
        session,
        res,
        `Perfect. I have ${session.order.quantity} ${session.order.style} wings with ${sauceSummary(session.order.sauces)} as a combo with ${session.order.comboSide}. That comes with ${dipCount} dipping sauce${dipCount > 1 ? "s" : ""}. Would you like ranch or blue cheese?`
      );
    }

    return sayAndStore(session, res, "Sorry, I missed that. Would you like to make it a combo?");
  }

  // COMBO SIDE
  if (session.stage === "combo_side") {
    const comboSide = extractComboSide(speech);

    if (!comboSide) {
      return sayAndStore(
        session,
        res,
        "Sorry, I missed that. For the combo side, would you like regular fries, sweet potato fries, or potato salad?"
      );
    }

    session.order.comboSide = comboSide;
    session.stage = "included_dip";
    const dipCount = dipsIncluded(session.order.quantity);

    return sayAndStore(
      session,
      res,
      `Perfect. That comes with ${dipCount} dipping sauce${dipCount > 1 ? "s" : ""}. Would you like ranch or blue cheese?`
    );
  }

  // INCLUDED DIP
  if (session.stage === "included_dip") {
    const dip = extractDip(speech);

    if (!dip) {
      return sayAndStore(session, res, "Would you like ranch or blue cheese?");
    }

    addIncludedDip(session.order, dip, extractDipQty(speech));

    if (!includedDipsSatisfied(session.order)) {
      const needed = dipsIncluded(session.order.quantity) - session.order.includedDips.length;
      return sayAndStore(
        session,
        res,
        `Got it. I still need ${needed} more included dipping sauce${needed > 1 ? "s" : ""}. Ranch or blue cheese?`
      );
    }

    session.stage = "extra_upsell";
    return sayAndStore(
      session,
      res,
      "Perfect. Would you like any additional ranch or blue cheese, or maybe fries, corn ribs, mac bites, or mozzarella sticks?"
    );
  }

  // EXTRA UPSELL
  if (session.stage === "extra_upsell") {
    const dip = extractDip(speech);
    const side = extractExtraSide(speech);

    if (dip) {
      addExtraDip(session.order, dip, extractDipQty(speech));
      return sayAndStore(
        session,
        res,
        "Perfect. Anything else? You can add extra ranch, blue cheese, fries, corn ribs, mac bites, or mozzarella sticks."
      );
    }

    if (side) {
      session.order.extraSide = side;
      session.stage = "name";
      return sayAndStore(session, res, `Perfect, adding ${side}. What name is the order under?`);
    }

    if (isNo(speech)) {
      session.stage = "name";
      return sayAndStore(session, res, "Sounds good. What name is the order under?");
    }

    return sayAndStore(
      session,
      res,
      "Sorry, I missed that. Would you like any additional ranch or blue cheese, or maybe a side?"
    );
  }

  // NAME
  if (session.stage === "name") {
    const name = extractName(speech);

    if (!name) {
      return sayAndStore(session, res, "Sorry, I didn't catch the name. What name is the order under?");
    }

    session.order.name = name;
    const summary = orderSummary(session.order);

    return sayAndStore(
      session,
      res,
      `Perfect, ${name}. I have ${summary}. Your order is all set. Thank you for calling Flaps and Racks.`,
      true
    );
  }

  session.stage = "order";
  return sayAndStore(session, res, "Let's get started. What can I get for you today?");
});

// =====================================================
// HEALTHCHECK
// =====================================================
app.get("/", (req, res) => {
  res.send("Jeffrey AI Cashier 1.5 Flaps demo version is running.");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
