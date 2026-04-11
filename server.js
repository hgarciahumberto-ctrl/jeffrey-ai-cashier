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

const sessions = new Map();
const callStates = new Map();

const SAUCE_ALIASES = [
  { keys: ["al pastor", "pastor"], value: "al pastor" },
  { keys: ["mild", "buffalo mild", "suave"], value: "mild" },
  { keys: ["hot", "buffalo hot", "picosa", "picante"], value: "hot" },
  { keys: ["lime pepper", "laim pepper", "limon pepper", "limon pimienta", "limón pimienta"], value: "lime pepper" },
  { keys: ["garlic parmesan", "garlic parm", "parm", "parmesan", "ajo parmesano"], value: "garlic parmesan" },
  { keys: ["mango habanero"], value: "mango habanero" },
  { keys: ["teriyaki"], value: "teriyaki" },
  { keys: ["barbecue", "barbeque", "bbq", "barbacoa"], value: "barbeque" },
  { keys: ["green chile", "green chili", "chile verde"], value: "green chile" },
  { keys: ["sweet and spicy", "sweet & spicy", "dulce y picosa", "dulce y picante"], value: "sweet and spicy" },
  { keys: ["citrus chipotle", "chipotle citrico", "chipotle cítrico"], value: "citrus chipotle" },
  { keys: ["bbq chiltepin", "barbecue chiltepin", "barbeque chiltepin", "barbacoa chiltepin"], value: "barbeque chiltepin" },
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
  { keys: ["fries", "frais", "regular fries", "french fries", "papas", "papas fritas"], value: "regular fries" },
  { keys: ["sweet potato fries", "camote fries", "papas de camote"], value: "sweet potato fries" },
  { keys: ["potato salad", "ensalada de papa"], value: "potato salad" },
  { keys: ["mac bites", "mac bite", "mac and cheese bites"], value: "mac bites" },
  { keys: ["corn ribs", "costillas de elote"], value: "corn ribs" },
  { keys: ["flyin corn", "flyin’ corn", "flying corn", "elote"], value: "flyin corn" },
  { keys: ["mozzarella sticks", "mozzarella"], value: "mozzarella sticks" },
  { keys: ["onion rings", "aros de cebolla"], value: "onion rings" },
  { keys: ["buffalo ranch fries"], value: "buffalo ranch fries" },
  { keys: ["tostones"], value: "tostones" },
  { keys: ["yuca fries", "yucca fries", "yuca"], value: "yuca fries" }
];

const DRINK_ALIASES = [
  { keys: ["soft drink", "drink", "soda", "refresco", "fountain drink"], value: "soft drink" },
  { keys: ["water", "bottled water", "agua"], value: "bottled water" }
];

const PROTEIN_ALIASES = [
  { keys: ["chicken", "pollo"], value: "chicken" },
  { keys: ["steak", "carne asada"], value: "steak" },
  { keys: ["pork belly"], value: "pork belly" },
  { keys: ["no protein", "sin proteina", "sin proteína"], value: "no protein" }
];

const CHICKEN_STYLE_ALIASES = [
  { keys: ["grilled", "a la plancha"], value: "grilled" },
  { keys: ["fried", "frito"], value: "fried" }
];

const ITEM_ALIASES = [
  { keys: ["wings", "bone in", "bone-in", "classic wings", "traditional wings", "traditional", "alitas", "alitas con hueso", "con hueso"], value: "wings" },
  { keys: ["boneless", "boneless wings"], value: "boneless" },

  { keys: ["ribs", "korean ribs", "korean style ribs", "costillas"], value: "ribs" },

  { keys: ["junior flyin fries", "flyin fries", "flyin’ fries", "flying fries", "flain frais"], value: "junior flyin fries" },
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

  { keys: ["classic burger combo", "classic burger"], value: "classic burger combo" },
  { keys: ["chicken sandwich combo", "chicken sandwich"], value: "chicken sandwich combo" },
  { keys: ["flyin burger combo", "flyin burger", "flyin’ burger"], value: "flyin burger combo" },
  { keys: ["buffalo burger"], value: "buffalo burger request" },

  { keys: ["flyin baked potato combo", "baked potato combo", "loaded baked potato combo"], value: "baked potato combo" }
];

const REMOVAL_ALIASES = [
  { keys: ["no tomato", "sin tomate"], value: "no tomato" },
  { keys: ["no cheese", "sin queso"], value: "no cheese" },
  { keys: ["no mayo", "sin mayonesa"], value: "no mayo" },
  { keys: ["no onion", "sin cebolla"], value: "no onion" },
  { keys: ["no onions", "sin cebollas"], value: "no onion" },
  { keys: ["no lettuce", "sin lechuga"], value: "no lettuce" },
  { keys: ["no pickles", "sin pepinillos", "sin pickles"], value: "no pickles" },
  { keys: ["on the side", "aparte", "a un lado", "por separado"], value: "on the side" }
];

