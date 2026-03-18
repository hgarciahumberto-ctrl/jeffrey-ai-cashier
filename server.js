import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";

const { twiml: { VoiceResponse } } = twilio;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

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

const SIDE_ALIASES = [
  { keys: ["fries", "french fries"], value: "fries" },
  { keys: ["mac bites", "mac bite", "mac", "mac and cheese bites"], value: "mac bites" },
  { keys: ["corn ribs", "corn"], value: "corn ribs" },
  { keys: ["mozzarella sticks", "mozz sticks", "mozzarella", "mozz"], value: "mozzarella sticks" }
];

const DIP_ALIASES = [
  { keys: ["ranch"], value: "ranch" },
  { keys: ["blue cheese", "bleu cheese"], value: "blue cheese" }
];

const DRINK_ALIASES = [
  { keys: ["coke", "coca cola"], value: "coke" },
  { keys: ["diet coke"], value: "diet coke" },
  { keys: ["sprite"], value: "sprite" },
  { keys: ["dr pepper", "doctor pepper"], value: "dr pepper" },
  { keys: ["root beer"], value: "root beer" },
  { keys: ["lemonade"], value: "lemonade" },
  { keys: ["iced tea", "tea"], value: "iced tea" },
  { keys: ["water"], value: "water" }
];

// demo voice
const VOICE = "Polly.Matthew";

// =====================================================
// SESSIONS
// =====================================================
const sessions = new Map();

function blankOrder() {
  return {
    quantity: null,
    style: null,
    sauce: null,
    dips: [],
    side: null,
    name: null,
    isCombo: null,
    comboDrink: null,
    itemType: "wings"
  };
}

function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, {
      stage: "language",
      lastPrompt: "",
      lastStage: "language",
      hold: false,
      order: blankOrder()
    });
  }
  return sessions.get(callSid);
}

function resetSession(session) {
  session.stage = "language";
  session.lastPrompt = "";
  session.lastStage = "language";
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
  session.lastStage = session.stage;
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
  if (text.includes("traditional") || text.includes("bone in") || text.includes("bone-in") || text.includes("bone")) {
    return "traditional";
  }
  return null;
}

function extractSauce(text) {
  return findAlias(text, SAUCE_ALIASES);
}

function extractSide(text) {
  return findAlias(text, SIDE_ALIASES);
}

function extractDrink(text) {
  return findAlias(text, DRINK_ALIASES);
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
  return /\b(yes|yeah|yep|sure|okay|ok|sounds good|make it a combo|combo)\b/.test(text);
}

function isNo(text) {
  return /\b(no|nope|nah|that s all|thats all|nothing else|no thank you|i m good|im good|just that)\b/.test(text);
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
  return /\b(okay|ok|ready|go ahead|continue|i m ready|im ready)\b/.test(text);
}

function wantsStartOver(text) {
  return /\b(start over|restart|begin again|let s start over|lets start over)\b/.test(text);
}

function wantsChangeSauce(text) {
  return /\b(change the sauce|different sauce|switch the sauce|another sauce)\b/.test(text);
}

function wantsGoBack(text) {
  return /\b(go back|back up|previous)\b/.test(text);
}

function summarizeDips(dips = []) {
  if (!dips.length) return "";
  return dips
    .map(d => `${d.qty} ${d.type}${d.qty > 1 ? (d.type === "ranch" ? "es" : "") : ""}`)
    .join(", ");
}

function orderSummary(order) {
  let base = `${order.quantity} ${order.style} wings with ${order.sauce}`;

  if (order.isCombo) {
    base += " as a combo";
    if (order.side) base += `, side of ${order.side}`;
    if (order.comboDrink) base += `, and ${order.comboDrink} to drink`;
  } else if (order.side) {
    base += `, plus ${order.side}`;
  }

  if (order.dips.length) {
    base += `, with ${summarizeDips(order.dips)}`;
  }

  return base;
}

function addDip(order, type, qty = 1) {
  const existing = order.dips.find(d => d.type === type);
  if (existing) {
    existing.qty += qty;
  } else {
    order.dips.push({ type, qty });
  }
}

function parseOrderFromSpeech(text, order) {
  const quantity = extractNumber(text);
  const style = extractStyle(text);
  const sauce = extractSauce(text);
  const side = extractSide(text);
  const drink = extractDrink(text);
  const dip = extractDip(text);

  if (quantity) order.quantity = quantity;
  if (style) order.style = style;
  if (sauce) order.sauce = sauce;
  if (side) order.side = side;
  if (drink) order.comboDrink = drink;
  if (wantsCombo(text)) order.isCombo = true;

  if (dip) {
    addDip(order, dip, extractDipQty(text));
  }
}

