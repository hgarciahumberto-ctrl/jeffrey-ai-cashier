import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";

const { twiml: { VoiceResponse } } = twilio;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const VOICE = "Polly.Matthew";

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

const sessions = new Map();

function blankOrder() {
  return {
    quantity: null,
    style: null,
    sauces: [],
    includedDips: [],
    extraDips: [],
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

function extractAllAliases(text, aliasList) {
  const found = [];
  for (const item of aliasList) {
    for (const key of item.keys) {
      if (text.includes(key)) {
        if (!found.includes(item.value)) found.push(item.value);
        break;
      }
    }
  }
  return found;
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
  return extractAllAliases(text, SAUCE_ALIASES);
}

function extractExtraSide(text) {
  return findAlias(text, EXTRA_SIDE_ALIASES);
}

function extractDips(text) {
  return extractAllAliases(text, DIP_ALIASES);
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
  return /\b(yes|yeah|yep|sure|okay|ok|sounds good)\b/.test(text);
}

function isNo(text) {
  return /\b(no|nope|nah|nothing else|that s all|thats all|no thank you|im good|i m good|just that|keep it like that)\b/.test(text);
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

function sauceSlotsAllowed(quantity) {
  return Math.max(1, Math.floor(quantity / 6));
}

function dipSlotsAllowed(quantity) {
  return Math.max(1, Math.floor(quantity / 6));
}

function formatCountNoun(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function sauceCounts(order) {
  const total = order.quantity || 0;
  const sauces = order.sauces.length ? order.sauces : [];
  const parts = sauces.length;
  if (!parts) return [];

  const base = Math.floor(total / parts);
  let remainder = total % parts;

  return sauces.map((sauce) => {
    const amount = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return { sauce, amount };
  });
}

function sauceSummary(order) {
  return sauceCounts(order)
    .map(({ sauce, amount }) => `${amount} with ${sauce}`)
    .join(", ");
}

function countByType(list) {
  const counts = {};
  for (const item of list) counts[item] = (counts[item] || 0) + 1;
  return counts;
}

function dipSummary(list) {
  const counts = countByType(list);
  return Object.entries(counts)
    .map(([type, qty]) => `${qty} ${type}${qty > 1 ? (type === "ranch" ? "es" : "") : ""}`)
    .join(", ");
}

function orderSummary(order) {
  let summary = `${order.quantity} ${order.style} wings`;

  if (order.sauces.length) {
    summary += ` split as ${sauceSummary(order)}`;
  }

  if (order.includedDips.length) {
    summary += `, with included ${dipSummary(order.includedDips)}`;
  }

  if (order.extraDips.length) {
    summary += `, plus extra ${dipSummary(order.extraDips)}`;
  }

  if (order.extraSide) {
    summary += `, and ${order.extraSide}`;
  }

  return summary;
}

function parseCoreOrder(text, order) {
  const quantity = extractNumber(text);
  const style = extractStyle(text);
  const sauces = extractSauces(text);

  if (quantity) order.quantity = quantity;
  if (style) order.style = style;
  if (sauces.length) {
    for (const sauce of sauces) {
      if (!order.sauces.includes(sauce)) order.sauces.push(sauce);
    }
  }
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

function addSauces(order, newSauces) {
  const max = sauceSlotsAllowed(order.quantity);
  for (const sauce of newSauces) {
    if (order.sauces.length >= max) break;
    if (!order.sauces.includes(sauce)) order.sauces.push(sauce);
  }
}

function fillRemainingIncludedDipsWith(order, dipType) {
  const max = dipSlotsAllowed(order.quantity);
  while (order.includedDips.length < max) {
    order.includedDips.push(dipType);
  }
}

function addSpecificIncludedDips(order, dips) {
  const max = dipSlotsAllowed(order.quantity);
  for (const dip of dips) {
    if (order.includedDips.length >= max) break;
    order.includedDips.push(dip);
  }
}

function addExtraDip(order, dipType, qty = 1) {
  for (let i = 0; i < qty; i += 1) {
    order.extraDips.push(dipType);
  }
}

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

app.post("/voice", (req, res) => {
  const session = getSession(req.body.CallSid);
  resetSession(session);
  session.stage = "language";
  session.lastPrompt = "Thank you for calling Flaps and Racks. This is Jeffrey. English or Spanish?";
  return speak(res, "Thank you for calling Flaps and Racks. This is Jeffrey. English or Spanish?");
});

app.post("/speech", (req, res) => {
  const session = getSession(req.body.CallSid);
  const speech = normalize(req.body.SpeechResult || "");

  console.log("Stage:", session.stage, "| Speech:", speech);
  console.log("Order:", JSON.stringify(session.order));

  const interrupt = handleInterruptions(session, speech, res);
  if (interrupt) return interrupt;

  if (session.stage === "language") {
    session.stage = "order";
    return sayAndStore(session, res, "What can I get started for you today?");
  }

  if (session.stage === "order") {
    parseCoreOrder(speech, session.order);

    const missing = missingCore(session.order);
    if (missing) {
      if (missing === "sauce") session.stage = "sauce";
      return sayAndStore(session, res, nextPromptForMissing(session.order));
    }

    const allowed = sauceSlotsAllowed(session.order.quantity);
    if (session.order.sauces.length < allowed) {
      session.stage = "sauce_more_or_done";
      return sayAndStore(
        session,
        res,
        `Got it. You can choose up to ${allowed} sauces for ${session.order.quantity} wings. Right now I have ${sauceSummary(session.order)}. Would you like another sauce, or keep it like that?`
      );
    }

    session.stage = "included_dip";
    const dips = dipSlotsAllowed(session.order.quantity);
    return sayAndStore(
      session,
      res,
      `Perfect. I have ${session.order.quantity} ${session.order.style} wings split as ${sauceSummary(session.order)}. That comes with ${formatCountNoun(dips, "dipping sauce", "dipping sauces")}. Would you like ranch or blue cheese?`
    );
  }

  if (session.stage === "sauce") {
    const sauces = extractSauces(speech);
    if (!sauces.length) {
      return sayAndStore(session, res, "Sorry, I missed that. What sauce would you like?");
    }

    addSauces(session.order, sauces);

    const allowed = sauceSlotsAllowed(session.order.quantity);
    if (session.order.sauces.length < allowed) {
      session.stage = "sauce_more_or_done";
      return sayAndStore(
        session,
        res,
        `Perfect. Right now I have ${sauceSummary(session.order)}. You can choose up to ${allowed} sauces. Would you like another sauce, or keep it like that?`
      );
    }

    session.stage = "included_dip";
    const dips = dipSlotsAllowed(session.order.quantity);
    return sayAndStore(
      session,
      res,
      `Perfect. I have ${session.order.quantity} ${session.order.style} wings split as ${sauceSummary(session.order)}. That comes with ${formatCountNoun(dips, "dipping sauce", "dipping sauces")}. Would you like ranch or blue cheese?`
    );
  }

  if (session.stage === "sauce_more_or_done") {
    const sauces = extractSauces(speech);
    if (sauces.length) {
      addSauces(session.order, sauces);
    }

    const allowed = sauceSlotsAllowed(session.order.quantity);
    if (sauces.length && session.order.sauces.length < allowed) {
      const remaining = allowed - session.order.sauces.length;
      return sayAndStore(
        session,
        res,
        `Perfect. Right now I have ${sauceSummary(session.order)}. You can still add ${remaining} more sauce${remaining > 1 ? "s" : ""}, or keep it like that.`
      );
    }

    if (!sauces.length && !isNo(speech) && !isYes(speech) && !speech.includes("keep")) {
      return sayAndStore(
        session,
        res,
        `Sorry, I missed that. Right now I have ${sauceSummary(session.order)}. Would you like another sauce, or keep it like that?`
      );
    }

    session.stage = "included_dip";
    const dips = dipSlotsAllowed(session.order.quantity);
    return sayAndStore(
      session,
      res,
      `Perfect. I have ${session.order.quantity} ${session.order.style} wings split as ${sauceSummary(session.order)}. That comes with ${formatCountNoun(dips, "dipping sauce", "dipping sauces")}. Would you like ranch or blue cheese?`
    );
  }

  if (session.stage === "included_dip") {
    const dips = extractDips(speech);
    const max = dipSlotsAllowed(session.order.quantity);

    if (!dips.length) {
      return sayAndStore(session, res, `Would you like ranch or blue cheese? You get ${formatCountNoun(max, "included dip", "included dips")}.`);
    }

    if (dips.length === 1) {
      fillRemainingIncludedDipsWith(session.order, dips[0]);
    } else {
      addSpecificIncludedDips(session.order, dips);
      if (session.order.includedDips.length < max) {
        return sayAndStore(
          session,
          res,
          `Got it. Right now you have ${dipSummary(session.order.includedDips)} included. I still need ${max - session.order.includedDips.length} more. Ranch or blue cheese?`
        );
      }
    }

    session.stage = "extra_upsell";
    return sayAndStore(
      session,
      res,
      `Perfect. That gives you ${dipSummary(session.order.includedDips)} included. Would you like any extra ranch or blue cheese, or maybe fries, corn ribs, mac bites, or mozzarella sticks?`
    );
  }

  if (session.stage === "extra_upsell") {
    const dips = extractDips(speech);
    const side = extractExtraSide(speech);

    if (dips.length) {
      const qty = extractDipQty(speech);
      if (dips.length === 1) {
        addExtraDip(session.order, dips[0], qty);
      } else {
        for (const dip of dips) addExtraDip(session.order, dip, 1);
      }

      return sayAndStore(
        session,
        res,
        `Perfect. Right now you have ${session.order.includedDips.length ? `${dipSummary(session.order.includedDips)} included` : "no included dips"}${session.order.extraDips.length ? `, plus extra ${dipSummary(session.order.extraDips)}` : ""}. Anything else?`
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

    return sayAndStore(session, res, "Sorry, I missed that. Would you like any extra ranch or blue cheese, or maybe a side?");
  }

  if (session.stage === "name") {
    const name = extractName(speech);
    if (!name) {
      return sayAndStore(session, res, "Sorry, I didn't catch the name. What name is the order under?");
    }

    session.order.name = name;
    return sayAndStore(
      session,
      res,
      `Perfect, ${name}. I have ${orderSummary(session.order)}. Your order is all set. Thank you for calling Flaps and Racks. This is Jeffrey.`,
      true
    );
  }

  session.stage = "order";
  return sayAndStore(session, res, "Let's get started. What can I get for you today?");
});

app.get("/", (req, res) => {
  res.send("Jeffrey AI Cashier is running.");
});

app.listen(PORT, () => {
  console.log("Jeffrey server running on port", PORT);
});
