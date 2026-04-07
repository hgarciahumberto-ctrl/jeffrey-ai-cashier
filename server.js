import express from "express";
import twilio from "twilio";

const {
  twiml: { VoiceResponse }
} = twilio;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

const ENGLISH_VOICE = process.env.TWILIO_VOICE_EN || process.env.TWILIO_VOICE || "Polly.Matthew";
const SPANISH_VOICE = process.env.TWILIO_VOICE_ES || "Polly.Mia";
const ENGLISH_LANGUAGE = "en-US";
const SPANISH_LANGUAGE = "es-MX";

const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

const SAUCE_ALIASES = [
  { keys: ["al pastor", "pastor"], value: "al pastor" },
  { keys: ["mild", "buffalo mild", "suave"], value: "mild" },
  { keys: ["hot", "buffalo hot", "picosa", "picante"], value: "hot" },
  { keys: ["lime pepper", "limon pepper", "limon pimienta", "limón pimienta", "lemon pepper"], value: "lime pepper" },
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

const DIP_ALIASES = [
  { keys: ["ranch"], value: "ranch" },
  { keys: ["blue cheese", "bleu cheese", "queso azul"], value: "blue cheese" },
  { keys: ["chipotle ranch", "ranch chipotle"], value: "chipotle ranch" },
  { keys: ["jalapeno ranch", "jalapeño ranch", "ranch jalapeno", "ranch jalapeño"], value: "jalapeño ranch" }
];

const DRESSING_ALIASES = [...DIP_ALIASES];

const SIDE_ALIASES = [
  { keys: ["fries", "regular fries", "french fries", "papas", "papas fritas"], value: "regular fries" },
  { keys: ["sweet potato fries", "camote fries", "papas de camote"], value: "sweet potato fries" },
  { keys: ["potato salad", "ensalada de papa"], value: "potato salad" },
  { keys: ["mac bites", "mac bite", "mac and cheese bites", "mac n cheese bites"], value: "mac bites" },
  { keys: ["corn ribs", "costillas de elote"], value: "corn ribs" },
  { keys: ["flyin corn", "flyin’ corn", "flying corn", "elote", "elote entero"], value: "flyin corn" },
  { keys: ["mozzarella sticks", "mozzarella"], value: "mozzarella sticks" },
  { keys: ["onion rings", "aros de cebolla"], value: "onion rings" },
  { keys: ["buffalo ranch fries"], value: "buffalo ranch fries" }
];

const DRINK_ALIASES = [
  { keys: ["soft drink", "drink", "soda", "refresco", "fountain drink"], value: "soft drink" },
  { keys: ["water", "bottled water", "agua"], value: "bottled water" }
];

const PROTEIN_ALIASES = [
  { keys: ["chicken", "pollo"], value: "chicken" },
  { keys: ["steak"], value: "steak" },
  { keys: ["pork belly"], value: "pork belly" }
];

const CHICKEN_STYLE_ALIASES = [
  { keys: ["grilled", "a la plancha"], value: "grilled" },
  { keys: ["fried", "frito"], value: "fried" }
];

const ITEM_ALIASES = [
  { keys: ["wings", "bone in", "bone-in", "classic wings", "traditional wings", "traditional", "alitas", "alitas con hueso", "con hueso"], value: "wings" },
  { keys: ["boneless", "boneless wings"], value: "boneless" },

  { keys: ["ribs", "korean ribs", "korean style ribs", "costillas"], value: "ribs" },

  { keys: ["junior flyin fries", "flyin fries", "flyin’ fries", "flying fries"], value: "junior flyin fries" },
  { keys: ["pork belly fries"], value: "pork belly fries" },
  { keys: ["chicken parmesan fries", "chicken parm fries"], value: "chicken parmesan fries" },
  { keys: ["buffalo ranch fries"], value: "buffalo ranch fries" },

  { keys: ["house salad"], value: "house salad" },
  { keys: ["flyin salad", "flyin’ salad"], value: "flyin salad" },

  { keys: ["pork belly"], value: "pork belly" },

  { keys: ["mac bites", "mac bite", "mac and cheese bites"], value: "mac bites" },
  { keys: ["onion rings", "aros de cebolla"], value: "onion rings" },
  { keys: ["flyin corn", "flyin’ corn", "flying corn", "elote"], value: "flyin corn" },
  { keys: ["corn ribs", "costillas de elote"], value: "corn ribs" },
  { keys: ["mozzarella sticks", "mozzarella"], value: "mozzarella sticks" },
  { keys: ["sampler platter", "sampler"], value: "sampler platter" },

  { keys: ["kids boneless", "4 boneless", "4 boneless wings"], value: "kids boneless" },
  { keys: ["kids wings", "4 classic wings", "4 wings kids", "4 alitas kids"], value: "kids wings" },
  { keys: ["kids cheeseburger", "cheeseburger kids"], value: "kids cheeseburger" },

  { keys: ["8 wings combo", "wing combo", "combo de 8 alitas"], value: "8 wings combo" },
  { keys: ["8 boneless combo", "boneless combo", "combo de 8 boneless"], value: "8 boneless combo" },
  { keys: ["half rack combo", "1/2 rack combo", "combo de media costilla"], value: "half rack combo" },
  { keys: ["half rack and 4 bone in", "1/2 rack and 4 bone in", "media costilla y 4 alitas"], value: "half rack and 4 bone in combo" },
  { keys: ["4 pieces fish and fries", "fish and fries", "fish combo"], value: "fish combo" },

  { keys: ["classic burger", "classic burger combo"], value: "classic burger combo" },
  { keys: ["buffalo burger", "buffalo burger combo"], value: "buffalo burger combo" },
  { keys: ["chicken sandwich", "chicken sandwich combo"], value: "chicken sandwich combo" },
  { keys: ["flyin burger", "flyin’ burger", "flyin burger combo"], value: "flyin burger combo" },

  { keys: ["flyin baked potato combo", "baked potato combo", "loaded baked potato combo"], value: "baked potato combo" }
];

const REMOVAL_ALIASES = [
  { keys: ["no tomato", "sin tomate"], value: "no tomato" },
  { keys: ["no cheese", "sin queso"], value: "no cheese" },
  { keys: ["no mayo", "sin mayonesa"], value: "no mayo" },
  { keys: ["no onion", "sin cebolla"], value: "no onion" },
  { keys: ["no onions", "sin cebollas"], value: "no onion" },
  { keys: ["no lettuce", "sin lechuga"], value: "no lettuce" },
  { keys: ["no pickles", "sin pepinillos", "sin pickles"], value: "no pickles" }
];

const sessions = new Map();
const callStates = new Map();

function blankOrder() {
  return {
    itemType: null,
    quantity: null,
    size: null,
    sauces: [],
    sauceMode: "split",
    sauceOnSide: false,
    countedSauceParts: [],
    pendingCountedSauceConfirmation: false,
    pendingMixedSauceCharge: false,
    pendingLemonPepperConfirmation: false,
    pendingFlyinFriesClarification: false,
    flyinFriesClarifiedOnce: false,

    includedDips: [],
    extraDips: [],
    dressing: null,

    extraSide: null,
    comboSide: null,
    drink: null,

    protein: null,
    chickenStyle: null,

    modifiersToRemove: [],
    samplerFriesSwap: null,

    name: null,
    notes: []
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

function detectLanguageMode(text = "") {
  const input = normalize(text);

  const spanishSignals = [
    "hola", "quiero", "me da", "me das", "para llevar", "pedido", "orden",
    "alitas", "con hueso", "salsa", "sabor", "nombre", "gracias",
    "espanol", "hablas espanol", "en espanol"
  ];

  const englishSignals = [
    "hi", "hello", "can i get", "i want", "to go", "order", "wings",
    "bone in", "bone-in", "sauce", "flavor", "name", "thank you", "english", "in english"
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

function wantsSpanish(text) {
  return /\b(spanish|espanol|hablas espanol|en espanol)\b/.test(text);
}

function wantsEnglish(text) {
  return /\b(english|speak english|hablas ingles|in english|ingles)\b/.test(text);
}

function storeLanguageFromSpeech(session, speech) {
  if (wantsSpanish(speech)) {
    session.languageMode = "es";
    session.languageLocked = true;
    return;
  }

  if (wantsEnglish(speech)) {
    session.languageMode = "en";
    session.languageLocked = true;
    return;
  }

  if (session.languageLocked) return;

  const detected = detectLanguageMode(speech);
  if (detected === "unknown") return;

  if (session.languageMode === "unknown") {
    session.languageMode = detected === "spanglish" ? "es" : detected;
    return;
  }

  if (session.languageMode !== "es" && session.languageMode !== "en") {
    session.languageMode = detected === "spanglish" ? "es" : detected;
  }
}

function explicitLockCallLanguage(state, lang) {
  if (lang !== "es" && lang !== "en") return;
  state.language = lang;
  state.languageLocked = true;
}

function maybeUpdateCallLanguage(state, text = "") {
  if (wantsSpanish(text)) {
    explicitLockCallLanguage(state, "es");
    return;
  }
  if (wantsEnglish(text)) {
    explicitLockCallLanguage(state, "en");
    return;
  }

  if (state.languageLocked) return;

  const detected = detectLanguageMode(text);
  if (detected === "unknown") return;

  if (!state.language || state.language === "unknown") {
    state.language = detected === "spanglish" ? "es" : detected;
    return;
  }

  if (state.language !== "es" && state.language !== "en") {
    state.language = detected === "spanglish" ? "es" : detected;
  }
}

function sayByLanguage(session, english, spanish) {
  return session.languageMode === "es" ? spanish : english;
}

function sayForCall(state, english, spanish) {
  return state.language === "es" ? spanish : english;
}

function getSpeechConfig(session) {
  if (session.languageMode === "es") {
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
  const digitMatch = text.match(/\b(1|2|3|4|5|6|8|9|10|12|18|20|24|48)\b/);
  if (digitMatch) return parseInt(digitMatch[1], 10);

  const patterns = [
    { re: /\b(one|uno|una)\b/, value: 1 },
    { re: /\b(two|dos)\b/, value: 2 },
    { re: /\b(three|tres)\b/, value: 3 },
    { re: /\b(four|cuatro)\b/, value: 4 },
    { re: /\b(five|cinco)\b/, value: 5 },
    { re: /\b(six|seis)\b/, value: 6 },
    { re: /\b(eight|ocho)\b/, value: 8 },
    { re: /\b(nine|nueve)\b/, value: 9 },
    { re: /\b(ten|diez)\b/, value: 10 },
    { re: /\b(twelve|doce)\b/, value: 12 },
    { re: /\b(eighteen|dieciocho)\b/, value: 18 },
    { re: /\b(twenty|veinte)\b/, value: 20 },
    { re: /\b(twenty[\s-]?four|veinticuatro)\b/, value: 24 },
    { re: /\b(forty[\s-]?eight|cuarenta y ocho)\b/, value: 48 }
  ];

  for (const p of patterns) {
    if (p.re.test(text)) return p.value;
  }

  return null;
}

function extractRackSize(text) {
  if (/\b(full rack|full rack ribs|rack completo|costillar completo|rack entero|entero)\b/.test(text)) return "full rack";
  if (/\b(half rack|1\/2 rack|media costilla|medio rack|half)\b/.test(text)) return "half rack";
  return null;
}

function extractWingStyle(text) {
  if (/\b(boneless)\b/.test(text)) return "boneless";
  if (/\b(classic|traditional|bone in|bone-in|con hueso|alitas|clasicas|clasica)\b/.test(text)) return "wings";
  return null;
}

function extractSauces(text) {
  return extractAllAliases(text, SAUCE_ALIASES);
}

function extractDips(text) {
  return extractAllAliases(text, DIP_ALIASES);
}

function extractDressing(text) {
  return findAlias(text, DRESSING_ALIASES);
}

function extractSide(text) {
  return findAlias(text, SIDE_ALIASES);
}

function extractDrink(text) {
  return findAlias(text, DRINK_ALIASES);
}

function extractProtein(text) {
  return findAlias(text, PROTEIN_ALIASES);
}

function extractChickenStyle(text) {
  return findAlias(text, CHICKEN_STYLE_ALIASES);
}

function extractItem(text) {
  return findAlias(text, ITEM_ALIASES);
}

function extractRemovals(text) {
  return extractAllAliases(text, REMOVAL_ALIASES);
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
  return /\b(no|nope|nah|nothing else|thats all|that s all|no thank you|just that|im good|i m good|nada mas|solo eso|con eso|no gracias)\b/.test(text);
}

function wantsRepeat(text) {
  return /\b(repeat|say that again|again|what was that|come again|repite|otra vez)\b/.test(text);
}

function wantsHold(text) {
  return /\b(wait|hold on|one second|one sec|just a second|espera|un segundo|tantito)\b/.test(text);
}

function wantsResume(text) {
  return /\b(ready|go ahead|continue|okay|ok|im ready|i m ready|listo|lista|dale|continua|continúa)\b/.test(text);
}

function wantsStartOver(text) {
  return /\b(start over|restart|begin again|lets start over|let s start over|empezar de nuevo|otra vez desde el principio)\b/.test(text);
}

function mentionsAlcohol(text) {
  return /\b(beer|cerveza|alcohol|modelo|bud light|coors|corona|wine|vino|whiskey|tequila|vodka)\b/.test(text);
}

function wantsChangeSauce(text) {
  return /\b(change the sauce|different sauce|switch the sauce|another sauce|make that|instead|cambia la salsa|otra salsa|mejor)\b/.test(text);
}

function wantsAllSameDip(text) {
  return /\b(all ranch|just ranch|all blue cheese|just blue cheese|todo ranch|todo blue cheese|solo ranch|solo blue cheese)\b/.test(text);
}

function mentionsSauceOnSide(text) {
  return /\b(on the side|sauce on the side|on side|separate|separado|por separado|aparte|a un lado)\b/.test(text);
}

function mentionsLemonPepper(text) {
  return /\b(lemon pepper|lemon)\b/.test(text);
}

function wantsSamplerFriesSwap(text) {
  return /\b(change for regular fries|switch to regular fries|regular fries instead|cambiar por papas regulares|papas regulares en lugar)\b/.test(text);
}

function sauceSlotsAllowed(order) {
  if (order.itemType === "wings" || order.itemType === "boneless") {
    return Math.max(1, Math.floor((order.quantity || 0) / 6));
  }

  if (order.itemType === "ribs") {
    if (order.size === "full rack") return 2;
    if (order.size === "half rack") return 1;
  }

  if (order.itemType === "corn ribs") return 1;
  if (order.itemType === "pork belly") return 1;
  if (order.itemType === "kids boneless") return 1;
  if (order.itemType === "kids wings") return 1;
  if (order.itemType === "8 wings combo") return 1;
  if (order.itemType === "8 boneless combo") return 1;
  if (order.itemType === "half rack combo") return 1;
  if (order.itemType === "half rack and 4 bone in combo") return 2;
  if (order.itemType === "baked potato combo") return 1;
  return 0;
}

function dipSlotsAllowed(order) {
  if (order.itemType === "wings" || order.itemType === "boneless") {
    return Math.max(1, Math.floor((order.quantity || 0) / 6));
  }

  if (order.itemType === "mac bites") return 1;
  if (order.itemType === "kids boneless") return 1;
  if (order.itemType === "kids wings") return 1;
  if (order.itemType === "8 wings combo") return 1;
  if (order.itemType === "8 boneless combo") return 1;
  if (order.itemType === "half rack and 4 bone in combo") return 1;
  return 0;
}

function needsSauce(order) {
  return sauceSlotsAllowed(order) > 0;
}

function needsDip(order) {
  return dipSlotsAllowed(order) > 0;
}

function needsDressing(order) {
  return ["house salad", "flyin salad"].includes(order.itemType);
}

function needsProtein(order) {
  return order.itemType === "baked potato combo";
}

function needsChickenStyle(order) {
  if (order.itemType === "flyin salad") return true;
  if (order.itemType === "chicken sandwich combo") return true;
  if (order.itemType === "flyin burger combo") return true;
  if (order.itemType === "baked potato combo" && order.protein === "chicken") return true;
  return false;
}

function comboNeedsSide(order) {
  return [
    "8 wings combo",
    "8 boneless combo",
    "half rack combo",
    "half rack and 4 bone in combo",
    "fish combo",
    "classic burger combo",
    "chicken sandwich combo",
    "flyin burger combo"
  ].includes(order.itemType);
}

function comboNeedsDrink(order) {
  if (order.itemType === "baked potato combo") return true;
  return [
    "8 wings combo",
    "8 boneless combo",
    "half rack combo",
    "half rack and 4 bone in combo",
    "classic burger combo",
    "chicken sandwich combo",
    "flyin burger combo",
    "kids boneless",
    "kids wings",
    "kids cheeseburger"
  ].includes(order.itemType);
}

function fishNeedsBaseChoice(order) {
  return order.itemType === "fish combo";
}

function fishChoiceIsValid(order) {
  return ["regular fries", "sweet potato fries", "potato salad"].includes(order.comboSide || "");
}

function bakedPotatoDrinkAllowed(order) {
  return ["soft drink", "bottled water"].includes(order.drink || "");
}

function otherComboDrinkAllowed(order) {
  return order.drink === "soft drink";
}

function burgerSupportsRemovals(order) {
  return [
    "classic burger combo",
    "buffalo burger combo",
    "chicken sandwich combo",
    "flyin burger combo",
    "kids cheeseburger"
  ].includes(order.itemType);
}

function itemTypeDisplay(order, lang = "en") {
  const item = order.itemType;

  if (lang === "es") {
    const map = {
      wings: "alitas con hueso",
      boneless: "boneless",
      ribs: order.size === "full rack" ? "rack completo de Korean style ribs" : "media orden de Korean style ribs",
      "junior flyin fries": "Flyin’ Fries",
      "pork belly fries": "pork belly fries",
      "chicken parmesan fries": "chicken parmesan fries",
      "buffalo ranch fries": "Buffalo Ranch Fries",
      "house salad": "House Salad",
      "flyin salad": "Flyin’ Salad",
      "pork belly": "pork belly",
      "mac bites": "mac bites",
      "onion rings": "onion rings",
      "flyin corn": "Flyin’ Corn",
      "corn ribs": "corn ribs",
      "mozzarella sticks": "mozzarella sticks",
      "sampler platter": "Sampler Platter",
      "kids boneless": "kids de 4 boneless",
      "kids wings": "kids de 4 alitas",
      "kids cheeseburger": "kids cheeseburger",
      "8 wings combo": "combo de 8 alitas",
      "8 boneless combo": "combo de 8 boneless",
      "half rack combo": "combo de media costilla",
      "half rack and 4 bone in combo": "combo de media costilla y 4 alitas",
      "fish combo": "4 piezas de pescado con papas",
      "classic burger combo": "combo de classic burger",
      "buffalo burger combo": "combo de buffalo burger",
      "chicken sandwich combo": "combo de chicken sandwich",
      "flyin burger combo": "combo de Flyin’ Burger",
      "baked potato combo": "combo de baked potato"
    };
    return map[item] || item;
  }

  const map = {
    wings: "bone-in wings",
    boneless: "boneless",
    ribs: order.size === "full rack" ? "full rack Korean style ribs" : "half rack Korean style ribs",
    "junior flyin fries": "Flyin’ Fries",
    "pork belly fries": "pork belly fries",
    "chicken parmesan fries": "chicken parmesan fries",
    "buffalo ranch fries": "Buffalo Ranch Fries",
    "house salad": "House Salad",
    "flyin salad": "Flyin’ Salad",
    "pork belly": "pork belly",
    "mac bites": "mac bites",
    "onion rings": "onion rings",
    "flyin corn": "Flyin’ Corn",
    "corn ribs": "corn ribs",
    "mozzarella sticks": "mozzarella sticks",
    "sampler platter": "Sampler Platter",
    "kids boneless": "kids 4 boneless",
    "kids wings": "kids 4 classic wings",
    "kids cheeseburger": "kids cheeseburger",
    "8 wings combo": "8 wings combo",
    "8 boneless combo": "8 boneless combo",
    "half rack combo": "half rack combo",
    "half rack and 4 bone in combo": "half rack and 4 bone-in combo",
    "fish combo": "4 pieces fish and fries",
    "classic burger combo": "classic burger combo",
    "buffalo burger combo": "buffalo burger combo",
    "chicken sandwich combo": "chicken sandwich combo",
    "flyin burger combo": "Flyin’ Burger combo",
    "baked potato combo": "Flyin’ baked potato combo"
  };
  return map[item] || item;
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

function sauceSummary(order) {
  if (order.countedSauceParts.length) {
    return order.countedSauceParts.map(({ sauce, count }) => `${count} ${sauce}`).join(" and ");
  }
  if (!order.sauces.length) return "";
  if (order.sauces.length === 1) return order.sauces[0];
  return order.sauces.join(" and ");
}

function fillRemainingIncludedDipsWith(order, dipType) {
  const max = dipSlotsAllowed(order);
  while (order.includedDips.length < max) {
    order.includedDips.push(dipType);
  }
}

function addSpecificIncludedDips(order, dips) {
  const max = dipSlotsAllowed(order);
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

function detectInitialOrder(text, order) {
  const item = extractItem(text);
  const wingStyle = extractWingStyle(text);
  const rackSize = extractRackSize(text);
  const number = extractNumber(text);
  const sauces = extractSauces(text);
  const dips = extractDips(text);
  const dressing = extractDressing(text);
  const side = extractSide(text);
  const drink = extractDrink(text);
  const protein = extractProtein(text);
  const chickenStyle = extractChickenStyle(text);
  const removals = extractRemovals(text);

  if (wingStyle) {
    order.itemType = wingStyle;
    order.quantity = number;
    order.sauces = sauces;
    if (mentionsSauceOnSide(text)) order.sauceOnSide = true;
    if (mentionsLemonPepper(text) && order.sauces.includes("lime pepper")) {
      order.pendingLemonPepperConfirmation = true;
    }
    return;
  }

  if (rackSize && !item) {
    order.itemType = "ribs";
    order.size = rackSize;
    order.quantity = 1;
    order.sauces = sauces;
    if (mentionsSauceOnSide(text)) order.sauceOnSide = true;
    return;
  }

  if (item) {
    order.itemType = item;
    order.quantity = number || 1;
    order.size = rackSize;
    order.sauces = sauces;
    order.includedDips = dips.length ? dips : order.includedDips;
    order.dressing = dressing || order.dressing;
    order.comboSide = side || order.comboSide;
    order.drink = drink || order.drink;
    order.protein = protein || order.protein;
    order.chickenStyle = chickenStyle || order.chickenStyle;
    order.modifiersToRemove = [...new Set([...order.modifiersToRemove, ...removals])];

    if (mentionsSauceOnSide(text)) order.sauceOnSide = true;
    if (mentionsLemonPepper(text) && order.sauces.includes("lime pepper")) {
      order.pendingLemonPepperConfirmation = true;
    }
    if (wantsSamplerFriesSwap(text)) {
      order.samplerFriesSwap = "regular fries";
    }
  }
}

function missingField(order) {
  if (!order.itemType) return "item";

  if ((order.itemType === "wings" || order.itemType === "boneless") && !order.quantity) return "quantity";

  if (order.itemType === "ribs" && !order.size) return "size";

  if (needsProtein(order) && !order.protein) return "protein";

  if (needsChickenStyle(order) && !order.chickenStyle) return "chickenStyle";

  if (needsSauce(order) && !order.sauces.length) return "sauce";

  if (needsDressing(order) && !order.dressing) return "dressing";

  if (needsDip(order) && !order.includedDips.length) return "dip";

  if (comboNeedsSide(order) && !order.comboSide) return "comboSide";

  if (fishNeedsBaseChoice(order) && !fishChoiceIsValid(order)) return "fishSide";

  if (comboNeedsDrink(order) && !order.drink) return "drink";

  if (order.itemType === "baked potato combo" && !bakedPotatoDrinkAllowed(order)) return "bakedPotatoDrink";
  if (
    comboNeedsDrink(order) &&
    order.itemType !== "baked potato combo" &&
    !["kids boneless", "kids wings", "kids cheeseburger"].includes(order.itemType) &&
    order.drink &&
    !otherComboDrinkAllowed(order)
  ) return "drink";

  return null;
}

function nextPromptForMissing(session, order) {
  const missing = missingField(order);

  if (missing === "item") {
    return sayByLanguage(session, "What can I get started for you?", "¿Qué te preparo?");
  }

  if (missing === "quantity") {
    return sayByLanguage(session, "How many would you like?", "¿Cuántas quieres?");
  }

  if (missing === "size") {
    return sayByLanguage(session, "Did you want a half rack or a full rack?", "¿La quieres media orden o rack completo?");
  }

  if (missing === "protein") {
    return sayByLanguage(
      session,
      "For the baked potato combo, did you want chicken, steak, or pork belly?",
      "Para el baked potato combo, ¿lo quieres con chicken, steak o pork belly?"
    );
  }

  if (missing === "chickenStyle") {
    if (order.itemType === "flyin salad") {
      return sayByLanguage(session, "Did you want grilled or fried chicken on that?", "¿Lo quieres con pollo grilled o fried?");
    }
    if (order.itemType === "chicken sandwich combo") {
      return sayByLanguage(session, "Did you want grilled or fried chicken?", "¿Lo quieres con pollo grilled o fried?");
    }
    if (order.itemType === "flyin burger combo") {
      return sayByLanguage(session, "For the chicken patty, did you want grilled or fried chicken?", "Para la pieza de chicken, ¿la quieres grilled o fried?");
    }
    return sayByLanguage(session, "Did you want grilled or fried chicken?", "¿Lo quieres con pollo grilled o fried?");
  }

  if (missing === "sauce") {
    if (order.itemType === "corn ribs") {
      return sayByLanguage(
        session,
        "What sauce do you want on the corn ribs? Lime pepper and garlic parmesan are popular.",
        "¿Qué salsa quieres en los corn ribs? Lime pepper y garlic parmesan son muy pedidos."
      );
    }

    if (order.itemType === "half rack and 4 bone in combo") {
      return sayByLanguage(
        session,
        "What sauces do you want? One for the ribs and one for the wings.",
        "¿Qué salsas quieres? Una para las costillas y una para las alitas."
      );
    }

    if (order.itemType === "baked potato combo") {
      return sayByLanguage(
        session,
        "What sauce do you want on the baked potato?",
        "¿Qué salsa quieres en el baked potato?"
      );
    }

    return sayByLanguage(session, "What sauces do you want?", "¿Qué sabores quieres?");
  }

  if (missing === "dressing") {
    return sayByLanguage(
      session,
      "What dressing would you like? Ranch, blue cheese, chipotle ranch, or jalapeño ranch?",
      "¿Qué aderezo quieres? ¿Ranch, blue cheese, chipotle ranch o jalapeño ranch?"
    );
  }

  if (missing === "dip") {
    return sayByLanguage(
      session,
      `What dips do you want with that? You get ${dipSlotsAllowed(order)}. Ranch, blue cheese, chipotle ranch, or jalapeño ranch?`,
      `¿Qué dip quieres con eso? Te incluye ${dipSlotsAllowed(order)}. ¿Ranch, blue cheese, chipotle ranch o jalapeño ranch?`
    );
  }

  if (missing === "comboSide") {
    return sayByLanguage(
      session,
      "What side would you like with that? Regular fries, sweet potato fries, or potato salad?",
      "¿Qué side quieres con eso? Papas regulares, papas de camote o potato salad?"
    );
  }

  if (missing === "fishSide") {
    return sayByLanguage(
      session,
      "For the fish and fries, did you want regular fries, sweet potato fries, or potato salad on the side instead?",
      "Para el fish and fries, ¿lo quieres con papas regulares, papas de camote o potato salad al lado?"
    );
  }

  if (missing === "drink") {
    if (["kids boneless", "kids wings", "kids cheeseburger"].includes(order.itemType)) {
      return sayByLanguage(session, "What soft drink would you like with that?", "¿Qué refresco quieres con eso?");
    }

    return sayByLanguage(session, "What soft drink would you like with that?", "¿Qué refresco quieres con eso?");
  }

  if (missing === "bakedPotatoDrink") {
    return sayByLanguage(
      session,
      "For the baked potato combo, would you like a soft drink or bottled water?",
      "Para el baked potato combo, ¿quieres soft drink o bottled water?"
    );
  }

  return null;
}

function summaryForConfirmation(order, lang = "en") {
  const parts = [];
  parts.push(itemTypeDisplay(order, lang));

  if (order.quantity && ["wings", "boneless"].includes(order.itemType)) {
    parts.unshift(`${order.quantity}`);
  }

  if (order.sauces.length) {
    parts.push(lang === "es"
      ? `${order.sauceOnSide ? sauceSummary(order) + " aparte" : sauceSummary(order)}`
      : `${order.sauceOnSide ? sauceSummary(order) + " on the side" : sauceSummary(order)}`
    );
  }

  if (order.dressing) parts.push(lang === "es" ? `aderezo ${order.dressing}` : `dressing ${order.dressing}`);
  if (order.includedDips.length) parts.push(dipSummary(order.includedDips));
  if (order.extraDips.length) parts.push(`extra ${dipSummary(order.extraDips)}`);
  if (order.comboSide) parts.push(order.comboSide);
  if (order.drink) parts.push(order.drink);
  if (order.protein) parts.push(order.protein);
  if (order.chickenStyle) parts.push(lang === "es" ? `chicken ${order.chickenStyle}` : `${order.chickenStyle} chicken`);
  if (order.extraSide) parts.push(order.extraSide);

  if (order.modifiersToRemove.length) {
    parts.push(lang === "es"
      ? `sin ${order.modifiersToRemove.map((x) => x.replace(/^no /, "")).join(", ")}`
      : order.modifiersToRemove.join(", ")
    );
  }

  if (order.samplerFriesSwap) {
    parts.push(lang === "es" ? "con cambio a papas regulares" : "with regular fries swap");
  }

  return parts.join(", ");
}

function lemonPepperPrompt(session) {
  return sayByLanguage(
    session,
    "We have that as lime pepper here. Want to keep lime pepper or change it?",
    "Aquí la tenemos como laim pepper. ¿La dejamos así o la cambias?"
  );
}

function flyinFriesClarificationPrompt(session) {
  return sayByLanguage(
    session,
    "You mean the Flyin’ Fries with boneless on top?",
    "¿Te refieres a las Flyin’ Fries que llevan boneless arriba?"
  );
}

function countedSauceConfirmationPrompt(session, order) {
  const total = order.countedSauceParts.reduce((sum, item) => sum + item.count, 0);
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

function handleInterruptions(session, speech, res) {
  if (wantsStartOver(speech)) {
    resetSession(session);
    session.stage = "order";
    return sayAndStore(session, res, sayByLanguage(session, "No problem. What can I get started for you?", "No hay problema. ¿Qué te preparo?"));
  }

  if (wantsRepeat(speech)) {
    return speak(session, res, session.lastPrompt || sayByLanguage(session, "What can I get started for you?", "¿Qué te preparo?"));
  }

  if (wantsHold(speech)) {
    session.hold = true;
    return sayAndStore(session, res, sayByLanguage(session, "Of course. Just say ready when you’re set.", "Claro. Nomás dime listo cuando estés."));
  }

  if (session.hold) {
    if (wantsResume(speech)) {
      session.hold = false;
      return sayAndStore(session, res, sayByLanguage(session, "Perfect. Go ahead.", "Perfecto. Adelante."));
    }
    return speak(session, res, sayByLanguage(session, "No rush. Just say ready when you’re set.", "Sin prisa. Dime listo cuando quieras seguir."));
  }

  if (mentionsAlcohol(speech)) {
    return sayAndStore(session, res, sayByLanguage(session, "We can’t sell alcohol over the phone.", "Por teléfono no manejamos venta de alcohol."));
  }

  return null;
}

function detectRemovalsIntoOrder(order, speech) {
  const removals = extractRemovals(speech);
  if (removals.length) {
    order.modifiersToRemove = [...new Set([...order.modifiersToRemove, ...removals])];
  }
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

  if (typeof message?.customer?.message === "string") return message.customer.message;
  if (typeof message?.transcript === "string") return message.transcript;
  return "";
}

function qtyToAllowedSauces(quantity) {
  return Math.floor(quantity / 6);
}

function normalizeItemType(itemType = "") {
  const value = normalize(String(itemType));

  if (["wings", "wing", "bone in", "bone-in", "classic", "traditional", "alitas", "con hueso"].includes(value)) return "wings";
  if (["boneless", "sin hueso"].includes(value)) return "boneless";

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
    const message = req.body?.message;
    if (!message || message.type !== "tool-calls") {
      return res.status(200).json({ results: [] });
    }

    const callId = message.call?.id || "unknown-call";
    const state = getOrCreateCallState(callId);

    const latestCustomerText = normalize(getLatestCustomerText(message) || "");
    maybeUpdateCallLanguage(state, latestCustomerText);

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
                speak: sayForCall(state, "Let’s lock in the wing size first.", "Primero hay que confirmar cuántas van a ser.")
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
                speak: sayForCall(state, "I missed the sauces. What sauces would you like?", "No alcancé las salsas. ¿Qué sabores quieres?")
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
                `Perfecto. ¿Qué dip quieres con eso? Te incluye ${state.currentItem.dipsIncluded}. ¿Ranch, blue cheese, chipotle ranch o jalapeño ranch?`
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
                speak: sayForCall(state, "Let’s finish the wings first.", "Primero terminemos las alitas.")
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
            : sayForCall(state, "Want to add fries, mac bites, corn ribs, mozzarella sticks, onion rings, or Flyin’ corn?", "¿Quieres agregar papas, mac bites, corn ribs, mozzarella sticks, onion rings o Flyin’ corn?");

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
            ? findAlias(normalize(String(parameters.side)), SIDE_ALIASES) || normalize(String(parameters.side))
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
  session.lastPrompt = "Thank you for calling Flaps and Racks. Do you prefer English, o prefiere español?";
  return speak(session, res, "Thank you for calling Flaps and Racks. Do you prefer English, o prefiere español?");
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
      return sayAndStore(session, res, "Claro, ¿qué te preparo?");
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
    return reprompt(session, res, sayByLanguage(session, "Sorry, I missed that. What can I get started for you?", "Perdón, no alcancé a escuchar bien. ¿Qué te preparo?"));
  }

  const interrupt = handleInterruptions(session, speech, res);
  if (interrupt) return interrupt;

  detectRemovalsIntoOrder(session.order, speech);

  if (session.order.pendingLemonPepperConfirmation) {
    if (isYes(speech)) {
      session.order.pendingLemonPepperConfirmation = false;
      const next = nextPromptForMissing(session, session.order);
      if (next) return sayAndStore(session, res, next);
    }

    if (isNo(speech) || wantsChangeSauce(speech)) {
      session.order.pendingLemonPepperConfirmation = false;
      session.order.sauces = session.order.sauces.filter((s) => s !== "lime pepper");
      session.stage = "sauce";
      return sayAndStore(session, res, sayByLanguage(session, "Got you. What sauce do you want instead?", "Claro. ¿Qué salsa quieres en lugar de esa?"));
    }

    return sayAndStore(session, res, lemonPepperPrompt(session));
  }

  if (session.order.pendingCountedSauceConfirmation) {
    if (isYes(speech)) {
      session.order.pendingCountedSauceConfirmation = false;
      const next = nextPromptForMissing(session, session.order);
      if (next) return sayAndStore(session, res, next);
    }

    if (isNo(speech)) {
      session.order.pendingCountedSauceConfirmation = false;
      session.order.countedSauceParts = [];
      session.order.sauces = [];
      session.stage = "sauce";
      return sayAndStore(session, res, sayByLanguage(session, "No problem. What sauces do you want?", "Claro. ¿Qué salsas quieres?"));
    }

    return sayAndStore(session, res, countedSauceConfirmationPrompt(session, session.order));
  }

  if (session.order.pendingMixedSauceCharge) {
    if (isYes(speech)) {
      session.order.pendingMixedSauceCharge = false;
      const next = nextPromptForMissing(session, session.order);
      if (next) return sayAndStore(session, res, next);
    }

    if (isNo(speech)) {
      session.order.pendingMixedSauceCharge = false;
      session.order.sauces = [];
      session.stage = "sauce";
      return sayAndStore(session, res, sayByLanguage(session, "Got you. What sauces do you want instead?", "Muy bien. Entonces, ¿qué salsas quieres?"));
    }

    return sayAndStore(session, res, mixedSauceChargePrompt(session));
  }

  if (session.order.pendingFlyinFriesClarification) {
    if (isYes(speech)) {
      session.order.pendingFlyinFriesClarification = false;
      session.order.itemType = "junior flyin fries";
      session.stage = "name";
      return sayAndStore(session, res, sayByLanguage(session, "Perfect. What name can I put that under?", "Perfecto. ¿A nombre de quién pongo la orden?"));
    }

    if (isNo(speech)) {
      session.order.pendingFlyinFriesClarification = false;
      session.order.itemType = "buffalo ranch fries";
      session.stage = "name";
      return sayAndStore(session, res, sayByLanguage(session, "Got you. What name can I put that under?", "Claro. ¿A nombre de quién pongo la orden?"));
    }

    const guessed = extractItem(speech);
    if (guessed === "junior flyin fries" || guessed === "buffalo ranch fries") {
      session.order.pendingFlyinFriesClarification = false;
      session.order.itemType = guessed;
      session.stage = "name";
      return sayAndStore(session, res, sayByLanguage(session, "Perfect. What name can I put that under?", "Perfecto. ¿A nombre de quién pongo la orden?"));
    }

    session.order.pendingFlyinFriesClarification = false;
    session.order.itemType = "junior flyin fries";
    session.stage = "name";
    return sayAndStore(session, res, sayByLanguage(session, "Got you. I’ll put that in as Flyin’ Fries. What name can I put that under?", "Claro. Lo dejo como Flyin’ Fries. ¿A nombre de quién pongo la orden?"));
  }

  if (session.stage === "language" || session.stage === "order") {
    detectInitialOrder(speech, session.order);

    if (
      !session.order.flyinFriesClarifiedOnce &&
      (
        /\bflyin\b/.test(speech) ||
        /\bflying\b/.test(speech)
      ) &&
      !/\bboneless\b/.test(speech) &&
      session.order.itemType !== "buffalo ranch fries"
    ) {
      session.order.pendingFlyinFriesClarification = true;
      session.order.flyinFriesClarifiedOnce = true;
      return sayAndStore(session, res, flyinFriesClarificationPrompt(session));
    }

    if (session.order.pendingLemonPepperConfirmation) {
      return sayAndStore(session, res, lemonPepperPrompt(session));
    }

    const missing = missingField(session.order);
    if (missing) {
      session.stage = missing === "sauce" ? "sauce" : "order";
      return sayAndStore(session, res, nextPromptForMissing(session, session.order));
    }

    session.stage = needsDressing(session.order)
      ? "order"
      : needsDip(session.order)
        ? "included_dip"
        : "extra_upsell";

    if (session.stage === "included_dip") {
      return sayAndStore(session, res, nextPromptForMissing(session, session.order));
    }

    if (session.stage === "extra_upsell") {
      return sayAndStore(
        session,
        res,
        sayByLanguage(
          session,
          "Perfect. Want to add fries, mac bites, corn ribs, mozzarella sticks, onion rings, or Flyin’ corn?",
          "Perfecto. ¿Quieres agregar papas, mac bites, corn ribs, mozzarella sticks, onion rings o Flyin’ corn?"
        )
      );
    }

    return sayAndStore(session, res, nextPromptForMissing(session, session.order));
  }

  if (session.stage === "sauce") {
    if (mentionsSauceOnSide(speech)) session.order.sauceOnSide = true;
    const sauces = extractSauces(speech);

    if (!sauces.length) {
      return sayAndStore(session, res, sayByLanguage(session, "Sorry, which sauce did you want?", "Perdón, ¿qué salsa quieres?"));
    }

    session.order.sauces = sauces;

    if (mentionsLemonPepper(speech) && session.order.sauces.includes("lime pepper")) {
      session.order.pendingLemonPepperConfirmation = true;
      return sayAndStore(session, res, lemonPepperPrompt(session));
    }

    const next = nextPromptForMissing(session, session.order);
    if (next) {
      session.stage = missingField(session.order) === "dip" ? "included_dip" : "order";
      return sayAndStore(session, res, next);
    }

    session.stage = "extra_upsell";
    return sayAndStore(
      session,
      res,
      sayByLanguage(
        session,
        "Perfect. Want to add fries, mac bites, corn ribs, mozzarella sticks, onion rings, or Flyin’ corn?",
        "Perfecto. ¿Quieres agregar papas, mac bites, corn ribs, mozzarella sticks, onion rings o Flyin’ corn?"
      )
    );
  }

  if (session.stage === "included_dip") {
    const dips = extractDips(speech);
    const max = dipSlotsAllowed(session.order);

    if (!dips.length) {
      return sayAndStore(session, res, nextPromptForMissing(session, session.order));
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
          sayByLanguage(
            session,
            `Got it. I still need ${max - session.order.includedDips.length} more dip${max - session.order.includedDips.length === 1 ? "" : "s"}. Which dips do you want?`,
            `Muy bien. Todavía me falta ${max - session.order.includedDips.length} dip${max - session.order.includedDips.length === 1 ? "" : "s"}. ¿Qué dips quieres?`
          )
        );
      }
    }

    const next = nextPromptForMissing(session, session.order);
    if (next) {
      session.stage = "order";
      return sayAndStore(session, res, next);
    }

    session.stage = "extra_upsell";
    return sayAndStore(
      session,
      res,
      sayByLanguage(
        session,
        "Perfect. Want extra dips or maybe a side like fries or mac bites?",
        "Perfecto. ¿Quieres aderezo extra o algún side como papas o mac bites?"
      )
    );
  }

  if (session.stage === "extra_upsell") {
    const dips = extractDips(speech);
    const side = extractSide(speech);

    if (dips.length) {
      addExtraDip(session.order, dips[0], extractNumber(speech) || 1);
      return sayAndStore(session, res, sayByLanguage(session, "Perfect. Anything else?", "Perfecto. ¿Algo más?"));
    }

    if (side) {
      session.order.extraSide = side;
      session.stage = "name";
      return sayAndStore(
        session,
        res,
        sayByLanguage(session, `Perfect, adding ${side}. What name can I put that under?`, `Perfecto, agrego ${side}. ¿A nombre de quién pongo la orden?`)
      );
    }

    if (isNo(speech)) {
      session.stage = "name";
      return sayAndStore(session, res, sayByLanguage(session, "Perfect. What name can I put that under?", "Perfecto. ¿A nombre de quién pongo la orden?"));
    }

    return sayAndStore(session, res, sayByLanguage(session, "Sorry, I missed that. Want extra dips or maybe a side?", "Perdón, ¿quieres aderezo extra o algún side?"));
  }

  if (session.stage === "name") {
    const name = extractName(speech);
    if (!name) {
      return sayAndStore(session, res, sayByLanguage(session, "Sorry, I didn’t catch the name. What name can I put that under?", "Perdón, no alcancé el nombre. ¿A nombre de quién?"));
    }

    session.order.name = name;
    session.stage = "confirm";

    const summary = sayByLanguage(
      session,
      `Perfect. I have ${summaryForConfirmation(session.order, "en")}, under ${name}. Everything look right?`,
      `Perfecto. Tengo ${summaryForConfirmation(session.order, "es")}, a nombre de ${name}. ¿Todo está bien?`
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

    if (wantsChangeSauce(speech) || extractItem(speech) || extractWingStyle(speech) || extractRemovals(speech).length) {
      session.stage = "order";
      return sayAndStore(session, res, sayByLanguage(session, "No problem. Tell me what you want to change.", "Claro. Dime qué quieres cambiar."));
    }

    return sayAndStore(session, res, sayByLanguage(session, "Everything look right?", "¿Todo está bien?"));
  }

  session.stage = "order";
  return sayAndStore(session, res, sayByLanguage(session, "What can I get started for you?", "¿Qué te preparo?"));
});

app.listen(PORT, () => {
  console.log("Jeffrey server running on port", PORT);
});