function missingCore(order) {
  if (!order.quantity) return "quantity";
  if (!order.style) return "style";
  if (!order.sauce) return "sauce";
  return null;
}

function nextPromptForMissing(order) {
  const missing = missingCore(order);
  if (missing === "quantity") return "How many wings would you like? We have 6, 9, 12, 18, 24, or 48.";
  if (missing === "style") return "You want those traditional or boneless?";
  if (missing === "sauce") return "What sauce would you like? Mild, lime pepper, and garlic parmesan are popular.";
  return null;
}

// =====================================================
// GLOBAL INTERRUPTION HANDLER
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
    session.order.sauce = null;
    session.stage = "order";
    return sayAndStore(session, res, "Absolutely. What sauce would you like instead?");
  }

  if (wantsGoBack(speech)) {
    if (session.stage === "combo_drink") {
      session.stage = "combo_side";
      return sayAndStore(session, res, "No problem. What side would you like with the combo?");
    }

    if (session.stage === "name") {
      session.stage = session.order.isCombo ? "upsell" : "upsell";
      return sayAndStore(session, res, "Sure. Would you like to add fries, corn ribs, mac bites, or mozzarella sticks?");
    }

    return sayAndStore(session, res, "Sure. Tell me what you'd like to change.");
  }

  return null;
}

// =====================================================
// ROUTES
// =====================================================
app.post("/voice", (req, res) => {
  const session = getSession(req.body.CallSid);
  session.stage = "language";
  session.lastStage = "language";
  session.lastPrompt = "Thank you for calling Flaps and Racks. English or Spanish?";
  session.hold = false;
  session.order = blankOrder();

  return speak(res, "Thank you for calling Flaps and Racks. English or Spanish?");
});

