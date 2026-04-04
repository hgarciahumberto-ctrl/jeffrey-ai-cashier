import express from "express";
import twilio from "twilio";

const {
  twiml: { VoiceResponse }
} = twilio;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Twilio legacy TTS settings
const ENGLISH_VOICE = process.env.TWILIO_VOICE_EN || process.env.TWILIO_VOICE || "Polly.Matthew";
const SPANISH_VOICE = process.env.TWILIO_VOICE_ES || "Polly.Mia";
const ENGLISH_LANGUAGE = "en-US";
const SPANISH_LANGUAGE = "es-MX";

const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

const SAUCE_ALIASES = [
  { keys: ["al pastor", "pastor"], value: "al pastor" },
  { keys: ["mild", "buffalo mild", "suave"], value: "mild" },
  { keys: ["hot", "buffalo hot", "picosa", "picante"], value: "hot" },
  { keys: ["lime pepper", "limon pepper", "limon pimienta", "limón pimienta"], value: "lime pepper" },
  { keys: ["garlic parmesan", "garlic parm", "garlic parme", "parm", "parmesan", "ajo parmesano"], value: "garlic parmesan" },
  { keys: ["mango habanero"], value: "mango habanero" },
  { keys: ["teriyaki"], value: "teriyaki" },
  { keys: ["barbecue", "barbeque", "bbq", "barbacoa"], value: "barbeque" },
  { keys: ["green chile", "green chili", "chile verde"], value: "green chile" },
  { keys: ["sweet and spicy", "sweet & spicy", "dulce y picosa", "dulce y picante"], value: "sweet and spicy" },
  { keys: ["citrus chipotle", "chipotle citrico", "chipotle cítrico"], value: "citrus chipotle" },
  { keys: ["bbq chiltepin", "barbecue chiltepin", "barbeque chiltepin", "barbacoa chiltepin"], value: "bbq chiltepin" },
  { keys: ["chocolate chiltepin"], value: "chocolate chiltepin" },
  { keys: ["cinnamon roll", "canela"], value: "cinnamon roll" },
  { keys: ["chorizo"], value: "chorizo" },
  { keys: ["pizza"], value: "pizza" }
];

const EXTRA_SIDE_ALIASES = [
  { keys: ["fries", "regular fries", "french fries", "papas", "papas fritas"], value: "regular fries" },
  { keys: ["mac bites", "mac bite", "mac", "mac and cheese bites", "mac n cheese bites"], value: "mac bites" },
  { keys: ["corn ribs", "elote ribs", "costillas de elote", "elote"], value: "corn ribs" },
  { keys: ["mozzarella sticks", "mozzarella", "dedos de mozzarella", "queso mozzarella"], value: "mozzarella sticks" },
  { keys: ["onion rings", "aros de cebolla"], value: "onion rings" },
  { keys: ["potato salad", "ensalada de papa"], value: "potato salad" },
  { keys: ["flyin corn", "flying corn", "corn", "elote entero"], value: "flyin corn" }
];

const DIP_ALIASES = [
  { keys: ["ranch"], value: "ranch" },
  { keys: ["blue cheese", "bleu cheese", "queso azul"], value: "blue cheese" },
  { keys: ["chipotle ranch", "ranch chipotle"], value: "chipotle ranch" },
  { keys: ["jalapeno ranch", "jalapeño ranch", "ranch jalapeno", "ranch jalapeño"], value: "jalapeño ranch" }
];

const sessions = new Map();
const callStates = new Map();

function blankOrder() {
  return {
    quantity: null,
    style: null,
    sauces: [],
    sauceMode: "split",
    sauceOnSide: false,
    countedSauceParts: [],
    pendingCountedSauceConfirmation: false,
    pendingMixedSauceCharge: false,
    includedDips: [],
    extraDips: [],
    extraSide: null,
    name: null,
    noMoreSauces: false,
    pendingLemonPepperConfirmation: false,
    pendingFlyinFriesClarification: false
  };
}

function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, {
      stage: "language",
      languageMode: "unknown",
      languageLocked: false,
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
  session.languageMode = "unknown";
  session.languageLocked = false;
  session.lastPrompt = "";
  session.hold = false;
  session.reprompts = 0;
  session.order = blankOrder();
}

function getOrCreateCallState(callId) {
  if (!callStates.has(callId)) {
    callStates.set(callId, {
      language: "unknown",
      languageLocked: false,
      customerName: null,
      items: [],
      currentItem: null,
      stage: "ordering",
      flags: {
        saucesConfirmed: false,
        dipsOffered: false,
        upsellOffered: false
      }
    });
  }
  return callStates.get(callId);
}

