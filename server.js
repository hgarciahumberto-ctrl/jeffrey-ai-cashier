import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";

const { twiml: { VoiceResponse } } = twilio;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const VOICE = process.env.TWILIO_VOICE || "Polly.Matthew";
const LANGUAGE = "en-US";

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
  { keys: ["mac bites", "mac bite", "mac", "mac and cheese bites"], value: "mac bites" }
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
    sauceMode: "split", // split | single
    includedDips: [],
    extraDips: [],
    extraSide: null,
    name: null,
    noMoreSauces: false
  };
}

function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, {
      stage: "language",
      lastPrompt: "",
      hold: false,
      reprompts: 0,
      order: blankOrder()
    });
  }
  return sessions.get(callSid);
}

function resetSession(session) {
  session.stage = "language";
  session.lastPrompt = "";
  session.hold = false;
  session.reprompts = 0;
  session.order = blankOrder();
}

function normalize(text = "") {
  return text
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(options) {
  return options[Math.floor(Math.random() * options.length)];
}

function speak(res, message, hangup = false) {
  const vr = new VoiceResponse();

  if (hangup) {
    vr.say({ voice: VOICE, language: LANGUAGE }, message);
    vr.hangup();
  } else {
    const gather = vr.gather({
      input: "speech",
      action: "/speech",
      method: "POST",
      speechTimeout: "auto",
      timeout: 6,
      actionOnEmptyResult: true
    });
    gather.say({ voice: VOICE, language: LANGUAGE }, message);
  }

  res.type("text/xml").send(vr.toString());
}

function sayAndStore(session, res, message, hangup = false) {
  session.lastPrompt = message;
  if (!hangup) session.reprompts = 0;
  return speak(res, message, hangup);
}

function reprompt(session, res, fallback) {
  session.reprompts += 1;

  if (session.reprompts >= 2) {
    return sayAndStore(session, res, fallback);
  }

  return speak(res, session.lastPrompt || fallback);
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
  const digitMatch = text.match(/\b(6|9|12|18|24|48)\b/);
  if (digitMatch) return parseInt(digitMatch[1], 10);

  if (text.includes("six")) return 6;
  if (text.includes("nine")) return 9;
  if (text.includes("twelve")) return 12;
  if (text.includes("eighteen")) return 18;
  if (text.includes("twenty four")) return 24;
  if (text.includes("forty eight")) return 48;

  return null;
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
  const digitMatch = text.match(/\b(\d+)\b/);
  if (digitMatch) return parseInt(digitMatch[1], 10);

  if (text.includes("one")) return 1;
  if (text.includes("two")) return 2;
  if (text.includes("three")) return 3;

  return 1;
}

function extractName(text) {
  const cleaned = text.replace(/[^\w\s'-]/g, "").trim();
  const patterns = [
    /my name is (.+)/i,
    /name is (.+)/i,
    /it's (.+)/i,
    /it is (.+)/i,
    /this is (.+)/i,
    /under (.+)/i,
    /put it under (.+)/i
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
  return /\b(yes|yeah|yep|sure|okay|ok|sounds good|that works|go ahead)\b/.test(text);
}

function isNo(text) {
  return /\b(no|nope|nah|nothing else|that s all|thats all|no thank you|im good|i m good|just that|keep it like that|that s fine|thats fine|just wings|i'm good|that'll be all|that will be all)\b/.test(text);
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
  return /\b(change the sauce|different sauce|switch the sauce|another sauce|make that|instead)\b/.test(text);
}

function wantsSingleSauce(text) {
  return /\b(one sauce|just one sauce|single sauce|all one sauce|all mild|all hot|all bbq|all barbeque|all barbecue|all lime pepper|all garlic parmesan|all mango habanero|all teriyaki|all green chile|all sweet and spicy|all citrus chipotle|all bbq chiltepin|all chocolate chiltepin|all cinnamon roll)\b/.test(text);
}

function wantsAllSameDip(text) {
  return /\b(all ranch|just ranch|all blue cheese|just blue cheese)\b/.test(text);
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

function sauceCounts(order) {
  const total = order.quantity || 0;
  const sauces = order.sauces.length ? order.sauces : [];
  if (!sauces.length) return [];

  if (order.sauceMode === "single" || sauces.length === 1) {
    return [{ sauce: sauces[0], amount: total }];
  }

  const parts = sauces.length;
  const base = Math.floor(total / parts);
  let remainder = total % parts;

  return sauces.map((sauce) => {
    const amount = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return { sauce, amount };
  });
}

function sauceSummary(order) {
  const counts = sauceCounts(order);

  if (counts.length === 1 && counts[0].amount === order.quantity) {
    return `all ${counts[0].sauce}`;
  }

  return counts
    .map(({ sauce, amount }) => `${amount} ${sauce}`)
    .join(" and ");
}

function parseCoreOrder(text, order) {
  const quantity = extractNumber(text);
  const style = extractStyle(text);
  const sauces = extractSauces(text);

  if (quantity) order.quantity = quantity;
  if (style) order.style = style;

  if (sauces.length) {
    if (wantsSingleSauce(text) || sauces.length === 1) {
      order.sauces = [sauces[0]];
      order.sauceMode = "single";
      order.noMoreSauces = true;
    } else {
      order.sauces = [];
      order.sauceMode = "split";
      order.noMoreSauces = false;
      for (const sauce of sauces) {
        if (!order.sauces.includes(sauce)) order.sauces.push(sauce);
      }
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

  if (missing === "quantity") {
    return pick([
      "How many wings can I get you?",
      "How many wings you thinking?",
      "How many would you like?"
    ]);
  }

  if (missing === "style") {
    return pick([
      "Classic or boneless?",
      "You want classic or boneless?",
      "Classic or boneless on that?"
    ]);
  }

  if (missing === "sauce") {
    return pick([
      "What sauce you want on that?",
      "What sauce would you like?",
      "What flavor you want?"
    ]);
  }

  return null;
}

function addSauces(order, newSauces, originalText = "") {
  const max = sauceSlotsAllowed(order.quantity);

  if (!newSauces.length) return;

  if (wantsSingleSauce(originalText) || /\b(just|only|all)\b/.test(originalText) || newSauces.length === 1) {
    order.sauces = [newSauces[0]];
    order.sauceMode = "single";
    order.noMoreSauces = true;
    return;
  }

  if (order.sauceMode === "single") {
    order.sauceMode = "split";
    order.noMoreSauces = false;
  }

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
    return sayAndStore(
      session,
      res,
      pick([
        "No problem. Let’s start fresh. What can I get started for you?",
        "Alright, let’s start over. What can I get for you?",
        "Sure thing. What can I get started for you?"
      ])
    );
  }

  if (wantsRepeat(speech)) {
    return speak(res, session.lastPrompt || "Sure. What can I get started for you?");
  }

  if (wantsHold(speech)) {
    session.hold = true;
    return sayAndStore(
      session,
      res,
      pick([
        "Of course. Take your time. Just say ready when you’re set.",
        "No problem. Just say ready when you’re good.",
        "You got it. Say ready when you’re set."
      ])
    );
  }

  if (session.hold) {
    if (wantsResume(speech)) {
      session.hold = false;
      return sayAndStore(session, res, pick(["Perfect. Go ahead.", "Alright, I’m ready.", "Go for it."]));
    }
    return speak(res, "No rush. Just say ready when you’re set.");
  }

  if (wantsChangeSauce(speech) && session.order.quantity) {
    const newSauces = extractSauces(speech);
    session.order.sauces = [];
    session.order.sauceMode = "split";
    session.order.noMoreSauces = false;

    if (newSauces.length) {
      addSauces(session.order, newSauces, speech);
      const dips = dipSlotsAllowed(session.order.quantity);
      session.stage = "included_dip";
      return sayAndStore(
        session,
        res,
        pick([
          `Perfect. I’ve got ${sauceSummary(session.order)}. Ranch or blue cheese with that? You get ${formatCountNoun(dips, "dip", "dips")}.`,
          `Alright, ${sauceSummary(session.order)}. That comes with ${formatCountNoun(dips, "dip", "dips")}. Ranch or blue cheese?`
        ])
      );
    }

    session.stage = "sauce";
    return sayAndStore(session, res, pick([
      "Absolutely. What sauce you want instead?",
      "Sure thing. What sauce would you like?",
      "Got you. What flavor do you want instead?"
    ]));
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

  if (!speech) {
    if (session.stage === "name") {
      return reprompt(session, res, "Sorry, I didn’t catch the name. What name can I put that under?");
    }
    if (session.stage === "extra_upsell") {
      return reprompt(session, res, "Want extra ranch or blue cheese, or maybe a side?");
    }
    if (session.stage === "included_dip") {
      return reprompt(session, res, "Ranch or blue cheese with that?");
    }
    if (session.stage === "sauce" || session.stage === "sauce_more_or_done") {
      return reprompt(session, res, "What sauce would you like?");
    }
    return reprompt(session, res, "Sorry, I missed that. What can I get started for you?");
  }

  const interrupt = handleInterruptions(session, speech, res);
  if (interrupt) return interrupt;

  if (session.stage === "language") {
    session.stage = "order";
    return sayAndStore(session, res, pick([
      "What can I get started for you?",
      "What can I get for you today?",
      "What are we having today?"
    ]));
  }

  if (session.stage === "order") {
    parseCoreOrder(speech, session.order);

    const missing = missingCore(session.order);
    if (missing) {
      if (missing === "sauce") session.stage = "sauce";
      return sayAndStore(session, res, nextPromptForMissing(session.order));
    }

    const allowed = sauceSlotsAllowed(session.order.quantity);

    if (!session.order.noMoreSauces && session.order.sauceMode !== "single" && session.order.sauces.length < allowed) {
      session.stage = "sauce_more_or_done";
      return sayAndStore(
        session,
        res,
        pick([
          `Got you. You can do up to ${allowed} sauces. Right now I have ${sauceSummary(session.order)}. Want to add another or keep it like that?`,
          `Perfect. I’ve got ${sauceSummary(session.order)} so far. You can do up to ${allowed} sauces. Add another or keep it like that?`
        ])
      );
    }

    session.stage = "included_dip";
    const dips = dipSlotsAllowed(session.order.quantity);
    return sayAndStore(
      session,
      res,
      pick([
        `Perfect. I’ve got ${sauceSummary(session.order)}. Ranch or blue cheese with that? You get ${formatCountNoun(dips, "dip", "dips")}.`,
        `Alright, ${sauceSummary(session.order)}. That comes with ${formatCountNoun(dips, "dip", "dips")}. Ranch or blue cheese?`,
        `Got it. ${sauceSummary(session.order)}. For the dips, ranch or blue cheese? You get ${formatCountNoun(dips, "dip", "dips")}.`
      ])
    );
  }

  if (session.stage === "sauce") {
    const quantityCorrection = extractNumber(speech);
    const styleCorrection = extractStyle(speech);

    if (quantityCorrection) session.order.quantity = quantityCorrection;
    if (styleCorrection) session.order.style = styleCorrection;

    const sauces = extractSauces(speech);
    if (!sauces.length) {
      return sayAndStore(session, res, pick([
        "Sorry, what sauce was that?",
        "I missed the sauce. What flavor do you want?",
        "Sorry, which sauce did you want?"
      ]));
    }

    session.order.sauces = [];
    session.order.sauceMode = "split";
    session.order.noMoreSauces = false;
    addSauces(session.order, sauces, speech);

    const allowed = sauceSlotsAllowed(session.order.quantity);
    if (!session.order.noMoreSauces && session.order.sauceMode !== "single" && session.order.sauces.length < allowed) {
      session.stage = "sauce_more_or_done";
      return sayAndStore(
        session,
        res,
        pick([
          `Perfect. Right now I have ${sauceSummary(session.order)}. You can do up to ${allowed} sauces. Want to add another or keep it like that?`,
          `Got it. So far I have ${sauceSummary(session.order)}. Want another sauce or keep it like that?`
        ])
      );
    }

    session.stage = "included_dip";
    const dips = dipSlotsAllowed(session.order.quantity);
    return sayAndStore(
      session,
      res,
      pick([
        `Perfect. I’ve got ${sauceSummary(session.order)}. Ranch or blue cheese with that? You get ${formatCountNoun(dips, "dip", "dips")}.`,
        `Alright, ${sauceSummary(session.order)}. That comes with ${formatCountNoun(dips, "dip", "dips")}. Ranch or blue cheese?`
      ])
    );
  }

  if (session.stage === "sauce_more_or_done") {
    const quantityCorrection = extractNumber(speech);
    const styleCorrection = extractStyle(speech);

    if (quantityCorrection && quantityCorrection !== session.order.quantity) {
      session.order.quantity = quantityCorrection;
      const allowed = sauceSlotsAllowed(session.order.quantity);
      if (session.order.sauceMode !== "single" && session.order.sauces.length > allowed) {
        session.order.sauces = session.order.sauces.slice(0, allowed);
      }
      return sayAndStore(
        session,
        res,
        `Got it. Now I have ${session.order.quantity} ${session.order.style || ""}`.replace(/\s+/g, " ").trim() +
          `. Right now the sauces are ${sauceSummary(session.order)}. Want to add another or keep it like that?`
      );
    }

    if (styleCorrection && styleCorrection !== session.order.style) {
      session.order.style = styleCorrection;
      return sayAndStore(
        session,
        res,
        pick([
          `Perfect. I switched that to ${session.order.style}. Right now I have ${sauceSummary(session.order)}. Want to add another or keep it like that?`,
          `Got it. ${session.order.style} now. Sauces are ${sauceSummary(session.order)}. Add another or keep it like that?`
        ])
      );
    }

    if (isNo(speech) || speech.includes("keep")) {
      session.order.noMoreSauces = true;
    }

    const sauces = extractSauces(speech);
    if (sauces.length) {
      addSauces(session.order, sauces, speech);
    }

    const allowed = sauceSlotsAllowed(session.order.quantity);

    if (!session.order.noMoreSauces && session.order.sauceMode !== "single" && sauces.length && session.order.sauces.length < allowed) {
      const remaining = allowed - session.order.sauces.length;
      return sayAndStore(
        session,
        res,
        pick([
          `Got it. I have ${sauceSummary(session.order)}. You can still add ${remaining} more sauce${remaining > 1 ? "s" : ""}, or keep it like that.`,
          `Perfect. Right now it’s ${sauceSummary(session.order)}. You can still add ${remaining} more sauce${remaining > 1 ? "s" : ""}, or leave it there.`
        ])
      );
    }

    if (!sauces.length && !isNo(speech) && !isYes(speech) && !speech.includes("keep")) {
      return sayAndStore(
        session,
        res,
        pick([
          `Sorry, I missed that. Right now I have ${sauceSummary(session.order)}. Want to add another or keep it like that?`,
          `I missed that part. Right now it’s ${sauceSummary(session.order)}. Add another or keep it like that?`
        ])
      );
    }

    session.stage = "included_dip";
    const dips = dipSlotsAllowed(session.order.quantity);
    return sayAndStore(
      session,
      res,
      pick([
        `Perfect. I’ve got ${sauceSummary(session.order)}. Ranch or blue cheese with that? You get ${formatCountNoun(dips, "dip", "dips")}.`,
        `Alright, ${sauceSummary(session.order)}. That comes with ${formatCountNoun(dips, "dip", "dips")}. Ranch or blue cheese?`
      ])
    );
  }

  if (session.stage === "included_dip") {
    const quantityCorrection = extractNumber(speech);
    const styleCorrection = extractStyle(speech);

    if (quantityCorrection && quantityCorrection !== session.order.quantity) {
      session.order.quantity = quantityCorrection;
      session.order.includedDips = [];
      session.order.extraDips = [];
      return sayAndStore(
        session,
        res,
        `Got it. That now comes with ${formatCountNoun(dipSlotsAllowed(session.order.quantity), "dip", "dips")}. Ranch or blue cheese?`
      );
    }

    if (styleCorrection && styleCorrection !== session.order.style) {
      session.order.style = styleCorrection;
    }

    const dips = extractDips(speech);
    const max = dipSlotsAllowed(session.order.quantity);

    if (!dips.length) {
      return sayAndStore(
        session,
        res,
        pick([
          `That comes with ${formatCountNoun(max, "dip", "dips")}. Ranch or blue cheese?`,
          `For the dips, ranch or blue cheese? You get ${formatCountNoun(max, "dip", "dips")}.`
        ])
      );
    }

    session.order.includedDips = [];

    if (wantsAllSameDip(speech) || dips.length === 1) {
      fillRemainingIncludedDipsWith(session.order, dips[0]);
    } else {
      addSpecificIncludedDips(session.order, dips);
      if (session.order.includedDips.length < max) {
        return sayAndStore(
          session,
          res,
          `Got it. Right now you have ${dipSummary(session.order.includedDips)}. I still need ${max - session.order.includedDips.length} more. Ranch or blue cheese?`
        );
      }
    }

    session.stage = "extra_upsell";
    return sayAndStore(
      session,
      res,
      pick([
        `Perfect. That gives you ${dipSummary(session.order.includedDips)}. Want extra ranch or maybe a side like fries or mac bites?`,
        `Got it. I have ${dipSummary(session.order.includedDips)}. Want to add extra ranch, or maybe fries or mac bites?`,
        `Alright. You’ve got ${dipSummary(session.order.includedDips)}. Want any extra ranch or maybe a side?`
      ])
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
        pick([
          `Perfect. I’ve got extra ${dipSummary(session.order.extraDips)}. Anything else?`,
          `Got it. Added extra ${dipSummary(session.order.extraDips)}. Anything else for you?`,
          `Alright, extra ${dipSummary(session.order.extraDips)}. Anything else?`
        ])
      );
    }

    if (side) {
      session.order.extraSide = side;
      session.stage = "name";
      return sayAndStore(
        session,
        res,
        pick([
          `Perfect, adding ${side}. What name can I put that under?`,
          `Got you. I added ${side}. What name is the order under?`,
          `Alright, ${side} added. What name can I put on it?`
        ])
      );
    }

    if (isNo(speech)) {
      session.stage = "name";
      return sayAndStore(
        session,
        res,
        pick([
          "Perfect. What name can I put that under?",
          "Sounds good. What name is the order under?",
          "Alright. What name can I put on it?"
        ])
      );
    }

    return sayAndStore(
      session,
      res,
      pick([
        "Sorry, I missed that. Want extra ranch or blue cheese, or maybe a side?",
        "Sorry, do you want any extra ranch or maybe a side?",
        "I missed that part. Extra ranch or maybe a side?"
      ])
    );
  }

  if (session.stage === "name") {
    const name = extractName(speech);
    if (!name) {
      return sayAndStore(
        session,
        res,
        pick([
          "Sorry, I didn’t catch the name. What name can I put that under?",
          "I missed the name. What should I put it under?",
          "Sorry about that. What name is it under?"
        ])
      );
    }

    session.order.name = name;
    return sayAndStore(
      session,
      res,
      pick([
        `Perfect, ${name}. You’re all set. We’ll have it ready for you shortly.`,
        `Got it, ${name}. Your order’s all set. We’ll have that ready for you soon.`,
        `Alright, ${name}. You’re good to go. We’ll have it ready shortly.`
      ]),
      true
    );
  }

  session.stage = "order";
  return sayAndStore(
    session,
    res,
    pick([
      "Let’s get started. What can I get for you?",
      "What can I get started for you?",
      "Go ahead, what can I get for you?"
    ])
  );
});

app.get("/", (req, res) => {
  res.send("Jeffrey AI Cashier is running.");
});

app.listen(PORT, () => {
  console.log("Jeffrey server running on port", PORT);
});