app.post("/speech", (req, res) => {
  const callSid = req.body.CallSid;
  const session = getSession(callSid);
  const speech = normalize(req.body.SpeechResult || "");

  console.log("Stage:", session.stage, "| Speech:", speech);
  console.log("Order:", JSON.stringify(session.order));

  const interruptionResponse = handleInterruptions(session, speech, res);
  if (interruptionResponse) return interruptionResponse;

  // -------------------------------------------------
  // LANGUAGE
  // -------------------------------------------------
  if (session.stage === "language") {
    session.stage = "order";
    return sayAndStore(session, res, "What can I get started for you today?");
  }

  // -------------------------------------------------
  // ORDER
  // Faster capture: quantity + style + sauce + combo + dip + side
  // -------------------------------------------------
  if (session.stage === "order") {
    parseOrderFromSpeech(speech, session.order);

    const missing = missingCore(session.order);
    if (missing) {
      return sayAndStore(session, res, nextPromptForMissing(session.order));
    }

    if (session.order.isCombo === true) {
      session.stage = "combo_side";

      if (session.order.side && session.order.comboDrink) {
        session.stage = "dip";
        return sayAndStore(
          session,
          res,
          `Perfect. I have ${orderSummary(session.order)}. Would you like any dipping sauce?`
        );
      }

      if (session.order.side && !session.order.comboDrink) {
        session.stage = "combo_drink";
        return sayAndStore(
          session,
          res,
          `Perfect. I have ${session.order.quantity} ${session.order.style} wings with ${session.order.sauce} as a combo, with ${session.order.side}. What would you like to drink?`
        );
      }

      return sayAndStore(
        session,
        res,
        `Got it. ${session.order.quantity} ${session.order.style} wings with ${session.order.sauce} as a combo. What side would you like with that?`
      );
    }

    if (session.order.isCombo === null) {
      session.stage = "combo_offer";
      return sayAndStore(
        session,
        res,
        `Got it. ${session.order.quantity} ${session.order.style} wings with ${session.order.sauce}. Would you like to make that a combo?`
      );
    }

    session.stage = "dip";
    return sayAndStore(
      session,
      res,
      `Perfect. I have ${orderSummary(session.order)}. Would you like any dipping sauce?`
    );
  }

  // -------------------------------------------------
  // COMBO OFFER
  // -------------------------------------------------
  if (session.stage === "combo_offer") {
    if (isYes(speech) || wantsCombo(speech)) {
      session.order.isCombo = true;
      parseOrderFromSpeech(speech, session.order);

      if (session.order.side && session.order.comboDrink) {
        session.stage = "dip";
        return sayAndStore(
          session,
          res,
          `Perfect. I have ${orderSummary(session.order)}. Would you like any dipping sauce?`
        );
      }

      if (session.order.side) {
        session.stage = "combo_drink";
        return sayAndStore(session, res, "Perfect. What would you like to drink with the combo?");
      }

      session.stage = "combo_side";
      return sayAndStore(session, res, "Perfect. What side would you like with the combo?");
    }

    if (isNo(speech)) {
      session.order.isCombo = false;
      session.stage = "dip";
      return sayAndStore(session, res, "No problem. Would you like any dipping sauce?");
    }

    parseOrderFromSpeech(speech, session.order);

    if (session.order.side || session.order.comboDrink || wantsCombo(speech)) {
      session.order.isCombo = true;

      if (!session.order.side) {
        session.stage = "combo_side";
        return sayAndStore(session, res, "Sounds good. What side would you like with the combo?");
      }

      if (!session.order.comboDrink) {
        session.stage = "combo_drink";
        return sayAndStore(session, res, "And what would you like to drink?");
      }

      session.stage = "dip";
      return sayAndStore(session, res, `Perfect. I have ${orderSummary(session.order)}. Would you like any dipping sauce?`);
    }

    return sayAndStore(session, res, "Sorry, I missed that. Would you like to make it a combo?");
  }

  // -------------------------------------------------
  // COMBO SIDE
  // -------------------------------------------------
  if (session.stage === "combo_side") {
    parseOrderFromSpeech(speech, session.order);

    if (!session.order.side) {
      return sayAndStore(session, res, "What side would you like with the combo? Fries, corn ribs, or mac bites?");
    }

    if (session.order.comboDrink) {
      session.stage = "dip";
      return sayAndStore(
        session,
        res,
        `Perfect. I have ${orderSummary(session.order)}. Would you like any dipping sauce?`
      );
    }

    session.stage = "combo_drink";
    return sayAndStore(session, res, "Perfect. What would you like to drink?");
  }

  // -------------------------------------------------
  // COMBO DRINK
  // -------------------------------------------------
  if (session.stage === "combo_drink") {
    parseOrderFromSpeech(speech, session.order);

    if (!session.order.comboDrink) {
      return sayAndStore(session, res, "What would you like to drink with the combo?");
    }

    session.stage = "dip";
    return sayAndStore(
      session,
      res,
      `Perfect. I have ${orderSummary(session.order)}. Would you like any dipping sauce?`
    );
  }

  // -------------------------------------------------
  // DIP
  // -------------------------------------------------
  if (session.stage === "dip") {
    parseOrderFromSpeech(speech, session.order);
    const dip = extractDip(speech);

    if (dip) {
      addDip(session.order, dip, extractDipQty(speech));
      session.stage = "dip_confirm";
      return sayAndStore(
        session,
        res,
        `Got it. You have ${summarizeDips(session.order.dips)}. Would you like any additional dipping sauce?`
      );
    }

    if (isNo(speech)) {
      session.stage = "upsell";
      return sayAndStore(session, res, "Would you like to add fries, corn ribs, mac bites, or mozzarella sticks?");
    }

    return sayAndStore(session, res, "Would you like ranch or blue cheese?");
  }

  // -------------------------------------------------
  // DIP CONFIRM
  // -------------------------------------------------
  if (session.stage === "dip_confirm") {
    const dip = extractDip(speech);

    if (dip) {
      addDip(session.order, dip, extractDipQty(speech));
      return sayAndStore(
        session,
        res,
        `Perfect. You now have ${summarizeDips(session.order.dips)}. Any other dipping sauce?`
      );
    }

    if (isNo(speech)) {
      session.stage = "upsell";
      return sayAndStore(session, res, "Would you like to add fries, corn ribs, mac bites, or mozzarella sticks?");
    }

    session.stage = "upsell";
    return sayAndStore(session, res, "Got it. Would you like to add fries, corn ribs, mac bites, or mozzarella sticks?");
  }

  // -------------------------------------------------
  // UPSELL
  // -------------------------------------------------
  if (session.stage === "upsell") {
    const side = extractSide(speech);

    if (side) {
      // If combo already has a side, treat this as an extra add-on mention only in summary
      if (!session.order.side) {
        session.order.side = side;
      } else if (session.order.side !== side) {
        session.order.side = `${session.order.side} and ${side}`;
      }

      session.stage = "name";
      return sayAndStore(session, res, `Perfect, adding ${side}. What name is the order under?`);
    }

    if (isNo(speech)) {
      session.stage = "name";
      return sayAndStore(session, res, "Sounds good. What name is the order under?");
    }

    return sayAndStore(session, res, "Sorry, I missed that. Would you like fries, corn ribs, mac bites, or mozzarella sticks?");
  }

  // -------------------------------------------------
  // NAME
  // -------------------------------------------------
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

  // fallback
  session.stage = "order";
  return sayAndStore(session, res, "Let's get started. What can I get for you today?");
});

// =====================================================
// HEALTHCHECK
// =====================================================
app.get("/", (req, res) => {
  res.send("Jeffrey AI Cashier 1.5 Demo Killer is running.");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