function normalize(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(options) {
  return options[Math.floor(Math.random() * options.length)];
}

function detectLanguageMode(text = "") {
  const input = normalize(text);

  const spanishSignals = [
    "hola", "quiero", "me da", "me das", "para llevar", "pedido", "orden",
    "alitas", "con hueso", "salsa", "sabor", "nombre",
    "a nombre de", "ponlo a nombre de", "gracias", "si", "claro",
    "espanol", "español", "hablas espanol", "hablas español"
  ];

  const englishSignals = [
    "hi", "hello", "can i get", "i want", "to go", "order",
    "wings", "bone in", "bone-in", "sauce", "flavor", "blue cheese", "name",
    "put it under", "thank you", "yes", "sure", "english"
  ];

  let spanishCount = 0;
  let englishCount = 0;

  for (const word of spanishSignals) {
    if (input.includes(word)) spanishCount += 1;
  }

  for (const word of englishSignals) {
    if (input.includes(word)) englishCount += 1;
  }

  if (spanishCount >= 2 && englishCount >= 2) return "spanglish";
  if (spanishCount > englishCount) return "es";
  if (englishCount > spanishCount) return "en";
  return "unknown";
}

function storeLanguageFromSpeech(session, speech) {
  if (session.languageLocked) return;

  const detected = detectLanguageMode(speech);
  if (detected === "unknown") return;

  if (session.languageMode === "unknown") {
    session.languageMode = detected;
    return;
  }

  if (detected === "spanglish") {
    session.languageMode = "spanglish";
    return;
  }

  if (session.languageMode !== "spanglish") {
    session.languageMode = detected;
  }
}

function explicitLockCallLanguage(state, lang) {
  if (lang !== "es" && lang !== "en") return;
  state.language = lang;
  state.languageLocked = true;
}

function maybeUpdateCallLanguage(state, text = "") {
  if (state.languageLocked) return;

  const detected = detectLanguageMode(text);
  if (detected === "unknown") return;

  if (!state.language || state.language === "unknown") {
    state.language = detected;
    return;
  }

  if (detected === "spanglish") {
    state.language = "spanglish";
    return;
  }

  if (state.language !== "spanglish") {
    state.language = detected;
  }
}

function sayByLanguage(session, english, spanish, spanglish = null) {
  if (session.languageMode === "es") return spanish;
  if (session.languageMode === "spanglish") return spanglish || english;
  return english;
}

function sayForCall(state, english, spanish, spanglish = null) {
  if (state.language === "es") return spanish;
  if (state.language === "spanglish") return spanglish || english;
  return english;
}

function getSpeechConfig(session) {
  if (session?.languageMode === "es" || session?.languageMode === "spanglish") {
    return { voice: SPANISH_VOICE, language: SPANISH_LANGUAGE };
  }
  return { voice: ENGLISH_VOICE, language: ENGLISH_LANGUAGE };
}

function speak(session, res, message, hangup = false) {
  const vr = new VoiceResponse();
  const speechConfig = getSpeechConfig(session);

  if (hangup) {
    vr.say(speechConfig, message);
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
    gather.say(speechConfig, message);
  }

  res.type("text/xml").send(vr.toString());
}

function sayAndStore(session, res, message, hangup = false) {
  session.lastPrompt = message;
  if (!hangup) session.reprompts = 0;
  return speak(session, res, message, hangup);
}

function reprompt(session, res, fallback) {
  session.reprompts += 1;

  if (session.reprompts >= 2) {
    return sayAndStore(session, res, fallback);
  }

  return speak(session, res, session.lastPrompt || fallback);
}

function findAlias(text, aliasList) {
  for (const item of aliasList) {
    for (const key of item.keys) {
      if (text.includes(normalize(key))) return item.value;
    }
  }
  return null;
}

function extractAllAliases(text, aliasList) {
  const found = [];
  for (const item of aliasList) {
    for (const key of item.keys) {
      if (text.includes(normalize(key))) {
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

  const patterns = [
    { re: /\b(six|seis)\b/, value: 6 },
    { re: /\b(nine|nueve)\b/, value: 9 },
    { re: /\b(twelve|doce)\b/, value: 12 },
    { re: /\b(eighteen|dieciocho)\b/, value: 18 },
    { re: /\b(twenty[\s-]?four|veinticuatro)\b/, value: 24 },
    { re: /\b(forty[\s-]?eight|cuarenta y ocho)\b/, value: 48 }
  ];

  for (const p of patterns) {
    if (p.re.test(text)) return p.value;
  }

  return null;
}

function extractStyle(text) {
  if (/\b(boneless)\b/.test(text)) return "boneless";

  if (/\b(classic|traditional|bone in|bone-in|con hueso|alitas|clasicas|clasica|clásicas|clásica)\b/.test(text)) {
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

  if (text.includes("one") || text.includes("uno") || text.includes("una")) return 1;
  if (text.includes("two") || text.includes("dos")) return 2;
  if (text.includes("three") || text.includes("tres")) return 3;

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
    /put it under (.+)/i,
    /mi nombre es (.+)/i,
    /soy (.+)/i,
    /a nombre de (.+)/i,
    /ponlo a nombre de (.+)/i
  ];

  for (const p of patterns) {
    const m = cleaned.match(p);
    if (m && m[1]) return formatName(m[1]);
  }

  if (/^[a-zA-ZÀ-ÿ\s'-]{2,30}$/.test(cleaned)) {
    return formatName(cleaned);
  }

  return null;
}

function formatName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isYes(text) {
  return /\b(yes|yeah|yep|sure|okay|ok|sounds good|that works|go ahead|correct|si|correcto|claro|dale|esta bien|asi es|sale|va)\b/.test(text);
}

function isNo(text) {
  return /\b(no|nope|nah|nothing else|that s all|thats all|no thank you|im good|i m good|just that|keep it like that|that s fine|thats fine|thatll be all|that ll be all|nada mas|solo eso|asi dejalo|esta bien asi|con eso|nomas eso|no gracias)\b/.test(text);
}

function wantsRepeat(text) {
  return /\b(repeat|say that again|again|what was that|come again|repite|otra vez)\b/.test(text);
}

function wantsHold(text) {
  return /\b(wait|hold on|one second|one sec|just a second|give me a second|espera|un segundo|tantito)\b/.test(text);
}

function wantsResume(text) {
  return /\b(ready|go ahead|continue|okay|ok|i m ready|im ready|listo|lista|dale|continua)\b/.test(text);
}

function wantsStartOver(text) {
  return /\b(start over|restart|begin again|let s start over|lets start over|empezar de nuevo|otra vez desde el principio)\b/.test(text);
}

function wantsChangeSauce(text) {
  return /\b(change the sauce|different sauce|switch the sauce|another sauce|make that|instead|cambia la salsa|otra salsa|mejor)\b/.test(text);
}

function wantsSingleSauce(text) {
  return /\b(one sauce|just one sauce|single sauce|all one sauce|all mild|all hot|all bbq|all barbeque|all barbecue|all lime pepper|all garlic parmesan|all mango habanero|all teriyaki|all green chile|all sweet and spicy|all citrus chipotle|all bbq chiltepin|all chocolate chiltepin|all cinnamon roll|una salsa|solo una salsa|todas igual)\b/.test(text);
}

function wantsAllSameDip(text) {
  return /\b(all ranch|just ranch|all blue cheese|just blue cheese|todo ranch|todo queso azul|todo blue cheese|solo ranch|solo queso azul|solo blue cheese)\b/.test(text);
}

function wantsSpanish(text) {
  return /\b(spanish|espanol|español|hablas espanol|hablas español|en espanol|en español)\b/.test(text);
}

function wantsEnglish(text) {
  return /\b(english|ingles|inglés|speak english|hablas ingles|hablas inglés|in english)\b/.test(text);
}

function mentionsAlcohol(text) {
  return /\b(beer|cerveza|alcohol|michelada|modelo|bud light|coors|corona|wine|vino|whiskey|tequila|vodka)\b/.test(text);
}

function looksLikeOrder(text) {
  return !!(
    extractNumber(text) ||
    extractStyle(text) ||
    extractSauces(text).length ||
    extractDips(text).length ||
    extractExtraSide(text) ||
    mentionsFlyinFries(text)
  );
}

function wordToNumber(value) {
  const text = normalize(String(value));
  const map = {
    "6": 6,
    seis: 6,
    six: 6,
    "9": 9,
    nueve: 9,
    nine: 9,
    "12": 12,
    doce: 12,
    twelve: 12,
    "18": 18,
    dieciocho: 18,
    eighteen: 18,
    "24": 24,
    veinticuatro: 24,
    "twenty four": 24,
    "48": 48,
    "cuarenta y ocho": 48,
    "forty eight": 48
  };
  return map[text] || null;
}

function extractCountedSauceParts(text) {
  const input = normalize(text);
  const parts = [];
  const counts = Array.from(
    input.matchAll(/\b(\d+|seis|six|nueve|nine|doce|twelve|dieciocho|eighteen|veinticuatro|twenty four|cuarenta y ocho|forty eight)\b\s+([a-z\s]+?)(?=\s+(?:y|and)\s+\d|$)/g)
  );

  for (const match of counts) {
    const count = wordToNumber(match[1]);
    const sauce = findAlias(normalize(match[2]), SAUCE_ALIASES);
    if (count && sauce) {
      parts.push({ sauce, count });
    }
  }

  return parts;
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
  if (order.countedSauceParts.length) {
    return order.countedSauceParts.map(({ sauce, count }) => `${count} ${sauce}`).join(" and ");
  }

  const counts = sauceCounts(order);

  if (counts.length === 1 && counts[0].amount === order.quantity) {
    return `all ${counts[0].sauce}`;
  }

  return counts.map(({ sauce, amount }) => `${amount} ${sauce}`).join(" and ");
}

function itemTypeDisplay(style, lang = "en") {
  if (lang === "es") {
    return style === "boneless" ? "boneless" : "alitas con hueso";
  }
  return style === "boneless" ? "boneless" : "bone-in wings";
}

function countPartsTotal(parts) {
  return parts.reduce((sum, part) => sum + part.count, 0);
}

function mentionsLemonPepper(text) {
  return /\b(lemon pepper|lemon)\b/.test(normalize(text));
}

function mentionsSauceOnSide(text) {
  return /\b(on the side|sauce on the side|on side|separate|separado|por separado|aparte|a un lado)\b/.test(normalize(text));
}

function mentionsMixedSameBatch(text) {
  return /\b(mixed together|mix it|mezcladas|mezclada|mitad y mitad|half and half|mixed with)\b/.test(normalize(text));
}

function mentionsFlyinFries(text) {
  return /\b(flyin fries|flying fries|buffalo ranch fries|junior flyin fries|flyin fries junior)\b/.test(normalize(text));
}

function friesClarificationType(text) {
  const input = normalize(text);
  const saysFlyin = /\b(flyin fries|flying fries|junior flyin fries|flyin fries junior)\b/.test(input);
  const saysBuffalo = /\b(buffalo ranch fries)\b/.test(input);

  if (saysFlyin && saysBuffalo) return "ambiguous";
  if (saysFlyin) return "flyin";
  if (saysBuffalo) return "buffalo";
  return null;
}

function parseCoreOrder(text, order) {
  const quantity = extractNumber(text);
  const style = extractStyle(text);
  const sauces = extractSauces(text);
  const countedSauceParts = extractCountedSauceParts(text);

  if (quantity) order.quantity = quantity;
  if (style) order.style = style;
  if (mentionsSauceOnSide(text)) order.sauceOnSide = true;
  if (mentionsLemonPepper(text)) order.pendingLemonPepperConfirmation = true;

  if (countedSauceParts.length) {
    order.countedSauceParts = countedSauceParts;
    order.sauces = countedSauceParts.map((p) => p.sauce);
    order.sauceMode = "split";
    order.pendingCountedSauceConfirmation = true;
    order.noMoreSauces = true;
    return;
  }

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

  if (mentionsMixedSameBatch(text) && sauces.length >= 2) {
    order.pendingMixedSauceCharge = true;
  }
}

function missingCore(order) {
  if (!order.quantity) return "quantity";
  if (!order.style) return "style";
  if (!order.sauces.length) return "sauce";
  return null;
}

function nextPromptForMissing(session, order) {
  const missing = missingCore(order);

  if (missing === "quantity") {
    return sayByLanguage(
      session,
      pick([
        "How many would you like?",
        "How many are you thinking?",
        "How many can I get you?"
      ]),
      pick([
        "¿Cuántas quieres?",
        "¿Cuántas te preparo?",
        "¿De cuántas te hago la orden?"
      ])
    );
  }

  if (missing === "style") {
    return sayByLanguage(
      session,
      pick([
        "Bone-in or boneless?",
        "You want bone-in or boneless?",
        "Bone-in or boneless on that?"
      ]),
      pick([
        "¿Con hueso o boneless?",
        "¿Las quieres con hueso o boneless?",
        "¿Van con hueso o boneless?"
      ])
    );
  }

  if (missing === "sauce") {
    return sayByLanguage(
      session,
      pick([
        "What sauces do you want?",
        "What flavor would you like?",
        "What sauce do you want on that?"
      ]),
      pick([
        "¿Qué sabores quieres?",
        "¿Qué salsa quieres?",
        "¿Qué salsas quieres?"
      ])
    );
  }

  return null;
}

function addSauces(order, newSauces, originalText = "") {
  const max = sauceSlotsAllowed(order.quantity);

  if (!newSauces.length) return;

  if (mentionsLemonPepper(originalText)) {
    order.pendingLemonPepperConfirmation = true;
  }

  if (wantsSingleSauce(originalText) || /\b(just|only|all|solo|una)\b/.test(originalText) || newSauces.length === 1) {
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

  if (mentionsMixedSameBatch(originalText) && newSauces.length >= 2) {
    order.pendingMixedSauceCharge = true;
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

function lemonPepperPrompt(session) {
  return sayByLanguage(
    session,
    "Just so you know, we have that as lime pepper here. Want to keep lime pepper or change it?",
    "Nomás para confirmar, aquí la tenemos como lime pepper. ¿La dejamos así o la cambias?"
  );
}

function countedSauceConfirmationPrompt(session, order) {
  const total = countPartsTotal(order.countedSauceParts);
  return sayByLanguage(
    session,
    `Perfect. I have ${sauceSummary(order)}, for a total of ${total}. Is that right?`,
    `Perfecto. Tengo ${sauceSummary(order)}, para un total de ${total}. ¿Así está bien?`
  );
}

function mixedSauceChargePrompt(session) {
  return sayByLanguage(
    session,
    "We can do that mix on the same batch. It does add an extra sauce charge. Want to keep it like that?",
    "Sí se puede mezclar en la misma tanda. Nomás lleva cargo por salsa extra. ¿Así lo dejamos?"
  );
}

function flyinFriesClarificationPrompt(session) {
  return sayByLanguage(
    session,
    "Just to make sure, did you mean Flyin’ Fries with boneless on top, or Buffalo Ranch Fries?",
    "Nomás para confirmar, ¿quieres las Flyin’ Fries con boneless arriba o las Buffalo Ranch Fries?"
  );
}

function dipsPromptAfterSauce(session, order) {
  const dips = dipSlotsAllowed(order.quantity);
  return sayByLanguage(
    session,
    `What dips do you want with that? You get ${formatCountNoun(dips, "dip", "dips")}. Ranch, blue cheese, chipotle ranch, or jalapeño ranch?`,
    `¿Qué dips quieres con eso? Te incluye ${formatCountNoun(dips, "dip", "dips")}. ¿Ranch, blue cheese, chipotle ranch o jalapeño ranch?`
  );
}

function handleInterruptions(session, speech, res) {
  if (wantsStartOver(speech)) {
    resetSession(session);
    session.stage = "order";
    const message = sayByLanguage(
      session,
      pick([
        "No problem. Let’s start fresh. What can I get started for you?",
        "Alright, let’s start over. What can I get for you?",
        "Sure thing. What can I get started for you?"
      ]),
      pick([
        "No hay problema. Empezamos de nuevo. ¿Qué te preparo?",
        "Claro. Vamos de nuevo. ¿Qué te doy?",
        "Perfecto. Empezamos otra vez. ¿Qué te preparo?"
      ])
    );
    return sayAndStore(session, res, message);
  }

  if (wantsRepeat(speech)) {
    return speak(
      session,
      res,
      session.lastPrompt || sayByLanguage(session, "Sure. What can I get started for you?", "Claro. ¿Qué te preparo?")
    );
  }

  if (wantsHold(speech)) {
    session.hold = true;
    const message = sayByLanguage(
      session,
      pick([
        "Of course. Take your time. Just say ready when you’re set.",
        "No problem. Just say ready when you’re good.",
        "You got it. Say ready when you’re set."
      ]),
      pick([
        "Claro. Tómate tu tiempo. Nomás dime listo cuando estés.",
        "Sin problema. Dime listo cuando quieras seguir.",
        "Claro. Aquí te espero. Dime listo cuando estés."
      ])
    );
    return sayAndStore(session, res, message);
  }

  if (session.hold) {
    if (wantsResume(speech)) {
      session.hold = false;
      const message = sayByLanguage(
        session,
        pick(["Perfect. Go ahead.", "Alright, I’m ready.", "Go for it."]),
        pick(["Perfecto. Adelante.", "Listo. Dime.", "Muy bien. Adelante."])
      );
      return sayAndStore(session, res, message);
    }

    return speak(
      session,
      res,
      sayByLanguage(
        session,
        "No rush. Just say ready when you’re set.",
        "Sin prisa. Dime listo cuando quieras seguir."
      )
    );
  }

  if (mentionsAlcohol(speech)) {
    return sayAndStore(
      session,
      res,
      sayByLanguage(
        session,
        "We can’t sell alcohol over the phone.",
        "Por teléfono no manejamos venta de alcohol."
      )
    );
  }

  if (wantsChangeSauce(speech) && session.order.quantity) {
    const newSauces = extractSauces(speech);
    session.order.sauces = [];
    session.order.countedSauceParts = [];
    session.order.sauceMode = "split";
    session.order.noMoreSauces = false;
    session.order.pendingCountedSauceConfirmation = false;
    session.order.pendingMixedSauceCharge = false;
    session.order.pendingLemonPepperConfirmation = false;

    if (newSauces.length) {
      addSauces(session.order, newSauces, speech);

      if (session.order.pendingLemonPepperConfirmation) {
        return sayAndStore(session, res, lemonPepperPrompt(session));
      }

      session.stage = "included_dip";
      return sayAndStore(session, res, dipsPromptAfterSauce(session, session.order));
    }

    session.stage = "sauce";
    return sayAndStore(
      session,
      res,
      sayByLanguage(
        session,
        pick([
          "Absolutely. What sauce do you want instead?",
          "Sure thing. What flavor would you like?",
          "Got you. What sauce do you want instead?"
        ]),
        pick([
          "Claro. ¿Qué salsa quieres mejor?",
          "Sí. ¿Qué sabor quieres ahora?",
          "Sin problema. ¿Qué salsa quieres en lugar de esa?"
        ])
      )
    );
  }

  return null;
}

function qtyToAllowedSauces(quantity) {
  return Math.floor(quantity / 6);
}

function normalizeItemType(itemType = "") {
  const value = normalize(String(itemType));

  if (["wings", "wing", "bone in", "bone-in", "classic", "traditional", "alitas", "con hueso"].includes(value)) {
    return "wings";
  }

  if (["boneless", "sin hueso"].includes(value)) {
    return "boneless";
  }

  return null;
}

function validWingQuantity(quantity) {
  return [6, 9, 12, 18, 24, 48].includes(Number(quantity));
}

function setCurrentItem(state, itemType, quantity) {
  const allowedSauces = qtyToAllowedSauces(quantity);
  state.currentItem = {
    type: itemType,
    quantity,
    sauces: [],
    allowedSauces,
    dipsIncluded: allowedSauces,
    extraDips: [],
    side: null
  };
  state.flags.saucesConfirmed = false;
  state.flags.dipsOffered = false;
}

function toolResult(name, toolCallId, result) {
  return {
    name,
    toolCallId,
    result: JSON.stringify(result)
  };
}

function itemTypeLabel(itemType, lang) {
  if (lang === "es") {
    return itemType === "wings" ? "alitas con hueso" : "boneless";
  }
  return itemType === "wings" ? "bone-in wings" : "boneless";
}

function summarizeItemsForCall(state) {
  const lang = state.language === "es" ? "es" : "en";

  return state.items
    .map((item) => {
      const base = `${item.quantity} ${itemTypeLabel(item.type, lang)}`;
      const sauces = item.sauces.length
        ? lang === "es"
          ? `, salsas: ${item.sauces.join(" y ")}`
          : `, ${item.sauces.join(" and ")}`
        : "";
      const extras = item.extraDips.length
        ? lang === "es"
          ? `, aderezos extra: ${item.extraDips.join(" y ")}`
          : `, extra dips: ${item.extraDips.join(" and ")}`
        : "";
      const side = item.side ? `, side: ${item.side}` : "";
      return `${base}${sauces}${extras}${side}`;
    })
    .join("; ");
}

function getLatestCustomerText(message) {
  const msgs = message?.artifact?.messages;

  if (Array.isArray(msgs)) {
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const msg = msgs[i];
      if (msg?.role === "user" && typeof msg?.message === "string") {
        return msg.message;
      }
    }
  }

  if (typeof message?.customer?.message === "string") {
    return message.customer.message;
  }

  if (typeof message?.transcript === "string") {
    return message.transcript;
  }

  return "";
}

app.get("/", (req, res) => {
  res.send("Jeffrey backend is running.");
});

app.use((req, res, next) => {
  if (req.path === "/vapi/tools") {
    const auth = req.headers.authorization;

    if (!VAPI_WEBHOOK_SECRET) {
      console.error("Missing VAPI_WEBHOOK_SECRET in environment.");
      return res.status(500).json({ error: "Server misconfigured" });
    }

    if (auth !== `Bearer ${VAPI_WEBHOOK_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  next();
});

app.post("/vapi/tools", async (req, res) => {
  try {
    console.log("Vapi tool webhook received:");
    console.log(JSON.stringify(req.body, null, 2));

    const message = req.body?.message;
    if (!message || message.type !== "tool-calls") {
      console.log("No tool-calls in message.");
      return res.status(200).json({ results: [] });
    }

    const callId = message.call?.id || "unknown-call";
    const state = getOrCreateCallState(callId);

    const latestCustomerText = getLatestCustomerText(message);
    maybeUpdateCallLanguage(state, latestCustomerText || "");

    if (wantsSpanish(normalize(latestCustomerText || ""))) {
      explicitLockCallLanguage(state, "es");
    } else if (wantsEnglish(normalize(latestCustomerText || ""))) {
      explicitLockCallLanguage(state, "en");
    }

    const results = [];

    for (const tc of message.toolCallList || []) {
      const { id: toolCallId, name, parameters = {} } = tc;

      switch (name) {
        case "start_order_item": {
          let { itemType, quantity } = parameters;
          itemType = normalizeItemType(itemType);
          quantity = Number(quantity);

          if (!itemType || !validWingQuantity(quantity)) {
            results.push(
              toolResult(name, toolCallId, {
                ok: false,
                speak: sayForCall(
                  state,
                  "I missed part of that order. Was that bone-in or boneless, and how many?",
                  "No alcancé bien esa parte. ¿Eran alitas con hueso o boneless, y cuántas?"
                )
              })
            );
            break;
          }

          setCurrentItem(state, itemType, quantity);

          results.push(
            toolResult(name, toolCallId, {
              ok: true,
              speak: sayForCall(
                state,
                `Got you. What sauces do you want? You can do up to ${state.currentItem.allowedSauces}.`,
                `Perfecto. ¿Qué sabores quieres? Puedes escoger hasta ${state.currentItem.allowedSauces} salsas.`
              )
            })
          );
          break;
        }

        case "update_quantity": {
          const newQuantity = Number(parameters.newQuantity || parameters.quantity);

          if (!state.currentItem) {
            results.push(
              toolResult(name, toolCallId, {
                ok: false,
                speak: sayForCall(
                  state,
                  "I missed which order we were updating. Was that bone-in or boneless?",
                  "No alcancé cuál orden estábamos cambiando. ¿Era con hueso o boneless?"
                )
              })
            );
            break;
          }

          if (!validWingQuantity(newQuantity)) {
            results.push(
              toolResult(name, toolCallId, {
                ok: false,
                speak: sayForCall(
                  state,
                  "That quantity doesn’t match our wing sizes. We have 6, 9, 12, 18, 24, or 48.",
                  "Esa cantidad no coincide con nuestros tamaños. Tenemos 6, 9, 12, 18, 24 o 48."
                )
              })
            );
            break;
          }

          state.currentItem.quantity = newQuantity;
          state.currentItem.allowedSauces = qtyToAllowedSauces(newQuantity);
          state.currentItem.dipsIncluded = state.currentItem.allowedSauces;

          if (state.currentItem.sauces.length > state.currentItem.allowedSauces) {
            state.currentItem.sauces = state.currentItem.sauces.slice(0, state.currentItem.allowedSauces);
          }

          results.push(
            toolResult(name, toolCallId, {
              ok: true,
              speak: sayForCall(
                state,
                `Got you. What sauces do you want? You can do up to ${state.currentItem.allowedSauces}.`,
                `Muy bien. ¿Qué sabores quieres? Puedes escoger hasta ${state.currentItem.allowedSauces} salsas.`
              )
            })
          );
          break;
        }

        case "set_sauces": {
          if (!state.currentItem) {
            results.push(
              toolResult(name, toolCallId, {
                ok: false,
                speak: sayForCall(
                  state,
                  "Let’s lock in the wing size first.",
                  "Primero hay que confirmar cuántas van a ser."
                )
              })
            );
            break;
          }

          let sauces = Array.isArray(parameters.sauces) ? parameters.sauces : [];
          sauces = sauces
            .map((s) => findAlias(normalize(String(s)), SAUCE_ALIASES) || normalize(String(s)))
            .filter(Boolean)
            .slice(0, state.currentItem.allowedSauces);

          if (!sauces.length) {
            results.push(
              toolResult(name, toolCallId, {
                ok: false,
                speak: sayForCall(
                  state,
                  "I missed the sauces. What sauces would you like?",
                  "No alcancé las salsas. ¿Qué sabores quieres?"
                )
              })
            );
            break;
          }

          state.currentItem.sauces = sauces;
          state.flags.saucesConfirmed = true;

          results.push(
            toolResult(name, toolCallId, {
              ok: true,
              speak: sayForCall(
                state,
                `Perfect. What dips do you want with that? You get ${state.currentItem.dipsIncluded}. Ranch, blue cheese, chipotle ranch, or jalapeño ranch?`,
                `Perfecto. ¿Qué dips quieres con eso? Te incluye ${state.currentItem.dipsIncluded} dip${state.currentItem.dipsIncluded === 1 ? "" : "s"}. ¿Quieres ranch, blue cheese, chipotle ranch o jalapeño ranch?`
              )
            })
          );
          break;
        }

        case "add_extra_dips": {
          if (!state.currentItem) {
            results.push(
              toolResult(name, toolCallId, {
                ok: false,
                speak: sayForCall(
                  state,
                  "Let’s finish the wings first.",
                  "Primero terminemos las alitas."
                )
              })
            );
            break;
          }

          const extraDips = Array.isArray(parameters.extraDips)
            ? parameters.extraDips.map((d) => findAlias(normalize(String(d)), DIP_ALIASES) || normalize(String(d))).filter(Boolean)
            : [];

          state.currentItem.extraDips = extraDips;
          state.flags.dipsOffered = true;

          const upsellLine = state.flags.upsellOffered
            ? sayForCall(state, "Anything else I can add for you?", "¿Algo más te agrego?")
            : sayForCall(state, "Want to add fries, mac bites, corn ribs, mozzarella sticks, or onion rings?", "¿Quieres agregar papas, mac bites, corn ribs, mozzarella sticks u onion rings?");

          results.push(
            toolResult(name, toolCallId, {
              ok: true,
              speak: sayForCall(state, `Got you. ${upsellLine}`, `Perfecto. ${upsellLine}`)
            })
          );
          break;
        }

        case "add_side": {
          if (!state.currentItem) {
            results.push(
              toolResult(name, toolCallId, {
                ok: false,
                speak: sayForCall(state, "Let’s get the order started first.", "Primero vamos con la orden.")
              })
            );
            break;
          }

          const normalizedSide = parameters.side
            ? findAlias(normalize(String(parameters.side)), EXTRA_SIDE_ALIASES) || normalize(String(parameters.side))
            : null;

          state.currentItem.side = normalizedSide;
          state.flags.upsellOffered = true;

          results.push(
            toolResult(name, toolCallId, {
              ok: true,
              speak: sayForCall(state, "Perfect. Can I get your name for the order?", "Perfecto. ¿A nombre de quién pongo la orden?")
            })
          );
          break;
        }

        case "set_customer_name": {
          state.customerName = parameters.customerName || null;

          if (!state.customerName) {
            results.push(
              toolResult(name, toolCallId, {
                ok: false,
                speak: sayForCall(state, "I missed the name. What name should I put on the order?", "No alcancé el nombre. ¿A nombre de quién pongo la orden?")
              })
            );
            break;
          }

          if (state.currentItem) {
            state.items.push(state.currentItem);
            state.currentItem = null;
          }

          const itemSummary = summarizeItemsForCall(state);

          results.push(
            toolResult(name, toolCallId, {
              ok: true,
              speak: sayForCall(
                state,
                `Alright, I got you under ${state.customerName} with ${itemSummary}. Everything look right?`,
                `Muy bien, quedó a nombre de ${state.customerName} con ${itemSummary}. ¿Todo está bien?`
              )
            })
          );
          break;
        }

        case "finalize_order": {
          state.stage = "completed";
          results.push(
            toolResult(name, toolCallId, {
              ok: true,
              speak: sayForCall(state, "Perfect, we’ll have that ready for pickup. See you soon.", "Perfecto, tendremos tu orden lista para recoger. Gracias.")
            })
          );
          break;
        }

        default: {
          results.push(
            toolResult(name, toolCallId, {
              ok: false,
              speak: sayForCall(state, "I hit a backend tool I don’t recognize yet.", "Me cayó una herramienta del backend que todavía no reconozco.")
            })
          );
        }
      }
    }

    return res.status(200).json({ results });
  } catch (error) {
    console.error("Error in /vapi/tools:", error);
    return res.status(200).json({ results: [] });
  }
});

app.post("/voice", (req, res) => {
  const session = getSession(req.body.CallSid);
  resetSession(session);
  session.stage = "language";
  session.lastPrompt = "Thank you for calling Flaps and Racks. This is Jeffrey. English or Spanish?";
  return speak(session, res, "Thank you for calling Flaps and Racks. This is Jeffrey. English or Spanish?");
});

app.post("/speech", (req, res) => {
  const session = getSession(req.body.CallSid);
  const speech = normalize(req.body.SpeechResult || "");

  storeLanguageFromSpeech(session, speech);

  if (wantsSpanish(speech)) {
    session.languageMode = "es";
    session.languageLocked = true;

    if (session.stage === "language") {
      session.stage = "order";
      return sayAndStore(session, res, "Claro, sí. ¿Qué te preparo?");
    }

    return sayAndStore(session, res, "Claro. Seguimos en español.");
  }

  if (wantsEnglish(speech)) {
    session.languageMode = "en";
    session.languageLocked = true;

    if (session.stage === "language") {
      session.stage = "order";
      return sayAndStore(session, res, "Of course. What can I get started for you?");
    }

    return sayAndStore(session, res, "Of course. We can continue in English.");
  }

  if (!speech) {
    if (session.stage === "name") {
      return reprompt(session, res, sayByLanguage(session, "Sorry, I didn’t catch the name. What name can I put that under?", "Perdón, no alcancé el nombre. ¿A nombre de quién?"));
    }
    if (session.stage === "extra_upsell") {
      return reprompt(session, res, sayByLanguage(session, "Want extra dips or maybe a side?", "¿Quieres aderezo extra o algún side?"));
    }
    if (session.stage === "included_dip") {
      return reprompt(session, res, sayByLanguage(session, "What dips do you want with that?", "¿Qué dips quieres con eso?"));
    }
    if (session.stage === "sauce" || session.stage === "sauce_more_or_done") {
      return reprompt(session, res, sayByLanguage(session, "What sauces would you like?", "¿Qué sabores quieres?"));
    }
    return reprompt(session, res, sayByLanguage(session, "Sorry, I missed that. What can I get started for you?", "Perdón, no alcancé a escuchar bien. ¿Qué te preparo?"));
  }

  const interrupt = handleInterruptions(session, speech, res);
  if (interrupt) return interrupt;

  if (session.order.pendingLemonPepperConfirmation) {
    if (isYes(speech) || /\b(dejala|dejala asi|asi|keep it|leave it)\b/.test(speech)) {
      session.order.pendingLemonPepperConfirmation = false;
      if (missingCore(session.order) === null) {
        session.stage = "included_dip";
        return sayAndStore(session, res, dipsPromptAfterSauce(session, session.order));
      }
    }

    if (isNo(speech) || wantsChangeSauce(speech)) {
      session.order.pendingLemonPepperConfirmation = false;
      session.order.sauces = session.order.sauces.filter((s) => s !== "lime pepper");
      session.order.countedSauceParts = session.order.countedSauceParts.filter((p) => p.sauce !== "lime pepper");
      session.stage = "sauce";
      return sayAndStore(session, res, sayByLanguage(session, "Got you. What sauce do you want instead?", "Claro. ¿Qué salsa quieres en lugar de esa?"));
    }

    return sayAndStore(session, res, lemonPepperPrompt(session));
  }

  if (session.order.pendingCountedSauceConfirmation) {
    if (isYes(speech)) {
      session.order.pendingCountedSauceConfirmation = false;
      session.stage = "included_dip";
      return sayAndStore(session, res, dipsPromptAfterSauce(session, session.order));
    }

    if (isNo(speech) || wantsChangeSauce(speech)) {
      session.order.pendingCountedSauceConfirmation = false;
      session.order.countedSauceParts = [];
      session.order.sauces = [];
      session.order.noMoreSauces = false;
      session.stage = "sauce";
      return sayAndStore(session, res, sayByLanguage(session, "No problem. What sauces do you want?", "Claro. ¿Qué salsas quieres?"));
    }

    return sayAndStore(session, res, countedSauceConfirmationPrompt(session, session.order));
  }

  if (session.order.pendingMixedSauceCharge) {
    if (isYes(speech)) {
      session.order.pendingMixedSauceCharge = false;
      session.stage = "included_dip";
      return sayAndStore(session, res, dipsPromptAfterSauce(session, session.order));
    }

    if (isNo(speech)) {
      session.order.pendingMixedSauceCharge = false;
      session.stage = "sauce";
      return sayAndStore(session, res, sayByLanguage(session, "Got you. What sauces do you want instead?", "Muy bien. Entonces, ¿qué salsas quieres?"));
    }

    return sayAndStore(session, res, mixedSauceChargePrompt(session));
  }

  if (session.order.pendingFlyinFriesClarification) {
    const clarify = friesClarificationType(speech);
    if (clarify === "flyin" || clarify === "buffalo") {
      session.order.pendingFlyinFriesClarification = false;
      session.order.extraSide = clarify === "flyin" ? "junior flyin fries" : "buffalo ranch fries";
      session.stage = "name";
      return sayAndStore(
        session,
        res,
        sayByLanguage(session, `Perfect, adding ${session.order.extraSide}. What name can I put that under?`, `Perfecto, agrego ${session.order.extraSide}. ¿A nombre de quién pongo la orden?`)
      );
    }
    return sayAndStore(session, res, flyinFriesClarificationPrompt(session));
  }

  if (session.stage === "language") {
    if (looksLikeOrder(speech)) {
      session.stage = "order";
      parseCoreOrder(speech, session.order);

      if (session.order.pendingLemonPepperConfirmation) {
        return sayAndStore(session, res, lemonPepperPrompt(session));
      }

      if (session.order.pendingCountedSauceConfirmation) {
        const total = countPartsTotal(session.order.countedSauceParts);
        if (session.order.quantity && total !== session.order.quantity) {
          session.order.pendingCountedSauceConfirmation = false;
          session.order.countedSauceParts = [];
          session.order.sauces = [];
          session.stage = "sauce";
          return sayAndStore(
            session,
            res,
            sayByLanguage(session, `I have ${total} wings in those sauce counts, but the order is ${session.order.quantity}. What sauces do you want me to lock in?`, `Tengo ${total} alitas en ese reparto de salsas, pero la orden es de ${session.order.quantity}. ¿Cómo te las dejo?`)
          );
        }
        return sayAndStore(session, res, countedSauceConfirmationPrompt(session, session.order));
      }

      const missing = missingCore(session.order);
      if (missing) {
        if (missing === "sauce") session.stage = "sauce";
        return sayAndStore(session, res, nextPromptForMissing(session, session.order));
      }

      if (session.order.pendingMixedSauceCharge) {
        return sayAndStore(session, res, mixedSauceChargePrompt(session));
      }

      const allowed = sauceSlotsAllowed(session.order.quantity);
      if (!session.order.noMoreSauces && session.order.sauceMode !== "single" && session.order.sauces.length < allowed) {
        session.stage = "sauce_more_or_done";
        return sayAndStore(
          session,
          res,
          sayByLanguage(session, `Got you. You can do up to ${allowed} sauces. Right now I have ${sauceSummary(session.order)}. Want to add another or keep it like that?`, `Perfecto. Puedes elegir hasta ${allowed} salsas. Ahorita tengo ${sauceSummary(session.order)}. ¿Quieres otra o así lo dejamos?`)
        );
      }

      session.stage = "included_dip";
      return sayAndStore(session, res, dipsPromptAfterSauce(session, session.order));
    }

    session.stage = "order";
    return sayAndStore(session, res, sayByLanguage(session, "What can I get started for you?", "¿Qué te preparo?"));
  }

  if (session.stage === "order") {
    parseCoreOrder(speech, session.order);

    if (session.order.pendingLemonPepperConfirmation) {
      return sayAndStore(session, res, lemonPepperPrompt(session));
    }

    if (session.order.pendingCountedSauceConfirmation) {
      const total = countPartsTotal(session.order.countedSauceParts);
      if (session.order.quantity && total !== session.order.quantity) {
        session.order.pendingCountedSauceConfirmation = false;
        session.order.countedSauceParts = [];
        session.order.sauces = [];
        session.stage = "sauce";
        return sayAndStore(
          session,
          res,
          sayByLanguage(session, `I have ${total} wings in those sauce counts, but the order is ${session.order.quantity}. What sauces do you want me to lock in?`, `Tengo ${total} alitas en ese reparto de salsas, pero la orden es de ${session.order.quantity}. ¿Cómo te las dejo?`)
        );
      }
      return sayAndStore(session, res, countedSauceConfirmationPrompt(session, session.order));
    }

    const missing = missingCore(session.order);
    if (missing) {
      if (missing === "sauce") session.stage = "sauce";
      return sayAndStore(session, res, nextPromptForMissing(session, session.order));
    }

    if (session.order.pendingMixedSauceCharge) {
      return sayAndStore(session, res, mixedSauceChargePrompt(session));
    }

    const allowed = sauceSlotsAllowed(session.order.quantity);
    if (!session.order.noMoreSauces && session.order.sauceMode !== "single" && session.order.sauces.length < allowed) {
      session.stage = "sauce_more_or_done";
      return sayAndStore(
        session,
        res,
        sayByLanguage(
          session,
          pick([
            `Got you. You can do up to ${allowed} sauces. Right now I have ${sauceSummary(session.order)}. Want to add another or keep it like that?`,
            `Perfect. I’ve got ${sauceSummary(session.order)} so far. You can do up to ${allowed} sauces. Add another or keep it like that?`
          ]),
          pick([
            `Perfecto. Puedes elegir hasta ${allowed} salsas. Ahorita tengo ${sauceSummary(session.order)}. ¿Quieres otra o así lo dejamos?`,
            `Muy bien. Puedes poner hasta ${allowed} salsas. Ahorita tengo ${sauceSummary(session.order)}. ¿Quieres otra o así?`
          ])
        )
      );
    }

    session.stage = "included_dip";
    return sayAndStore(session, res, dipsPromptAfterSauce(session, session.order));
  }

  if (session.stage === "sauce") {
    const quantityCorrection = extractNumber(speech);
    const styleCorrection = extractStyle(speech);

    if (quantityCorrection) session.order.quantity = quantityCorrection;
    if (styleCorrection) session.order.style = styleCorrection;
    if (mentionsSauceOnSide(speech)) session.order.sauceOnSide = true;

    const sauces = extractSauces(speech);
    const countedSauceParts = extractCountedSauceParts(speech);

    if (countedSauceParts.length) {
      session.order.countedSauceParts = countedSauceParts;
      session.order.sauces = countedSauceParts.map((p) => p.sauce);
      session.order.pendingCountedSauceConfirmation = true;
      session.order.noMoreSauces = true;
      const total = countPartsTotal(countedSauceParts);

      if (session.order.quantity && total !== session.order.quantity) {
        session.order.pendingCountedSauceConfirmation = false;
        session.order.countedSauceParts = [];
        session.order.sauces = [];
        return sayAndStore(
          session,
          res,
          sayByLanguage(session, `I have ${total} wings in those sauce counts, but the order is ${session.order.quantity}. What sauces do you want me to lock in?`, `Tengo ${total} alitas en ese reparto de salsas, pero la orden es de ${session.order.quantity}. ¿Cómo te las dejo?`)
        );
      }

      return sayAndStore(session, res, countedSauceConfirmationPrompt(session, session.order));
    }

    if (!sauces.length) {
      return sayAndStore(
        session,
        res,
        sayByLanguage(
          session,
          pick([
            "Sorry, what sauce was that?",
            "I missed the sauce. What flavor do you want?",
            "Sorry, which sauce did you want?"
          ]),
          pick([
            "Perdón, ¿qué salsa dijiste?",
            "¿Qué sabor quieres?",
            "No alcancé la salsa. ¿Cuál quieres?"
          ])
        )
      );
    }

    session.order.sauces = [];
    session.order.countedSauceParts = [];
    session.order.sauceMode = "split";
    session.order.noMoreSauces = false;
    session.order.pendingMixedSauceCharge = false;
    session.order.pendingLemonPepperConfirmation = false;
    addSauces(session.order, sauces, speech);

    if (session.order.pendingLemonPepperConfirmation) {
      return sayAndStore(session, res, lemonPepperPrompt(session));
    }

    if (session.order.pendingMixedSauceCharge) {
      return sayAndStore(session, res, mixedSauceChargePrompt(session));
    }

    const allowed = sauceSlotsAllowed(session.order.quantity);
    if (!session.order.noMoreSauces && session.order.sauceMode !== "single" && session.order.sauces.length < allowed) {
      session.stage = "sauce_more_or_done";
      return sayAndStore(
        session,
        res,
        sayByLanguage(
          session,
          pick([
            `Perfect. Right now I have ${sauceSummary(session.order)}. You can do up to ${allowed} sauces. Want to add another or keep it like that?`,
            `Got it. So far I have ${sauceSummary(session.order)}. Want another sauce or keep it like that?`
          ]),
          pick([
            `Perfecto. Ahorita tengo ${sauceSummary(session.order)}. Puedes elegir hasta ${allowed} salsas. ¿Quieres otra o así?`,
            `Muy bien. Llevo ${sauceSummary(session.order)}. Puedes escoger hasta ${allowed} salsas. ¿Quieres otra o así?`
          ])
        )
      );
    }

    session.stage = "included_dip";
    return sayAndStore(session, res, dipsPromptAfterSauce(session, session.order));
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
        sayByLanguage(session, `Got it. Now I have ${session.order.quantity} ${itemTypeDisplay(session.order.style, "en")}. Right now the sauces are ${sauceSummary(session.order)}. Want to add another or keep it like that?`, `Muy bien. Ahora tengo ${session.order.quantity} ${itemTypeDisplay(session.order.style, "es")}. Ahorita las salsas son ${sauceSummary(session.order)}. ¿Quieres otra o así lo dejamos?`)
      );
    }

    if (styleCorrection && styleCorrection !== session.order.style) {
      session.order.style = styleCorrection;
      return sayAndStore(
        session,
        res,
        sayByLanguage(
          session,
          pick([
            `Perfect. I switched that to ${itemTypeDisplay(session.order.style, "en")}. Right now I have ${sauceSummary(session.order)}. Want to add another or keep it like that?`,
            `Got it. ${itemTypeDisplay(session.order.style, "en")} now. Sauces are ${sauceSummary(session.order)}. Add another or keep it like that?`
          ]),
          pick([
            `Perfecto. Lo cambié a ${itemTypeDisplay(session.order.style, "es")}. Ahorita tengo ${sauceSummary(session.order)}. ¿Quieres otra salsa o así?`,
            `Muy bien. Ahora va ${itemTypeDisplay(session.order.style, "es")}. Las salsas son ${sauceSummary(session.order)}. ¿Quieres otra o así?`
          ])
        )
      );
    }

    if (isNo(speech) || speech.includes("keep")) {
      session.order.noMoreSauces = true;
    }

    const sauces = extractSauces(speech);
    if (sauces.length) {
      addSauces(session.order, sauces, speech);
    }

    if (session.order.pendingLemonPepperConfirmation) {
      return sayAndStore(session, res, lemonPepperPrompt(session));
    }

    if (session.order.pendingMixedSauceCharge) {
      return sayAndStore(session, res, mixedSauceChargePrompt(session));
    }

    const allowed = sauceSlotsAllowed(session.order.quantity);
    if (!session.order.noMoreSauces && session.order.sauceMode !== "single" && sauces.length && session.order.sauces.length < allowed) {
      const remaining = allowed - session.order.sauces.length;
      return sayAndStore(
        session,
        res,
        sayByLanguage(
          session,
          pick([
            `Got it. I have ${sauceSummary(session.order)}. You can still add ${remaining} more sauce${remaining > 1 ? "s" : ""}, or keep it like that.`,
            `Perfect. Right now it’s ${sauceSummary(session.order)}. You can still add ${remaining} more sauce${remaining > 1 ? "s" : ""}, or leave it there.`
          ]),
          pick([
            `Perfecto. Ahorita está ${sauceSummary(session.order)}. Todavía puedes agregar ${remaining} salsa${remaining > 1 ? "s" : ""}, o así lo dejamos.`,
            `Muy bien. Tengo ${sauceSummary(session.order)}. Todavía puedes agregar ${remaining} salsa${remaining > 1 ? "s" : ""}, o así.`
          ])
        )
      );
    }

    if (!sauces.length && !isNo(speech) && !isYes(speech) && !speech.includes("keep")) {
      return sayAndStore(
        session,
        res,
        sayByLanguage(
          session,
          pick([
            `Sorry, I missed that. Right now I have ${sauceSummary(session.order)}. Want to add another or keep it like that?`,
            `I missed that part. Right now it’s ${sauceSummary(session.order)}. Add another or keep it like that?`
          ]),
          pick([
            `Perdón, no alcancé esa parte. Ahorita tengo ${sauceSummary(session.order)}. ¿Quieres otra o así?`,
            `No alcancé bien. Ahorita está ${sauceSummary(session.order)}. ¿Quieres otra salsa o así lo dejamos?`
          ])
        )
      );
    }

    session.stage = "included_dip";
    return sayAndStore(session, res, dipsPromptAfterSauce(session, session.order));
  }

  if (session.stage === "included_dip") {
    const quantityCorrection = extractNumber(speech);
    const styleCorrection = extractStyle(speech);

    if (quantityCorrection && quantityCorrection !== session.order.quantity) {
      session.order.quantity = quantityCorrection;
      session.order.includedDips = [];
      session.order.extraDips = [];
      return sayAndStore(session, res, sayByLanguage(session, `Got it. That now includes ${formatCountNoun(dipSlotsAllowed(session.order.quantity), "dip", "dips")}. What dips do you want?`, `Muy bien. Ahora eso incluye ${formatCountNoun(dipSlotsAllowed(session.order.quantity), "dip", "dips")}. ¿Qué dips quieres?`));
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
        sayByLanguage(
          session,
          pick([
            `That includes ${formatCountNoun(max, "dip", "dips")}. Do you want ranch, blue cheese, chipotle ranch, or jalapeño ranch?`,
            `For the dips, do you want ranch, blue cheese, chipotle ranch, or jalapeño ranch?`
          ]),
          pick([
            `Eso incluye ${formatCountNoun(max, "dip", "dips")}. ¿Quieres ranch, blue cheese, chipotle ranch o jalapeño ranch?`,
            `Para los dips, ¿quieres ranch, blue cheese, chipotle ranch o jalapeño ranch?`
          ])
        )
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
          sayByLanguage(session, `Got it. I still need ${max - session.order.includedDips.length} more dip${max - session.order.includedDips.length === 1 ? "" : "s"}. Which dips do you want?`, `Muy bien. Todavía me falta ${max - session.order.includedDips.length} dip${max - session.order.includedDips.length === 1 ? "" : "s"}. ¿Qué dips quieres?`)
        );
      }
    }

    session.stage = "extra_upsell";
    return sayAndStore(
      session,
      res,
      sayByLanguage(
        session,
        pick([
          "Perfect. Want extra dips or maybe a side like fries or mac bites?",
          "Got it. Want extra dips, or maybe fries or mac bites?",
          "Alright. Want any extra dips or maybe a side?"
        ]),
        pick([
          "Perfecto. ¿Quieres aderezo extra o algún side como papas o mac bites?",
          "Muy bien. ¿Quieres dip extra o algún side?"
        ])
      )
    );
  }

  if (session.stage === "extra_upsell") {
    const dips = extractDips(speech);
    const side = extractExtraSide(speech);

    if (mentionsFlyinFries(speech)) {
      const clarify = friesClarificationType(speech);
      if (!clarify || clarify === "ambiguous") {
        session.order.pendingFlyinFriesClarification = true;
        return sayAndStore(session, res, flyinFriesClarificationPrompt(session));
      }

      session.order.extraSide = clarify === "flyin" ? "junior flyin fries" : "buffalo ranch fries";
      session.stage = "name";
      return sayAndStore(session, res, sayByLanguage(session, `Perfect, adding ${session.order.extraSide}. What name can I put that under?`, `Perfecto, agrego ${session.order.extraSide}. ¿A nombre de quién pongo la orden?`));
    }

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
        sayByLanguage(
          session,
          pick(["Perfect. Anything else?", "Got it. Anything else for you?", "Alright. Anything else?"]),
          pick(["Perfecto. ¿Algo más?", "Muy bien. ¿Algo más te agrego?"])
        )
      );
    }

    if (side) {
      session.order.extraSide = side;
      session.stage = "name";
      return sayAndStore(
        session,
        res,
        sayByLanguage(
          session,
          pick([
            `Perfect, adding ${side}. What name can I put that under?`,
            `Got you. I added ${side}. What name is the order under?`,
            `Alright, ${side} added. What name can I put on it?`
          ]),
          pick([
            `Perfecto, agrego ${side}. ¿A nombre de quién pongo la orden?`,
            `Muy bien, ya agregué ${side}. ¿A nombre de quién va?`
          ])
        )
      );
    }

    if (isNo(speech)) {
      session.stage = "name";
      return sayAndStore(
        session,
        res,
        sayByLanguage(
          session,
          pick(["Perfect. What name can I put that under?", "Sounds good. What name is the order under?", "Alright. What name can I put on it?"]),
          pick(["Perfecto. ¿A nombre de quién pongo la orden?", "Muy bien. ¿A nombre de quién va?", "Listo. ¿Qué nombre le pongo?"])
        )
      );
    }

    return sayAndStore(
      session,
      res,
      sayByLanguage(
        session,
        pick([
          "Sorry, I missed that. Want extra dips or maybe a side?",
          "Sorry, do you want any extra dips or maybe a side?",
          "I missed that part. Extra dips or maybe a side?"
        ]),
        pick(["Perdón, ¿quieres aderezo extra o algún side?", "No alcancé bien. ¿Quieres dip extra o algún side?"])
      )
    );
  }

  if (session.stage === "name") {
    const name = extractName(speech);
    if (!name) {
      return sayAndStore(
        session,
        res,
        sayByLanguage(
          session,
          pick([
            "Sorry, I didn’t catch the name. What name can I put that under?",
            "I missed the name. What should I put it under?",
            "Sorry about that. What name is it under?"
          ]),
          pick([
            "Perdón, no alcancé el nombre. ¿A nombre de quién?",
            "No escuché bien el nombre. ¿Qué nombre le pongo?",
            "Perdón. ¿A nombre de quién va?"
          ])
        )
      );
    }

    session.order.name = name;
    session.stage = "confirm";

    const summary = sayByLanguage(
      session,
      `Perfect. I have ${session.order.quantity} ${itemTypeDisplay(session.order.style, "en")}${session.order.sauces.length ? `, ${session.order.sauceOnSide ? `${sauceSummary(session.order)} on the side` : sauceSummary(session.order)}` : ""}${session.order.includedDips.length ? `, ${dipSummary(session.order.includedDips)}` : ""}${session.order.extraDips.length ? `, extra ${dipSummary(session.order.extraDips)}` : ""}${session.order.extraSide ? `, and ${session.order.extraSide}` : ""}, under ${name}. Everything look right?`,
      `Perfecto. Tengo ${session.order.quantity} ${itemTypeDisplay(session.order.style, "es")}${session.order.sauces.length ? `, ${session.order.sauceOnSide ? `${sauceSummary(session.order)} aparte` : sauceSummary(session.order)}` : ""}${session.order.includedDips.length ? `, ${dipSummary(session.order.includedDips)}` : ""}${session.order.extraDips.length ? `, extra ${dipSummary(session.order.extraDips)}` : ""}${session.order.extraSide ? `, y ${session.order.extraSide}` : ""}, a nombre de ${name}. ¿Todo está bien?`
    );

    return sayAndStore(session, res, summary);
  }

  if (session.stage === "confirm") {
    if (isYes(speech) || isNo(speech)) {
      return sayAndStore(
        session,
        res,
        sayByLanguage(session, "Perfect, we’ll have that ready for pickup. See you soon.", "Perfecto, tendremos tu orden lista para recoger. Gracias."),
        true
      );
    }

    if (wantsChangeSauce(speech) || looksLikeOrder(speech)) {
      session.stage = "order";
      return sayAndStore(session, res, sayByLanguage(session, "No problem. Tell me what you want to change.", "Claro. Dime qué quieres cambiar."));
    }

    return sayAndStore(session, res, sayByLanguage(session, "Everything look right?", "¿Todo está bien?"));
  }

  session.stage = "order";
  return sayAndStore(
    session,
    res,
    sayByLanguage(
      session,
      pick(["Let’s get started. What can I get for you?", "What can I get started for you?", "Go ahead, what can I get for you?"]),
      pick(["Vamos empezando. ¿Qué te preparo?", "Dime, ¿qué te doy?", "Muy bien, ¿qué te preparo?"])
    )
  );
});

app.listen(PORT, () => {
  console.log("Jeffrey server running on port", PORT);
});