function normalize(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findAlias(text, aliasList) {
  const norm = normalize(text);
  for (const item of aliasList) {
    for (const key of item.keys) {
      if (norm.includes(normalize(key))) return item.value;
    }
  }
  return null;
}

function extractAllAliases(text, aliasList) {
  const found = [];
  const norm = normalize(text);
  for (const item of aliasList) {
    for (const key of item.keys) {
      if (norm.includes(normalize(key))) {
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
  return extractAllAliases(text, REMOVAL_ALIASES).filter((x) => x !== "on the side");
}

function extractOnSideRequested(text) {
  return /\b(on the side|aparte|a un lado|por separado)\b/.test(text);
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

function wantsSpanish(text) {
  return /\b(spanish|espanol|hablas espanol|en espanol)\b/.test(text);
}

function wantsEnglish(text) {
  return /\b(english|speak english|hablas ingles|in english|ingles)\b/.test(text);
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

function isYes(text) {
  return /\b(yes|yeah|yep|sure|okay|ok|sounds good|that works|go ahead|correct|si|sí|correcto|claro|dale|esta bien|está bien|asi es|así es|sale|va)\b/.test(text);
}

function isNo(text) {
  return /\b(no|nope|nah|nothing else|thats all|that s all|no thank you|just that|im good|i m good|nada mas|nada más|solo eso|con eso|no gracias)\b/.test(text);
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

function wantsAnotherItem(text) {
  return /\b(and also|also|add|another|otra cosa|agrega|agregame|agregar|tambien|también)\b/.test(text);
}

function wantsBuffaloBurger(text) {
  return /\b(buffalo burger)\b/.test(text);
}

function wantsChangeSauce(text) {
  return /\b(change the sauce|different sauce|switch the sauce|another sauce|make that|instead|cambia la salsa|otra salsa|mejor)\b/.test(text);
}

function wantsAllSameDip(text) {
  return /\b(all ranch|just ranch|all blue cheese|just blue cheese|todo ranch|todo blue cheese|solo ranch|solo blue cheese|los tres ranch|3 ranch|three ranch)\b/.test(text);
}

function wantsSideUpsell(text) {
  return /\b(ranch|extra ranch|mac bites|corn ribs|mozzarella sticks|onion rings|flyin corn|papas|fries|frais|mozzarella|mac|corn|rings)\b/.test(text);
}

function mentionsLemonPepper(text) {
  return /\b(lemon pepper|lemon|limon pepper|limón pepper)\b/.test(normalize(text));
}

function sayByLanguage(session, english, spanish) {
  return session.languageMode === "es" ? spanish : english;
}

function getSpeechConfig(session) {
  if (session.languageMode === "es") {
    return { voice: SPANISH_VOICE, language: SPANISH_LANGUAGE };
  }
  return { voice: ENGLISH_VOICE, language: ENGLISH_LANGUAGE };
}

function blankOrder() {
  return {
    itemType: null,
    quantity: null,
    size: null,
    sauces: [],
    sauceOnSide: false,
    noSauce: false,

    includedDips: [],
    extraDips: [],
    dressing: null,
    bakedPotatoDrizzle: null,
    bakedPotatoToppingMode: null,

    comboSide: null,
    drink: null,

    protein: null,
    chickenStyle: null,

    modifiersToRemove: [],
    notes: [],

    comboUpsellAsked: false,
    comboUpsellAccepted: false,
    pendingLemonPepperConfirmation: false,
    burgerIngredientsConfirmed: false
  };
}

function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, {
      stage: "language",
      languageMode: "unknown",
      languageLocked: false,
      lastPrompt: "",
      reprompts: 0,
      hold: false,
      order: blankOrder(),
      completedItems: [],
      orderName: null
    });
  }
  return sessions.get(callSid);
}

function resetSession(session) {
  session.stage = "language";
  session.languageMode = "unknown";
  session.languageLocked = false;
  session.lastPrompt = "";
  session.reprompts = 0;
  session.hold = false;
  session.order = blankOrder();
  session.completedItems = [];
  session.orderName = null;
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
  }
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
      timeout: 4,
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
  return speak(session, res, session.lastPrompt || fallback);
}

function addNotesForBuffaloBurger(order) {
  order.itemType = "buffalo burger request";
  order.notes.push("Use classic burger combo");
  order.notes.push("Remove mayo");
  order.notes.push("Sub ranch for mayo");
  order.notes.push("Add mild buffalo sauce side charge");
}

function sauceSlotsAllowed(order) {
  if (order.itemType === "wings" || order.itemType === "boneless") {
    if (order.quantity === 9) return 1;
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
    if (order.quantity === 9) return 1;
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

function comboNeedsSide(order) {
  return [
    "8 wings combo",
    "8 boneless combo",
    "half rack combo",
    "half rack and 4 bone in combo",
    "fish combo",
    "classic burger combo",
    "chicken sandwich combo",
    "flyin burger combo",
    "buffalo burger request"
  ].includes(order.itemType);
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

function needsSauce(order) {
  if (order.noSauce) return false;
  return sauceSlotsAllowed(order) > 0;
}

function needsDressing(order) {
  return ["house salad", "flyin salad"].includes(order.itemType);
}

function needsDip(order) {
  return dipSlotsAllowed(order) > 0;
}

function needsBakedPotatoDrizzle(order) {
  return order.itemType === "baked potato combo";
}

function needsBakedPotatoToppingMode(order) {
  return order.itemType === "baked potato combo";
}

function comboNeedsDrink(order) {
  return order.itemType === "baked potato combo";
}

function bakedPotatoDrinkAllowed(order) {
  return ["soft drink", "bottled water"].includes(order.drink || "");
}

function fishChoiceIsValid(order) {
  return ["regular fries", "sweet potato fries", "potato salad", "tostones", "yuca fries"].includes(order.comboSide || "");
}

function comboSideIsValid(order) {
  if (!comboNeedsSide(order)) return true;
  if (order.itemType === "fish combo") return fishChoiceIsValid(order);
  return ["regular fries", "sweet potato fries", "potato salad"].includes(order.comboSide || "");
}

function upsellOpportunity(order) {
  return (
    (["wings", "boneless"].includes(order.itemType) && [6, 9].includes(order.quantity || 0)) ||
    (order.itemType === "ribs" && order.size === "half rack")
  );
}

function isBurgerLike(order) {
  return ["classic burger combo", "chicken sandwich combo", "flyin burger combo", "buffalo burger request", "kids cheeseburger"].includes(order.itemType);
}

function itemTypeDisplay(order, lang = "en") {
  const item = order.itemType;

  if (lang === "es") {
    const map = {
      wings: "alitas con hueso",
      boneless: "boneless",
      ribs: order.size === "full rack" ? "rack completo de korean style ribs" : "medio rack de korean style ribs",
      "junior flyin fries": "flyin fries",
      "pork belly fries": "pork belly fries",
      "chicken parmesan fries": "chicken parmesan fries",
      "buffalo ranch fries": "buffalo ranch fries",
      "house salad": "house salad",
      "flyin salad": "flyin salad",
      "pork belly": "pork belly",
      "mac bites": "mac bites",
      "onion rings": "onion rings",
      "flyin corn": "flyin corn",
      "corn ribs": "corn ribs",
      "mozzarella sticks": "mozzarella sticks",
      "sampler platter": "sampler platter",
      "kids boneless": "kids de 4 boneless",
      "kids wings": "kids de 4 alitas",
      "kids cheeseburger": "kids cheeseburger",
      "8 wings combo": "combo de 8 alitas",
      "8 boneless combo": "combo de 8 boneless",
      "half rack combo": "combo de medio rack",
      "half rack and 4 bone in combo": "combo de medio rack y 4 alitas",
      "fish combo": "combo de pescado",
      "classic burger combo": "classic burger combo",
      "chicken sandwich combo": "chicken sandwich combo",
      "flyin burger combo": "flyin burger combo",
      "baked potato combo": "combo de flyin baked potato",
      "buffalo burger request": "buffalo burger combo"
    };
    return map[item] || item;
  }

  const map = {
    wings: "bone-in wings",
    boneless: "boneless",
    ribs: order.size === "full rack" ? "full rack korean style ribs" : "half rack korean style ribs",
    "junior flyin fries": "Flyin’ Fries",
    "pork belly fries": "pork belly fries",
    "chicken parmesan fries": "chicken parmesan fries",
    "buffalo ranch fries": "buffalo ranch fries",
    "house salad": "house salad",
    "flyin salad": "flyin salad",
    "pork belly": "pork belly",
    "mac bites": "mac bites",
    "onion rings": "onion rings",
    "flyin corn": "flyin corn",
    "corn ribs": "corn ribs",
    "mozzarella sticks": "mozzarella sticks",
    "sampler platter": "sampler platter",
    "kids boneless": "kids 4 boneless",
    "kids wings": "kids 4 classic wings",
    "kids cheeseburger": "kids cheeseburger",
    "8 wings combo": "8 wings combo",
    "8 boneless combo": "8 boneless combo",
    "half rack combo": "half rack combo",
    "half rack and 4 bone in combo": "half rack and 4 bone-in combo",
    "fish combo": "fish combo",
    "classic burger combo": "classic burger combo",
    "chicken sandwich combo": "chicken sandwich combo",
    "flyin burger combo": "flyin burger combo",
    "baked potato combo": "Flyin’ baked potato combo",
    "buffalo burger request": "buffalo burger combo"
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
    .map(([type, qty]) => `${qty} ${type}`)
    .join(", ");
}

function sauceSummary(order) {
  if (order.noSauce) return "no sauce";
  if (!order.sauces.length) return "";
  return order.sauces
    .map((s) => (s === "lime pepper" ? "laim pepper" : s))
    .join(" and ");
}

function sauceSummaryEs(order) {
  if (order.noSauce) return "sin salsa";
  if (!order.sauces.length) return "";
  return order.sauces
    .map((s) => (s === "lime pepper" ? "laim pepper" : s))
    .join(" y ");
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

  if (wantsBuffaloBurger(text)) {
    addNotesForBuffaloBurger(order);
    order.comboSide = side || order.comboSide;
    return;
  }

  if (wingStyle) {
    order.itemType = wingStyle;
    order.quantity = number;
    if (mentionsLemonPepper(text)) {
      order.pendingLemonPepperConfirmation = true;
    } else {
      order.sauces = sauces.length ? sauces : order.sauces;
    }
    if (dips.length) order.includedDips = dips;
    if (extractOnSideRequested(text)) order.sauceOnSide = true;
    if (/\b(no sauce|sin salsa)\b/.test(text)) order.noSauce = true;
    return;
  }

  if (rackSize && !item) {
    order.itemType = "ribs";
    order.size = rackSize;
    order.quantity = 1;
    if (mentionsLemonPepper(text)) {
      order.pendingLemonPepperConfirmation = true;
    } else {
      order.sauces = sauces.length ? sauces : order.sauces;
    }
    if (extractOnSideRequested(text)) order.sauceOnSide = true;
    if (/\b(no sauce|sin salsa)\b/.test(text)) order.noSauce = true;
    return;
  }

  if (item) {
    order.itemType = item;
    order.quantity = number || order.quantity || 1;
    order.size = rackSize || order.size;
    if (mentionsLemonPepper(text)) {
      order.pendingLemonPepperConfirmation = true;
    } else {
      order.sauces = sauces.length ? sauces : order.sauces;
    }
    order.includedDips = dips.length ? dips : order.includedDips;
    order.dressing = dressing || order.dressing;
    order.comboSide = side || order.comboSide;
    order.drink = drink || order.drink;
    order.protein = protein || order.protein;
    order.chickenStyle = chickenStyle || order.chickenStyle;
    order.modifiersToRemove = [...new Set([...order.modifiersToRemove, ...removals])];

    if (extractOnSideRequested(text)) order.sauceOnSide = true;
    if (/\b(no sauce|sin salsa)\b/.test(text)) order.noSauce = true;

    if (item === "buffalo ranch fries" && !order.comboSide) {
      order.comboSide = "regular fries";
    }
    if (item === "half rack combo") {
      order.size = "half rack";
    }
  }
}

function burgerIngredientLine(session, order) {
  if (order.itemType === "flyin burger combo" && !order.chickenStyle) {
    return sayByLanguage(
      session,
      "Would you like the chicken grilled or fried?",
      "¿Quieres el pollo a la plancha o frito?"
    );
  }

  if (order.itemType === "classic burger combo") {
    return sayByLanguage(
      session,
      "That comes with cheese, mayo, lettuce, onion, tomato, and pickles. Any changes?",
      "Trae queso, mayo, lechuga, cebolla, tomate y pickles. ¿Algún cambio?"
    );
  }

  if (order.itemType === "chicken sandwich combo") {
    if (!order.chickenStyle) {
      return sayByLanguage(
        session,
        "Would you like the chicken grilled or fried?",
        "¿Quieres el pollo a la plancha o frito?"
      );
    }
    return sayByLanguage(
      session,
      "That comes with cheese, mayo, lettuce, onion, tomato, and pickles. Any changes?",
      "Trae queso, mayo, lechuga, cebolla, tomate y pickles. ¿Algún cambio?"
    );
  }

  if (order.itemType === "flyin burger combo") {
    return sayByLanguage(
      session,
      "That comes with cheese, mayo, chipotle ranch, lettuce, onion, tomato, and pickles. Any changes?",
      "Trae queso, mayo, chipotle ranch, lechuga, cebolla, tomate y pickles. ¿Algún cambio?"
    );
  }

  if (order.itemType === "buffalo burger request") {
    return sayByLanguage(
      session,
      "Perfect. That comes with cheese, buffalo sauce, ranch, lettuce, onion, tomato, and pickles. Any changes?",
      "Perfecto. Trae queso, buffalo sauce, ranch, lechuga, cebolla, tomate y pickles. ¿Algún cambio?"
    );
  }

  return null;
}

function missingField(order) {
  if (!order.itemType) return "item";

  if ((order.itemType === "wings" || order.itemType === "boneless") && !order.quantity) return "quantity";
  if (order.itemType === "ribs" && !order.size) return "size";

  if (needsProtein(order) && !order.protein) return "protein";
  if (needsChickenStyle(order) && !order.chickenStyle) return "chickenStyle";
  if (order.pendingLemonPepperConfirmation) return "lemonPepperConfirm";
  if (needsSauce(order) && !order.sauces.length) return "sauce";
  if (needsDressing(order) && !order.dressing) return "dressing";
  if (needsDip(order) && order.includedDips.length < dipSlotsAllowed(order)) return "dip";
  if (comboNeedsSide(order) && !order.comboSide) return "comboSide";
  if (order.itemType === "fish combo" && !fishChoiceIsValid(order)) return "fishSide";
  if (needsBakedPotatoDrizzle(order) && !order.bakedPotatoDrizzle) return "bakedPotatoDrizzle";
  if (needsBakedPotatoToppingMode(order) && !order.bakedPotatoToppingMode) return "bakedPotatoToppingMode";
  if (comboNeedsDrink(order) && !order.drink) return "bakedPotatoDrink";
  if (order.itemType === "baked potato combo" && !bakedPotatoDrinkAllowed(order)) return "bakedPotatoDrink";
  if (!comboSideIsValid(order)) return order.itemType === "fish combo" ? "fishSide" : "comboSide";

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
    return sayByLanguage(session, "Half rack or full rack?", "¿Medio rack o rack completo?");
  }

  if (missing === "protein") {
    return sayByLanguage(
      session,
      "For the Flyin’ baked potato combo: chicken, steak, pork belly, or no protein?",
      "Para el combo de flyin baked potato: ¿pollo, carne asada, pork belly o sin proteína?"
    );
  }

  if (missing === "chickenStyle") {
    return sayByLanguage(session, "Would you like the chicken grilled or fried?", "¿Quieres el pollo a la plancha o frito?");
  }

  if (missing === "lemonPepperConfirm") {
    return sayByLanguage(
      session,
      "We have that as laim pepper here. Is that okay?",
      "La tenemos como laim pepper. ¿Está bien así?"
    );
  }

  if (missing === "sauce") {
    if (order.itemType === "corn ribs") {
      return sayByLanguage(
        session,
        "What sauce do you want? Laim pepper and garlic parmesan are popular.",
        "¿Qué salsa quieres? Laim pepper y garlic parmesan son muy pedidos."
      );
    }

    if (order.itemType === "pork belly") {
      return sayByLanguage(
        session,
        "What sauce do you want? Green chile and barbeque chiltepin are popular.",
        "¿Qué salsa quieres? Green chile y barbeque chiltepin son muy pedidos."
      );
    }

    if (order.itemType === "ribs" || order.itemType === "half rack combo") {
      return sayByLanguage(
        session,
        "What sauce do you want? Green chile, barbeque chiltepin, or mango habanero are popular.",
        "¿Qué salsa quieres? Green chile, barbeque chiltepin o mango habanero son muy pedidos."
      );
    }

    if (order.itemType === "half rack and 4 bone in combo") {
      return sayByLanguage(
        session,
        "One sauce for the ribs and one for the wings?",
        "¿Una salsa para las costillas y una para las alitas?"
      );
    }

    if (order.itemType === "baked potato combo") {
      return sayByLanguage(
        session,
        "What sauce do you want? Green chile is the most popular.",
        "¿Qué salsa quieres? Green chile es la más pedida."
      );
    }

    return sayByLanguage(session, "What sauce do you want?", "¿Qué salsa quieres?");
  }

  if (missing === "dressing") {
    return sayByLanguage(
      session,
      "What dressing? Ranch, blue cheese, chipotle ranch, or jalapeño ranch?",
      "¿Qué aderezo? ¿Ranch, blue cheese, chipotle ranch o jalapeño ranch?"
    );
  }

  if (missing === "dip") {
    const needed = dipSlotsAllowed(order) - order.includedDips.length;
    if (order.includedDips.length === 0) {
      return sayByLanguage(
        session,
        `What dip do you want? You get ${dipSlotsAllowed(order)}.`,
        `¿Qué dip quieres? Te incluye ${dipSlotsAllowed(order)}.`
      );
    }
    return sayByLanguage(
      session,
      `I still need ${needed} more dip${needed > 1 ? "s" : ""}.`,
      `Todavía me faltan ${needed} dip${needed > 1 ? "s" : ""}.`
    );
  }

  if (missing === "comboSide") {
    if (session.languageMode === "es") {
      return "¿Qué acompañante quieres: papas, papas de camote o ensalada de papa?";
    }
    return "What side do you want: fries, sweet potato fries, or potato salad?";
  }

  if (missing === "fishSide") {
    if (session.languageMode === "es") {
      return "¿Qué acompañante quieres: papas, papas de camote o ensalada de papa?";
    }
    return "What side do you want: fries, sweet potato fries, or potato salad?";
  }

  if (missing === "bakedPotatoDrizzle") {
    return sayByLanguage(
      session,
      "What drizzle do you want on top? Ranch, blue cheese, chipotle ranch, or jalapeño ranch?",
      "¿Qué drizzle quieres arriba? ¿Ranch, blue cheese, chipotle ranch o jalapeño ranch?"
    );
  }

  if (missing === "bakedPotatoToppingMode") {
    return sayByLanguage(
      session,
      "Would you like everything on top or all on the side?",
      "¿Lo quieres arriba o todo por un lado?"
    );
  }

  if (missing === "bakedPotatoDrink") {
    return sayByLanguage(
      session,
      "Soft drink cup or bottled water?",
      "¿Vaso para refill o agua embotellada?"
    );
  }

  return null;
}

function summaryForConfirmation(order, lang = "en") {
  const parts = [];

  parts.push(itemTypeDisplay(order, lang));

  if (!isBurgerLike(order)) {
    if (order.sauces.length || order.noSauce) {
      if (lang === "es") {
        parts.push(order.noSauce ? "sin salsa" : `${sauceSummaryEs(order)}${order.sauceOnSide ? " aparte" : ""}`);
      } else {
        parts.push(order.noSauce ? "no sauce" : `${sauceSummary(order)}${order.sauceOnSide ? " on the side" : ""}`);
      }
    }
  }

  if (order.dressing) parts.push(lang === "es" ? `aderezo ${order.dressing}` : `dressing ${order.dressing}`);
  if (order.bakedPotatoDrizzle) parts.push(lang === "es" ? `drizzle ${order.bakedPotatoDrizzle}` : `drizzle ${order.bakedPotatoDrizzle}`);
  if (order.bakedPotatoToppingMode) {
    parts.push(
      lang === "es"
        ? (order.bakedPotatoToppingMode === "on the side" ? "todo por un lado" : "todo arriba")
        : (order.bakedPotatoToppingMode === "on the side" ? "all on the side" : "everything on top")
    );
  }
  if (order.includedDips.length && !isBurgerLike(order)) parts.push(dipSummary(order.includedDips));
  if (order.extraDips.length) parts.push(lang === "es" ? `extra ${dipSummary(order.extraDips)}` : `extra ${dipSummary(order.extraDips)}`);
  if (order.comboSide) {
    if (lang === "es") {
      const sideMap = {
        "regular fries": "papas",
        "sweet potato fries": "papas de camote",
        "potato salad": "ensalada de papa",
        "tostones": "tostones",
        "yuca fries": "papas de yuca"
      };
      parts.push(sideMap[order.comboSide] || order.comboSide);
    } else {
      parts.push(order.comboSide);
    }
  }
  if (order.drink && order.itemType === "baked potato combo") {
    parts.push(lang === "es" ? (order.drink === "soft drink" ? "vaso para refill" : "agua embotellada") : order.drink);
  }

  if (order.protein) {
    if (lang === "es") {
      const proteinMap = {
        "no protein": "sin proteína",
        "chicken": "pollo",
        "steak": "carne asada",
        "pork belly": "pork belly"
      };
      parts.push(proteinMap[order.protein] || order.protein);
    } else {
      parts.push(order.protein === "no protein" ? "no protein" : order.protein);
    }
  }

  if (order.chickenStyle) {
    parts.push(lang === "es" ? `pollo ${order.chickenStyle === "grilled" ? "a la plancha" : "frito"}` : `${order.chickenStyle} chicken`);
  }

  if (order.modifiersToRemove.length) {
    parts.push(lang === "es" ? `sin ${order.modifiersToRemove.map((x) => x.replace(/^no /, "")).join(", ")}` : order.modifiersToRemove.join(", "));
  }

  if (order.notes.length && !isBurgerLike(order)) {
    parts.push(lang === "es" ? "con nota" : "with note");
  }

  return parts.join(", ");
}

function summarizeCompletedItems(session) {
  const lang = session.languageMode === "es" ? "es" : "en";
  return session.completedItems.map((item) => summaryForConfirmation(item, lang)).join("; ");
}

function finalizeCurrentItem(session) {
  session.completedItems.push(JSON.parse(JSON.stringify(session.order)));
  session.order = blankOrder();
}

function itemIsComplete(order) {
  return !missingField(order);
}

function oneItemAtATimeLine(session) {
  return sayByLanguage(
    session,
    "I’ll help you one item at a time so everything comes out right.",
    "Te ayudo una orden a la vez para que todo salga bien."
  );
}

function askNextItemLine(session) {
  return sayByLanguage(
    session,
    "Perfect. What would you like to add next?",
    "Perfecto. ¿Qué más te agrego?"
  );
}

function finalUpsellLine(session) {
  return sayByLanguage(
    session,
    "Before we finish, want to add mac bites, corn ribs, mozzarella sticks, or extra ranch?",
    "Antes de terminar, ¿quieres agregar mac bites, corn ribs, mozzarella sticks o ranch extra?"
  );
}

function comboUpsellLine(session, order) {
  if (order.itemType === "ribs" && order.size === "half rack") {
    return sayByLanguage(
      session,
      "You can make that a half rack combo with a side and drink cup. Want to do that?",
      "Lo puedes hacer combo de medio rack con acompañante y vaso para refill. ¿Lo quieres así?"
    );
  }

  return sayByLanguage(
    session,
    "You can make that an 8-piece combo with a side and drink cup. Want to do that?",
    "Lo puedes hacer combo de 8 piezas con acompañante y vaso para refill. ¿Lo quieres así?"
  );
}

function lemonPepperPrompt(session) {
  return sayByLanguage(
    session,
    "We have that as laim pepper here. Is that okay?",
    "La tenemos como laim pepper. ¿Está bien así?"
  );
}

function flyinFriesExplain(session) {
  return sayByLanguage(
    session,
    "The Flyin’ Fries come with fries, boneless, ranch, chipotle ranch, and buffalo drizzle.",
    "Las Flyin’ Fries llevan papas, boneless, ranch, chipotle ranch y buffalo drizzle."
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
    return sayAndStore(session, res, sayByLanguage(session, "Sure. Just say ready when you’re set.", "Claro. Nomás dime listo cuando estés."));
  }

  if (session.hold) {
    if (wantsResume(speech)) {
      session.hold = false;
      return sayAndStore(session, res, sayByLanguage(session, "Perfect. Go ahead.", "Perfecto. Adelante."));
    }
    return speak(session, res, sayByLanguage(session, "No rush. Say ready when you want to keep going.", "Sin prisa. Dime listo cuando quieras seguir."));
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
  if (extractOnSideRequested(speech)) {
    order.notes.push("Customer requested something on the side");
  }
}

function maybeHandleDirectOrderUpdates(session, speech) {
  const sauces = extractSauces(speech);
  const dips = extractDips(speech);
  const dressing = extractDressing(speech);
  const side = extractSide(speech);
  const drink = extractDrink(speech);
  const protein = extractProtein(speech);
  const chickenStyle = extractChickenStyle(speech);

  if (mentionsLemonPepper(speech)) {
    session.order.pendingLemonPepperConfirmation = true;
  }

  if (sauces.length && needsSauce(session.order) && session.order.sauces.length === 0 && !session.order.pendingLemonPepperConfirmation) {
    session.order.sauces = sauces;
  }

  if (dips.length && needsDip(session.order) && session.order.includedDips.length < dipSlotsAllowed(session.order)) {
    if (wantsAllSameDip(speech) && dips.length === 1) {
      fillRemainingIncludedDipsWith(session.order, dips[0]);
    } else {
      addSpecificIncludedDips(session.order, dips);
    }
  }

  if (dressing && needsDressing(session.order)) session.order.dressing = dressing;
  if (side && comboNeedsSide(session.order)) session.order.comboSide = side;
  if (drink && comboNeedsDrink(session.order)) session.order.drink = drink;
  if (protein && needsProtein(session.order)) session.order.protein = protein;
  if (chickenStyle && needsChickenStyle(session.order)) session.order.chickenStyle = chickenStyle;

  if (session.order.itemType === "baked potato combo" && dips.length && !session.order.bakedPotatoDrizzle) {
    session.order.bakedPotatoDrizzle = dips[0];
  }

  if (session.order.itemType === "baked potato combo") {
    if (/\b(on top|with everything on top|arriba)\b/.test(normalize(speech))) {
      session.order.bakedPotatoToppingMode = "on top";
    }
    if (/\b(on the side|all on the side|todo por un lado|por un lado|aparte)\b/.test(normalize(speech))) {
      session.order.bakedPotatoToppingMode = "on the side";
    }
  }
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
  state.language = detected === "spanglish" ? "es" : detected;
}

function sayForCall(state, english, spanish) {
  return state.language === "es" ? spanish : english;
}

function qtyToAllowedSauces(quantity) {
  if (Number(quantity) === 9) return 1;
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
  if (lang === "es") return itemType === "wings" ? "alitas con hueso" : "boneless";
  return itemType === "wings" ? "bone-in wings" : "boneless";
}

function summarizeItemsForCall(state) {
  const lang = state.language === "es" ? "es" : "en";
  return state.items
    .map((item) => {
      const base = `${item.quantity} ${itemTypeLabel(item.type, lang)}`;
      const sauces = item.sauces.length
        ? lang === "es"
          ? `, salsas: ${item.sauces.map((s) => (s === "lime pepper" ? "laim pepper" : s)).join(" y ")}`
          : `, ${item.sauces.map((s) => (s === "lime pepper" ? "laim pepper" : s)).join(" and ")}`
        : "";
      const extras = item.extraDips.length
        ? lang === "es"
          ? `, extra: ${item.extraDips.join(" y ")}`
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
  if (typeof message?.customer?.message === "string") return message.customer.message;
  if (typeof message?.transcript === "string") return message.transcript;
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
                speak: sayForCall(state, "Bone-in or boneless, and how many?", "¿Con hueso o boneless, y cuántas?")
              })
            );
            break;
          }

          setCurrentItem(state, itemType, quantity);

          if ([6, 9].includes(quantity) && !state.flags.upsellOffered) {
            state.flags.upsellOffered = true;
            results.push(
              toolResult(name, toolCallId, {
                ok: true,
                speak: sayForCall(
                  state,
                  "You can make that an 8-piece combo with a side and drink cup. Want to do that?",
                  "Lo puedes hacer combo de 8 piezas con acompañante y vaso para refill. ¿Lo quieres así?"
                )
              })
            );
            break;
          }

          results.push(
            toolResult(name, toolCallId, {
              ok: true,
              speak: sayForCall(
                state,
                `Got it. What sauce do you want? You can do up to ${state.currentItem.allowedSauces}.`,
                `Perfecto. ¿Qué salsa quieres? Puedes escoger hasta ${state.currentItem.allowedSauces}.`
              )
            })
          );
          break;
        }

        case "update_quantity": {
          const newQuantity = Number(parameters.newQuantity || parameters.quantity);

          if (!state.currentItem) {
            results.push(toolResult(name, toolCallId, { ok: false, speak: sayForCall(state, "Which item are we updating?", "¿Qué item estamos cambiando?") }));
            break;
          }

          if (!validWingQuantity(newQuantity)) {
            results.push(
              toolResult(name, toolCallId, {
                ok: false,
                speak: sayForCall(state, "We have 6, 9, 12, 18, 24, or 48.", "Tenemos 6, 9, 12, 18, 24 o 48.")
              })
            );
            break;
          }

          state.currentItem.quantity = newQuantity;
          state.currentItem.allowedSauces = qtyToAllowedSauces(newQuantity);
          state.currentItem.dipsIncluded = state.currentItem.allowedSauces;

          if ([6, 9].includes(newQuantity)) {
            results.push(
              toolResult(name, toolCallId, {
                ok: true,
                speak: sayForCall(
                  state,
                  "You can make that an 8-piece combo with a side and drink cup. Want to do that?",
                  "Lo puedes hacer combo de 8 piezas con acompañante y vaso para refill. ¿Lo quieres así?"
                )
              })
            );
            break;
          }

          results.push(
            toolResult(name, toolCallId, {
              ok: true,
              speak: sayForCall(
                state,
                `Perfect. What sauce do you want? You can do up to ${state.currentItem.allowedSauces}.`,
                `Perfecto. ¿Qué salsa quieres? Puedes escoger hasta ${state.currentItem.allowedSauces}.`
              )
            })
          );
          break;
        }

        case "set_sauces": {
          if (!state.currentItem) {
            results.push(toolResult(name, toolCallId, { ok: false, speak: sayForCall(state, "Let’s lock in the size first.", "Primero confirmamos cuántas van.") }));
            break;
          }

          let sauces = Array.isArray(parameters.sauces) ? parameters.sauces : [];
          sauces = sauces
            .map((s) => {
              const norm = normalize(String(s));
              if (mentionsLemonPepper(norm)) return "__LEMON_PEPPER__";
              return findAlias(norm, SAUCE_ALIASES) || normalize(String(s));
            })
            .filter(Boolean)
            .slice(0, state.currentItem.allowedSauces);

          if (sauces.includes("__LEMON_PEPPER__")) {
            results.push(
              toolResult(name, toolCallId, {
                ok: true,
                speak: sayForCall(state, "We have that as laim pepper here. Is that okay?", "La tenemos como laim pepper. ¿Está bien así?")
              })
            );
            break;
          }

          if (!sauces.length) {
            results.push(toolResult(name, toolCallId, { ok: false, speak: sayForCall(state, "What sauce do you want?", "¿Qué salsa quieres?") }));
            break;
          }

          state.currentItem.sauces = sauces;
          state.flags.saucesConfirmed = true;

          results.push(
            toolResult(name, toolCallId, {
              ok: true,
              speak: sayForCall(
                state,
                `Perfect. What dip do you want? You get ${state.currentItem.dipsIncluded}.`,
                `Perfecto. ¿Qué dip quieres? Te incluye ${state.currentItem.dipsIncluded}.`
              )
            })
          );
          break;
        }

        case "add_extra_dips": {
          if (!state.currentItem) {
            results.push(toolResult(name, toolCallId, { ok: false, speak: sayForCall(state, "Let’s finish the item first.", "Primero terminamos el item.") }));
            break;
          }

          const extraDips = Array.isArray(parameters.extraDips)
            ? parameters.extraDips.map((d) => findAlias(normalize(String(d)), DIP_ALIASES) || normalize(String(d))).filter(Boolean)
            : [];

          state.currentItem.extraDips = extraDips;

          results.push(
            toolResult(name, toolCallId, {
              ok: true,
              speak: sayForCall(state, "Got it.", "Listo.")
            })
          );
          break;
        }

        case "add_side": {
          if (!state.currentItem) {
            results.push(toolResult(name, toolCallId, { ok: false, speak: sayForCall(state, "Let’s get the item started first.", "Primero vamos con el item.") }));
            break;
          }

          const normalizedSide = parameters.side
            ? findAlias(normalize(String(parameters.side)), SIDE_ALIASES) || normalize(String(parameters.side))
            : null;

          state.currentItem.side = normalizedSide;
          results.push(
            toolResult(name, toolCallId, {
              ok: true,
              speak: sayForCall(state, "Got it.", "Listo.")
            })
          );
          break;
        }

        case "set_customer_name": {
          state.customerName = parameters.customerName || null;

          if (!state.customerName) {
            results.push(toolResult(name, toolCallId, { ok: false, speak: sayForCall(state, "What name should I put on the order?", "¿A nombre de quién pongo la orden?") }));
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
                `Perfect. I have ${itemSummary}, under ${state.customerName}. Everything look right?`,
                `Perfecto. Tengo ${itemSummary}, a nombre de ${state.customerName}. ¿Todo está bien?`
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
      return reprompt(session, res, sayByLanguage(session, "Sorry, I missed the name. What name should I put on the order?", "Perdón, no alcancé el nombre. ¿A nombre de quién pongo la orden?"));
    }
    return reprompt(session, res, sayByLanguage(session, "Sorry, I missed that. What can I get started for you?", "Perdón, no alcancé bien. ¿Qué te preparo?"));
  }

  const interrupt = handleInterruptions(session, speech, res);
  if (interrupt) return interrupt;

  if (session.languageLocked) {
    if (session.languageMode === "es" && wantsEnglish(speech)) {
      session.languageMode = "en";
      return sayAndStore(session, res, "Of course. We can continue in English.");
    }
    if (session.languageMode === "en" && wantsSpanish(speech)) {
      session.languageMode = "es";
      return sayAndStore(session, res, "Claro. Seguimos en español.");
    }
  }

  detectRemovalsIntoOrder(session.order, speech);

  if (session.stage === "language") {
    session.stage = "order";
  }

  if (session.stage === "order") {
    if (wantsAnotherItem(speech) && session.order.itemType && !itemIsComplete(session.order)) {
      return sayAndStore(session, res, oneItemAtATimeLine(session));
    }

    if (/\b(what does flyin fries come with|what do flyin fries come with|que traen las flyin fries|que lleva las flyin fries|que son las flyin fries)\b/.test(speech)) {
      return sayAndStore(session, res, flyinFriesExplain(session));
    }

    detectInitialOrder(speech, session.order);
    maybeHandleDirectOrderUpdates(session, speech);

    if (session.order.pendingLemonPepperConfirmation) {
      session.stage = "lemonPepperConfirm";
      return sayAndStore(session, res, lemonPepperPrompt(session));
    }

    if (upsellOpportunity(session.order) && !session.order.comboUpsellAsked && !session.order.comboUpsellAccepted) {
      session.order.comboUpsellAsked = true;
      session.stage = "combo_upsell";
      return sayAndStore(session, res, comboUpsellLine(session, session.order));
    }

    const burgerLine = burgerIngredientLine(session, session.order);
    if (burgerLine && !session.order.burgerIngredientsConfirmed) {
      if (
        (session.order.itemType === "flyin burger combo" && !session.order.chickenStyle) ||
        (session.order.itemType === "chicken sandwich combo" && !session.order.chickenStyle)
      ) {
        session.stage = "chickenStyle";
        return sayAndStore(session, res, burgerLine);
      }

      session.order.burgerIngredientsConfirmed = true;
      return sayAndStore(session, res, burgerLine);
    }

    const missing = missingField(session.order);
    if (missing) {
      session.stage = missing;
      return sayAndStore(session, res, nextPromptForMissing(session, session.order));
    }

    finalizeCurrentItem(session);
    session.stage = "add_more";
    return sayAndStore(session, res, askNextItemLine(session));
  }

  if (["quantity", "size", "protein", "chickenStyle", "lemonPepperConfirm", "sauce", "dressing", "dip", "comboSide", "fishSide", "bakedPotatoDrizzle", "bakedPotatoToppingMode", "bakedPotatoDrink"].includes(session.stage)) {
    if (session.stage === "quantity") {
      const qty = extractNumber(speech);
      if (qty) session.order.quantity = qty;

      if (upsellOpportunity(session.order) && !session.order.comboUpsellAsked && !session.order.comboUpsellAccepted) {
        session.order.comboUpsellAsked = true;
        session.stage = "combo_upsell";
        return sayAndStore(session, res, comboUpsellLine(session, session.order));
      }
    }

    if (session.stage === "size") {
      const rack = extractRackSize(speech);
      if (rack) {
        session.order.size = rack;

        if (upsellOpportunity(session.order) && !session.order.comboUpsellAsked && !session.order.comboUpsellAccepted) {
          session.order.comboUpsellAsked = true;
          session.stage = "combo_upsell";
          return sayAndStore(session, res, comboUpsellLine(session, session.order));
        }
      }
    }

    if (session.stage === "protein") {
      const protein = extractProtein(speech);
      if (protein) session.order.protein = protein;
    }

    if (session.stage === "chickenStyle") {
      const style = extractChickenStyle(speech);
      if (style) {
        session.order.chickenStyle = style;

        if ((session.order.itemType === "flyin burger combo" || session.order.itemType === "chicken sandwich combo") && !session.order.burgerIngredientsConfirmed) {
          session.order.burgerIngredientsConfirmed = true;
          return sayAndStore(session, res, burgerIngredientLine(session, session.order));
        }
      }
    }

    if (session.stage === "lemonPepperConfirm") {
      if (isYes(speech)) {
        session.order.pendingLemonPepperConfirmation = false;
        session.order.sauces = ["lime pepper"];
      } else if (isNo(speech)) {
        session.order.pendingLemonPepperConfirmation = false;
        session.order.sauces = [];
        session.stage = "sauce";
        return sayAndStore(session, res, sayByLanguage(session, "What sauce would you like instead?", "¿Qué salsa quieres en su lugar?"));
      } else {
        return sayAndStore(session, res, lemonPepperPrompt(session));
      }
    }

    if (session.stage === "sauce") {
      if (mentionsLemonPepper(speech)) {
        session.order.pendingLemonPepperConfirmation = true;
        session.stage = "lemonPepperConfirm";
        return sayAndStore(session, res, lemonPepperPrompt(session));
      }

      const sauces = extractSauces(speech);
      if (/\b(no sauce|sin salsa)\b/.test(speech)) session.order.noSauce = true;
      if (extractOnSideRequested(speech)) session.order.sauceOnSide = true;
      if (sauces.length) session.order.sauces = sauces;
    }

    if (session.stage === "dressing") {
      const dressing = extractDressing(speech);
      if (dressing) session.order.dressing = dressing;
    }

    if (session.stage === "dip") {
      const dips = extractDips(speech);

      if (dips.length === 1 && session.order.includedDips.length === 0 && wantsAllSameDip(speech)) {
        fillRemainingIncludedDipsWith(session.order, dips[0]);
      } else if (dips.length > 0) {
        addSpecificIncludedDips(session.order, dips);
      }
    }

    if (session.stage === "comboSide" || session.stage === "fishSide") {
      const side = extractSide(speech);
      if (side) session.order.comboSide = side;
    }

    if (session.stage === "bakedPotatoDrizzle") {
      const drizzle = extractDips(speech);
      if (drizzle.length) session.order.bakedPotatoDrizzle = drizzle[0];
    }

    if (session.stage === "bakedPotatoToppingMode") {
      if (/\b(on top|with everything on top|arriba)\b/.test(speech)) session.order.bakedPotatoToppingMode = "on top";
      if (/\b(on the side|all on the side|todo por un lado|por un lado|aparte)\b/.test(speech)) session.order.bakedPotatoToppingMode = "on the side";
    }

    if (session.stage === "bakedPotatoDrink") {
      const drink = extractDrink(speech);
      if (drink) session.order.drink = drink;
    }

    maybeHandleDirectOrderUpdates(session, speech);

    const missing = missingField(session.order);
    if (missing) {
      session.stage = missing;
      return sayAndStore(session, res, nextPromptForMissing(session, session.order));
    }

    finalizeCurrentItem(session);
    session.stage = "add_more";
    return sayAndStore(session, res, askNextItemLine(session));
  }

  if (session.stage === "combo_upsell") {
    if (isYes(speech)) {
      session.order.comboUpsellAccepted = true;

      if (session.order.itemType === "wings") session.order.itemType = "8 wings combo";
      else if (session.order.itemType === "boneless") session.order.itemType = "8 boneless combo";
      else if (session.order.itemType === "ribs" && session.order.size === "half rack") session.order.itemType = "half rack combo";

      const missing = missingField(session.order);
      if (missing) {
        session.stage = missing;
        return sayAndStore(session, res, nextPromptForMissing(session, session.order));
      }

      finalizeCurrentItem(session);
      session.stage = "add_more";
      return sayAndStore(session, res, askNextItemLine(session));
    }

    if (isNo(speech)) {
      const missing = missingField(session.order);
      if (missing) {
        session.stage = missing;
        return sayAndStore(session, res, nextPromptForMissing(session, session.order));
      }

      finalizeCurrentItem(session);
      session.stage = "add_more";
      return sayAndStore(session, res, askNextItemLine(session));
    }

    return sayAndStore(session, res, comboUpsellLine(session, session.order));
  }

  if (session.stage === "add_more") {
    if (isNo(speech)) {
      session.stage = "final_upsell";
      return sayAndStore(session, res, finalUpsellLine(session));
    }

    if (isYes(speech) || extractItem(speech) || extractWingStyle(speech) || extractRackSize(speech)) {
      if (!itemIsComplete(session.order) && session.order.itemType) {
        session.stage = missingField(session.order);
        return sayAndStore(session, res, nextPromptForMissing(session, session.order));
      }

      session.stage = "order";
      session.order = blankOrder();
      detectInitialOrder(speech, session.order);
      maybeHandleDirectOrderUpdates(session, speech);

      if (session.order.pendingLemonPepperConfirmation) {
        session.stage = "lemonPepperConfirm";
        return sayAndStore(session, res, lemonPepperPrompt(session));
      }

      if (upsellOpportunity(session.order) && !session.order.comboUpsellAsked && !session.order.comboUpsellAccepted) {
        session.order.comboUpsellAsked = true;
        session.stage = "combo_upsell";
        return sayAndStore(session, res, comboUpsellLine(session, session.order));
      }

      const burgerLine = burgerIngredientLine(session, session.order);
      if (burgerLine && !session.order.burgerIngredientsConfirmed) {
        if (
          (session.order.itemType === "flyin burger combo" && !session.order.chickenStyle) ||
          (session.order.itemType === "chicken sandwich combo" && !session.order.chickenStyle)
        ) {
          session.stage = "chickenStyle";
          return sayAndStore(session, res, burgerLine);
        }

        session.order.burgerIngredientsConfirmed = true;
        return sayAndStore(session, res, burgerLine);
      }

      const missing = missingField(session.order);
      if (missing) {
        session.stage = missing;
        return sayAndStore(session, res, nextPromptForMissing(session, session.order));
      }

      finalizeCurrentItem(session);
      session.stage = "add_more";
      return sayAndStore(session, res, askNextItemLine(session));
    }

    return sayAndStore(session, res, askNextItemLine(session));
  }

  if (session.stage === "final_upsell") {
    if (isNo(speech)) {
      session.stage = "name";
      return sayAndStore(session, res, sayByLanguage(session, "What name should I put on the order?", "¿A nombre de quién pongo la orden?"));
    }

    if (isYes(speech)) {
      return sayAndStore(
        session,
        res,
        sayByLanguage(
          session,
          "What would you like to add? You can do mac bites, corn ribs, mozzarella sticks, or extra ranch.",
          "¿Qué te agrego? Puede ser mac bites, corn ribs, mozzarella sticks o ranch extra."
        )
      );
    }

    if (wantsSideUpsell(speech)) {
      const side = extractSide(speech);
      const dips = extractDips(speech);

      if (side) {
        session.completedItems.push({
          itemType: side,
          quantity: 1,
          size: null,
          sauces: [],
          sauceOnSide: false,
          noSauce: false,
          includedDips: [],
          extraDips: [],
          dressing: null,
          bakedPotatoDrizzle: null,
          bakedPotatoToppingMode: null,
          comboSide: null,
          drink: null,
          protein: null,
          chickenStyle: null,
          modifiersToRemove: [],
          notes: [],
          comboUpsellAsked: false,
          comboUpsellAccepted: false,
          pendingLemonPepperConfirmation: false,
          burgerIngredientsConfirmed: false
        });
      }

      if (dips.length && session.completedItems.length) {
        session.completedItems[session.completedItems.length - 1].extraDips = [
          ...(session.completedItems[session.completedItems.length - 1].extraDips || []),
          ...dips
        ];
      }

      session.stage = "name";
      return sayAndStore(session, res, sayByLanguage(session, "Perfect. What name should I put on the order?", "Perfecto. ¿A nombre de quién pongo la orden?"));
    }

    session.stage = "name";
    return sayAndStore(session, res, sayByLanguage(session, "What name should I put on the order?", "¿A nombre de quién pongo la orden?"));
  }

  if (session.stage === "name") {
    const name = extractName(speech);
    if (!name) {
      return sayAndStore(session, res, sayByLanguage(session, "Sorry, what name should I put on the order?", "Perdón, ¿a nombre de quién pongo la orden?"));
    }

    session.orderName = name;
    session.stage = "confirm";

    const summary = sayByLanguage(
      session,
      `Perfect. I have ${summarizeCompletedItems(session)}, under ${session.orderName}. Everything look right?`,
      `Perfecto. Tengo ${summarizeCompletedItems(session)}, a nombre de ${session.orderName}. ¿Todo está bien?`
    );
    return sayAndStore(session, res, summary);
  }

  if (session.stage === "confirm") {
    if (isYes(speech)) {
      return sayAndStore(session, res, sayByLanguage(session, "Perfect, we’ll have that ready for pickup. See you soon.", "Perfecto, tendremos tu orden lista para recoger. Gracias."), true);
    }

    if (isNo(speech) || wantsChangeSauce(speech) || extractItem(speech) || extractWingStyle(speech) || extractRemovals(speech).length) {
      session.stage = "order";
      session.order = blankOrder();
      return sayAndStore(session, res, sayByLanguage(session, "No problem. Tell me what you want to change.", "Claro. Dime qué quieres cambiar."));
    }

    return sayAndStore(session, res, sayByLanguage(session, "Everything look right?", "¿Todo está bien?"));
  }

  session.stage = "order";
  return sayAndStore(session, res, sayByLanguage(session, "What can I get started for you?", "¿Qué te preparo?"));
});

app.listen(PORT, () => {
  console.log(`Jeffrey backend listening on port ${PORT}`);
});
