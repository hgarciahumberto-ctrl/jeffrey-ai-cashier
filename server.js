import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

const calls = new Map();

/* ----------------------------- helpers ----------------------------- */

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function detectLanguage(text = "") {
  const input = normalize(text);

  const spanishSignals = [
    "hola",
    "quiero",
    "alitas",
    "papas",
    "para llevar",
    "gracias",
    "nombre",
    "espanol",
    "en espanol",
    "hablas espanol",
    "medio rack",
    "papas de camote"
  ];

  const englishSignals = [
    "hello",
    "hi",
    "i want",
    "wings",
    "fries",
    "thank you",
    "name",
    "english",
    "in english",
    "half rack",
    "sweet potato fries"
  ];

  let es = 0;
  let en = 0;

  for (const s of spanishSignals) {
    if (input.includes(s)) es += 1;
  }
  for (const s of englishSignals) {
    if (input.includes(s)) en += 1;
  }

  if (es > en) return "es";
  if (en > es) return "en";
  return "unknown";
}

function t(state, en, es) {
  return state.language === "es" ? es : en;
}

function displaySauce(sauce, lang) {
  if (sauce === "lime pepper") {
    return lang === "es" ? "laim peper" : "laim pepper";
  }
  return sauce;
}

function displaySide(side, lang) {
  if (lang === "es") {
    const map = {
      "regular fries": "papas",
      "sweet potato fries": "papas de camote",
      "potato salad": "ensalada de papa",
      "buffalo ranch fries": "buffalo ranch fries",
      "tostones": "tostones",
      "yuca fries": "papas de yuca"
    };
    return map[side] || side;
  }
  return side;
}

function displayProtein(protein, lang) {
  if (lang === "es") {
    const map = {
      "chicken": "pollo",
      "steak": "carne asada",
      "pork belly": "pork belly",
      "no protein": "sin proteína"
    };
    return map[protein] || protein;
  }
  return protein;
}

function displayChickenStyle(style, lang) {
  if (lang === "es") {
    return style === "grilled" ? "a la plancha" : "frito";
  }
  return style;
}

function countList(list) {
  const counts = {};
  for (const item of list) counts[item] = (counts[item] || 0) + 1;
  return Object.entries(counts)
    .map(([name, qty]) => `${qty} ${name}`)
    .join(", ");
}

/* ----------------------------- aliases ----------------------------- */

const SAUCE_ALIASES = [
  { keys: ["al pastor", "pastor"], value: "al pastor" },
  { keys: ["barbeque", "barbecue", "bbq", "barbacoa"], value: "barbeque" },
  { keys: ["barbeque chiltepin", "barbecue chiltepin", "bbq chiltepin", "barbacoa chiltepin"], value: "barbeque chiltepin" },
  { keys: ["chorizo"], value: "chorizo" },
  { keys: ["chocolate chiltepin"], value: "chocolate chiltepin" },
  { keys: ["cinnamon roll", "canela"], value: "cinnamon roll" },
  { keys: ["citrus chipotle", "chipotle citrico", "chipotle cítrico"], value: "citrus chipotle" },
  { keys: ["garlic parmesan", "garlic parm", "parm", "parmesan", "ajo parmesano"], value: "garlic parmesan" },
  { keys: ["green chile", "green chili", "chile verde"], value: "green chile" },
  { keys: ["hot", "buffalo hot", "picante", "picosa"], value: "hot" },
  { keys: ["lime pepper", "laim pepper", "laim peper", "limon pepper", "limon pimienta", "limón pimienta"], value: "lime pepper" },
  { keys: ["mild", "buffalo mild", "suave"], value: "mild" },
  { keys: ["mango habanero"], value: "mango habanero" },
  { keys: ["pizza"], value: "pizza" },
  { keys: ["teriyaki"], value: "teriyaki" }
];

const DIP_ALIASES = [
  { keys: ["ranch"], value: "ranch" },
  { keys: ["blue cheese", "bleu cheese", "queso azul"], value: "blue cheese" },
  { keys: ["chipotle ranch", "ranch chipotle"], value: "chipotle ranch" },
  { keys: ["jalapeno ranch", "jalapeño ranch", "ranch jalapeno", "ranch jalapeño"], value: "jalapeño ranch" }
];

const SIDE_ALIASES = [
  { keys: ["fries", "french fries", "regular fries", "papas", "papas fritas", "frais"], value: "regular fries" },
  { keys: ["sweet potato fries", "papas de camote", "camote fries"], value: "sweet potato fries" },
  { keys: ["potato salad", "ensalada de papa"], value: "potato salad" },
  { keys: ["buffalo ranch fries"], value: "buffalo ranch fries" },
  { keys: ["mac bites", "mac bite", "mac and cheese bites"], value: "mac bites" },
  { keys: ["corn ribs", "costillas de elote"], value: "corn ribs" },
  { keys: ["mozzarella sticks", "mozzarella"], value: "mozzarella sticks" },
  { keys: ["onion rings", "aros de cebolla"], value: "onion rings" },
  { keys: ["flyin corn", "flyin’ corn", "flying corn", "elote"], value: "flyin corn" },
  { keys: ["tostones"], value: "tostones" },
  { keys: ["yuca fries", "yucca fries", "yuca"], value: "yuca fries" }
];

const DRESSING_ALIASES = [...DIP_ALIASES];

const PROTEIN_ALIASES = [
  { keys: ["chicken", "pollo"], value: "chicken" },
  { keys: ["steak", "carne asada", "steik"], value: "steak" },
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
  { keys: ["half rack", "1/2 rack", "medio rack", "media costilla"], value: "half rack" },
  { keys: ["full rack", "rack completo", "costillar completo"], value: "full rack" },

  { keys: ["8 wings combo", "combo de 8 alitas"], value: "8 wings combo" },
  { keys: ["8 boneless combo", "combo de 8 boneless"], value: "8 boneless combo" },
  { keys: ["half rack combo", "1/2 rack combo", "combo de medio rack", "combo de media costilla"], value: "half rack combo" },
  { keys: ["half rack and 4 bone in combo", "1/2 rack and 4 bone in combo", "media costilla y 4 alitas"], value: "half rack and 4 bone in combo" },
  { keys: ["fish combo", "fish and fries", "4 pieces fish and fries"], value: "fish combo" },

  { keys: ["classic burger combo", "classic burger"], value: "classic burger combo" },
  { keys: ["chicken sandwich combo", "chicken sandwich"], value: "chicken sandwich combo" },
  { keys: ["flyin burger combo", "flyin burger", "flyin’ burger"], value: "flyin burger combo" },
  { keys: ["buffalo burger"], value: "buffalo burger combo" },

  { keys: ["flyin baked potato combo", "baked potato combo", "loaded baked potato combo"], value: "baked potato combo" },

  { keys: ["flyin fries", "flyin’ fries", "flying fries", "flain fries", "flain frais", "junior flyin fries"], value: "flyin fries" },
  { keys: ["pork belly fries"], value: "pork belly fries" },
  { keys: ["chicken parmesan fries", "chicken parm fries"], value: "chicken parmesan fries" },
  { keys: ["buffalo ranch fries"], value: "buffalo ranch fries" },

  { keys: ["house salad"], value: "house salad" },
  { keys: ["flyin salad", "flyin’ salad"], value: "flyin salad" },

  { keys: ["pork belly"], value: "pork belly" },
  { keys: ["mac bites", "mac bite"], value: "mac bites" },
  { keys: ["onion rings"], value: "onion rings" },
  { keys: ["flyin corn"], value: "flyin corn" },
  { keys: ["corn ribs"], value: "corn ribs" },
  { keys: ["mozzarella sticks"], value: "mozzarella sticks" },
  { keys: ["sampler platter", "sampler"], value: "sampler platter" },

  { keys: ["kids boneless", "4 boneless"], value: "kids boneless" },
  { keys: ["kids wings", "4 classic wings", "4 alitas"], value: "kids wings" },
  { keys: ["kids cheeseburger"], value: "kids cheeseburger" }
];

const MOD_ALIASES = [
  { keys: ["no onion", "sin cebolla"], value: "no onion" },
  { keys: ["no tomato", "sin tomate"], value: "no tomato" },
  { keys: ["no cheese", "sin queso"], value: "no cheese" },
  { keys: ["no mayo", "sin mayonesa"], value: "no mayo" },
  { keys: ["no lettuce", "sin lechuga"], value: "no lettuce" },
  { keys: ["no pickles", "sin pickles", "sin pepinillos"], value: "no pickles" }
];

function findAlias(text, aliasList) {
  const norm = normalize(text);
  for (const entry of aliasList) {
    for (const key of entry.keys) {
      const nk = normalize(key);
      if (norm === nk || norm.includes(nk)) return entry.value;
    }
  }
  return null;
}

function mapList(values, aliasList) {
  return unique((values || []).map((v) => findAlias(v, aliasList)).filter(Boolean));
}

function parseItem(value) {
  return findAlias(value, ITEM_ALIASES);
}

function parseSide(value) {
  return findAlias(value, SIDE_ALIASES);
}

function parseProtein(value) {
  return findAlias(value, PROTEIN_ALIASES);
}

function parseChickenStyle(value) {
  return findAlias(value, CHICKEN_STYLE_ALIASES);
}

function parseDressing(value) {
  return findAlias(value, DRESSING_ALIASES);
}

function parseDip(value) {
  return findAlias(value, DIP_ALIASES);
}

function parseSauce(value) {
  const norm = normalize(value);
  if (
    norm.includes("lemon pepper") ||
    norm.includes("lemon") ||
    norm.includes("limon pepper") ||
    norm.includes("limón pepper")
  ) {
    return { correctionRequired: true, correctedValue: "lime pepper" };
  }

  const mapped = findAlias(value, SAUCE_ALIASES);
  return { correctionRequired: false, correctedValue: mapped || null };
}

function parseMods(values) {
  return unique((values || []).map((v) => findAlias(v, MOD_ALIASES)).filter(Boolean));
}

/* ----------------------------- state ----------------------------- */

function blankItem() {
  return {
    itemType: null,
    quantity: null,
    size: null,
    sauces: [],
    sauceOnSide: false,
    noSauce: false,
    dips: [],
    extraDips: [],
    side: null,
    dressing: null,
    protein: null,
    chickenStyle: null,
    drizzle: null,
    toppingMode: null, // on_top | on_the_side
    modifications: [],
    notes: [],
    pendingComboUpsell: false,
    pendingSauceCorrection: null
  };
}

function blankCallState() {
  return {
    language: "unknown",
    languageLocked: false,
    customerName: null,
    items: [],
    currentItem: blankItem(),
    orderComplete: false
  };
}

function getCallState(callId) {
  if (!calls.has(callId)) {
    calls.set(callId, blankCallState());
  }
  return calls.get(callId);
}

function maybeLockLanguage(state, latestText = "", explicitLanguage = null) {
  if (explicitLanguage === "en" || explicitLanguage === "es") {
    state.language = explicitLanguage;
    state.languageLocked = true;
    return;
  }

  if (state.languageLocked) return;

  const detected = detectLanguage(latestText);
  if (detected !== "unknown") {
    state.language = detected;
  }
}

/* ----------------------------- menu logic ----------------------------- */

function isWingBase(item) {
  return item.itemType === "wings" || item.itemType === "boneless";
}

function isBurgerCombo(item) {
  return ["classic burger combo", "chicken sandwich combo", "flyin burger combo", "buffalo burger combo"].includes(item.itemType);
}

function comboSideAllowed(item, side) {
  const standard = ["regular fries", "sweet potato fries", "potato salad"];

  if (["8 wings combo", "8 boneless combo", "half rack combo", "half rack and 4 bone in combo", "classic burger combo", "chicken sandwich combo", "flyin burger combo", "buffalo burger combo"].includes(item.itemType)) {
    return standard.includes(side);
  }

  if (item.itemType === "fish combo") {
    return [...standard, "tostones", "yuca fries"].includes(side);
  }

  return true;
}

function sauceSlotsAllowed(item) {
  if (item.itemType === "wings" || item.itemType === "boneless") {
    if (!item.quantity) return 0;
    if (item.quantity === 9) return 1;
    if (item.quantity === 6) return 1;
    if (item.quantity === 12) return 2;
    if (item.quantity === 18) return 3;
    if (item.quantity === 24) return 4;
    if (item.quantity === 48) return 8;
  }

  if (item.itemType === "8 wings combo") return 1;
  if (item.itemType === "8 boneless combo") return 1;
  if (item.itemType === "half rack combo") return 1;
  if (item.itemType === "half rack and 4 bone in combo") return 2;
  if (item.itemType === "pork belly") return 1;
  if (item.itemType === "corn ribs") return 1;
  if (item.itemType === "kids boneless") return 1;
  if (item.itemType === "kids wings") return 1;
  if (item.itemType === "baked potato combo") return 1;

  if (item.itemType === "ribs") {
    if (item.size === "half rack") return 1;
    if (item.size === "full rack") return 2;
  }

  return 0;
}

function dipSlotsAllowed(item) {
  if (item.itemType === "wings" || item.itemType === "boneless") {
    if (!item.quantity) return 0;
    if (item.quantity === 9) return 1;
    if (item.quantity === 6) return 1;
    if (item.quantity === 12) return 2;
    if (item.quantity === 18) return 3;
    if (item.quantity === 24) return 4;
    if (item.quantity === 48) return 8;
  }

  if (item.itemType === "8 wings combo") return 1;
  if (item.itemType === "8 boneless combo") return 1;
  if (item.itemType === "half rack and 4 bone in combo") return 1;
  if (item.itemType === "kids boneless") return 1;
  if (item.itemType === "kids wings") return 1;
  if (item.itemType === "mac bites") return 1;

  return 0;
}

function validWingQuantity(qty) {
  return [6, 9, 12, 18, 24, 48].includes(Number(qty));
}

function comboUpsellAvailable(item) {
  return (
    (item.itemType === "wings" && [6, 9].includes(Number(item.quantity))) ||
    (item.itemType === "boneless" && [6, 9].includes(Number(item.quantity))) ||
    (item.itemType === "ribs" && item.size === "half rack")
  );
}

function nextQuestion(state, item) {
  if (item.pendingSauceCorrection) {
    return t(
      state,
      "We have that as laim pepper here. Is that okay?",
      "La tenemos como laim peper. ¿Está bien así?"
    );
  }

  if (item.pendingComboUpsell) {
    if (item.itemType === "ribs" && item.size === "half rack") {
      return t(
        state,
        "You can make that a half rack combo with a side and drink cup. Want to do that?",
        "Lo puedes hacer combo de medio rack con acompañante y vaso para refill. ¿Lo quieres así?"
      );
    }

    return t(
      state,
      "You can make that an 8-piece combo with a side and drink cup. Want to do that?",
      "Lo puedes hacer combo de 8 piezas con acompañante y vaso para refill. ¿Lo quieres así?"
    );
  }

  if (!item.itemType) {
    return t(state, "What can I get started for you?", "¿Qué te preparo?");
  }

  if (isWingBase(item) && !item.quantity) {
    return t(state, "How many would you like?", "¿Cuántas quieres?");
  }

  if (item.itemType === "ribs" && !item.size) {
    return t(state, "Half rack or full rack?", "¿Medio rack o rack completo?");
  }

  if (item.itemType === "flyin burger combo" && !item.chickenStyle) {
    return t(state, "Would you like the chicken grilled or fried?", "¿Quieres el pollo a la plancha o frito?");
  }

  if (item.itemType === "chicken sandwich combo" && !item.chickenStyle) {
    return t(state, "Would you like the chicken grilled or fried?", "¿Quieres el pollo a la plancha o frito?");
  }

  if (item.itemType === "flyin salad" && !item.chickenStyle) {
    return t(state, "Would you like the chicken grilled or fried?", "¿Quieres el pollo a la plancha o frito?");
  }

  if (item.itemType === "baked potato combo" && !item.protein) {
    return t(
      state,
      "For the Flyin’ baked potato combo: chicken, steak, pork belly, or no protein?",
      "Para el combo de Flyin’ baked potato: ¿pollo, carne asada, pork belly o sin proteína?"
    );
  }

  if (item.itemType === "baked potato combo" && item.protein === "chicken" && !item.chickenStyle) {
    return t(state, "Would you like the chicken grilled or fried?", "¿Quieres el pollo a la plancha o frito?");
  }

  if (sauceSlotsAllowed(item) > 0 && !item.noSauce && item.sauces.length === 0) {
    return t(state, "What sauce would you like?", "¿Qué salsa quieres?");
  }

  if (dipSlotsAllowed(item) > 0 && item.dips.length < dipSlotsAllowed(item)) {
    const remaining = dipSlotsAllowed(item) - item.dips.length;
    if (item.dips.length === 0) {
      return t(
        state,
        `What dip would you like? You get ${dipSlotsAllowed(item)}.`,
        `¿Qué dip quieres? Te incluye ${dipSlotsAllowed(item)}.`
      );
    }

    return t(
      state,
      `I still need ${remaining} more dip${remaining > 1 ? "s" : ""}.`,
      `Todavía me faltan ${remaining} dip${remaining > 1 ? "s" : ""}.`
    );
  }

  if ((item.itemType === "house salad" || item.itemType === "flyin salad") && !item.dressing) {
    return t(
      state,
      "What dressing would you like: ranch, blue cheese, chipotle ranch, or jalapeño ranch?",
      "¿Qué aderezo quieres: ranch, blue cheese, chipotle ranch o jalapeño ranch?"
    );
  }

  if (
    ["8 wings combo", "8 boneless combo", "half rack combo", "half rack and 4 bone in combo", "fish combo", "classic burger combo", "chicken sandwich combo", "flyin burger combo", "buffalo burger combo"].includes(item.itemType) &&
    !item.side
  ) {
    return t(
      state,
      "What side would you like: fries, sweet potato fries, or potato salad?",
      "¿Qué acompañante quieres: papas, papas de camote o ensalada de papa?"
    );
  }

  if (item.itemType === "baked potato combo" && !item.drizzle) {
    return t(
      state,
      "What drizzle would you like on top: ranch, blue cheese, chipotle ranch, or jalapeño ranch?",
      "¿Qué drizzle quieres arriba: ranch, blue cheese, chipotle ranch o jalapeño ranch?"
    );
  }

  if (item.itemType === "baked potato combo" && !item.toppingMode) {
    return t(
      state,
      "Would you like everything on top or all on the side?",
      "¿Lo quieres arriba o todo por un lado?"
    );
  }

  if (item.itemType === "baked potato combo" && !item.drink) {
    return t(
      state,
      "Soft drink cup or bottled water?",
      "¿Vaso para refill o agua embotellada?"
    );
  }

  return t(state, "Perfect. What would you like to add next?", "Perfecto. ¿Qué más te agrego?");
}

function itemComplete(item) {
  if (!item.itemType) return false;
  return nextQuestion({ language: "en" }, item) === "Perfect. What would you like to add next?";
}

function itemDisplay(item, lang = "en") {
  const mapEn = {
    "wings": "bone-in wings",
    "boneless": "boneless",
    "ribs": item.size === "full rack" ? "full rack korean style ribs" : "half rack korean style ribs",
    "8 wings combo": "8 wings combo",
    "8 boneless combo": "8 boneless combo",
    "half rack combo": "half rack combo",
    "half rack and 4 bone in combo": "half rack and 4 bone in combo",
    "fish combo": "fish combo",
    "classic burger combo": "classic burger combo",
    "chicken sandwich combo": "chicken sandwich combo",
    "flyin burger combo": "flyin burger combo",
    "buffalo burger combo": "buffalo burger combo",
    "baked potato combo": "Flyin’ baked potato combo",
    "flyin fries": "Flain Fries",
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
    "kids cheeseburger": "kids cheeseburger"
  };

  const mapEs = {
    "wings": "alitas con hueso",
    "boneless": "boneless",
    "ribs": item.size === "full rack" ? "rack completo de korean style ribs" : "medio rack de korean style ribs",
    "8 wings combo": "combo de 8 alitas",
    "8 boneless combo": "combo de 8 boneless",
    "half rack combo": "combo de medio rack",
    "half rack and 4 bone in combo": "combo de medio rack y 4 alitas",
    "fish combo": "combo de pescado",
    "classic burger combo": "classic burger combo",
    "chicken sandwich combo": "chicken sandwich combo",
    "flyin burger combo": "flyin burger combo",
    "buffalo burger combo": "buffalo burger combo",
    "baked potato combo": "combo de Flyin’ baked potato",
    "flyin fries": "Flain Fries",
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
    "kids cheeseburger": "kids cheeseburger"
  };

  return lang === "es" ? (mapEs[item.itemType] || item.itemType) : (mapEn[item.itemType] || item.itemType);
}

function summaryForItem(item, lang = "en") {
  const parts = [];

  if (isWingBase(item) && item.quantity) {
    parts.push(`${item.quantity} ${itemDisplay(item, lang)}`);
  } else {
    parts.push(itemDisplay(item, lang));
  }

  if (!isBurgerCombo(item)) {
    if (item.noSauce) {
      parts.push(lang === "es" ? "sin salsa" : "no sauce");
    } else if (item.sauces.length) {
      parts.push(item.sauces.map((s) => displaySauce(s, lang)).join(lang === "es" ? " y " : " and "));
      if (item.sauceOnSide) {
        parts.push(lang === "es" ? "aparte" : "on the side");
      }
    }
  }

  if (item.dips.length && !isBurgerCombo(item)) {
    parts.push((lang === "es" ? "dips " : "dips ") + countList(item.dips));
  }

  if (item.extraDips.length) {
    parts.push((lang === "es" ? "extra " : "extra ") + countList(item.extraDips));
  }

  if (item.side) {
    parts.push(displaySide(item.side, lang));
  }

  if (item.protein) {
    parts.push(displayProtein(item.protein, lang));
  }

  if (item.chickenStyle) {
    parts.push(lang === "es" ? `pollo ${displayChickenStyle(item.chickenStyle, lang)}` : `${displayChickenStyle(item.chickenStyle, lang)} chicken`);
  }

  if (item.dressing) {
    parts.push(lang === "es" ? `aderezo ${item.dressing}` : `dressing ${item.dressing}`);
  }

  if (item.drizzle) {
    parts.push(lang === "es" ? `drizzle ${item.drizzle}` : `drizzle ${item.drizzle}`);
  }

  if (item.toppingMode) {
    parts.push(lang === "es" ? (item.toppingMode === "on_the_side" ? "todo por un lado" : "todo arriba") : (item.toppingMode === "on_the_side" ? "all on the side" : "everything on top"));
  }

  if (item.modifications.length) {
    if (lang === "es") {
      parts.push(item.modifications.map((m) => m.replace(/^no /, "sin ")).join(", "));
    } else {
      parts.push(item.modifications.join(", "));
    }
  }

  return parts.join(", ");
}

function fullOrderSummary(state) {
  const lang = state.language === "es" ? "es" : "en";
  return state.items.map((item) => summaryForItem(item, lang)).join("; ");
}

/* ----------------------------- response helpers ----------------------------- */

function toolResult(name, toolCallId, result) {
  return {
    name,
    toolCallId,
    result: JSON.stringify(result)
  };
}

function buildPayload(state, speak, ok = true, extra = {}) {
  return {
    ok,
    language: state.language,
    customerName: state.customerName,
    currentItem: state.currentItem,
    orderSummary: fullOrderSummary(state),
    speak,
    ...extra
  };
}

/* ----------------------------- tool endpoint ----------------------------- */

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
  res.send("Jeffrey Vapi backend is running.");
});

app.use((req, res, next) => {
  if (req.path === "/vapi/tools") {
    const auth = req.headers.authorization;
    if (!VAPI_WEBHOOK_SECRET) {
      return res.status(500).json({ error: "Missing VAPI_WEBHOOK_SECRET" });
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
    const state = getCallState(callId);
    const latestText = getLatestCustomerText(message);

    maybeLockLanguage(state, latestText);

    const results = [];

    for (const toolCall of message.toolCallList || []) {
      const { id: toolCallId, name, parameters = {} } = toolCall;

      if (parameters.language === "en" || parameters.language === "es") {
        maybeLockLanguage(state, latestText, parameters.language);
      }

      switch (name) {
        case "start_item": {
          state.currentItem = blankItem();

          const rawItem = parameters.itemType || parameters.item || "";
          let itemType = parseItem(rawItem);

          if (!itemType) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "What item would you like?", "¿Qué item quieres?"),
              false
            )));
            break;
          }

          if (itemType === "half rack" || itemType === "full rack") {
            state.currentItem.itemType = "ribs";
            state.currentItem.size = itemType;
          } else {
            state.currentItem.itemType = itemType;
          }

          if (parameters.quantity != null) {
            state.currentItem.quantity = Number(parameters.quantity);
          }

          if (parameters.size) {
            const sizeNorm = normalize(parameters.size);
            if (sizeNorm.includes("half") || sizeNorm.includes("medio") || sizeNorm.includes("media")) {
              state.currentItem.size = "half rack";
            } else if (sizeNorm.includes("full") || sizeNorm.includes("completo")) {
              state.currentItem.size = "full rack";
            }
          }

          if (parameters.noSauce) {
            state.currentItem.noSauce = true;
          }

          if (parameters.sauceOnSide) {
            state.currentItem.sauceOnSide = true;
          }

          if (parameters.protein) {
            state.currentItem.protein = parseProtein(parameters.protein);
          }

          if (parameters.chickenStyle) {
            state.currentItem.chickenStyle = parseChickenStyle(parameters.chickenStyle);
          }

          if (parameters.dressing) {
            state.currentItem.dressing = parseDressing(parameters.dressing);
          }

          if (parameters.side) {
            const side = parseSide(parameters.side);
            if (side && comboSideAllowed(state.currentItem, side)) {
              state.currentItem.side = side;
            }
          }

          if (Array.isArray(parameters.modifications)) {
            state.currentItem.modifications = parseMods(parameters.modifications);
          }

          if (parameters.itemType && normalize(parameters.itemType).includes("pork belly fries")) {
            state.currentItem.itemType = "pork belly fries";
          }

          if (state.currentItem.itemType === "buffalo burger combo") {
            state.currentItem.notes.push("Use classic burger combo");
            state.currentItem.notes.push("Remove mayo");
            state.currentItem.notes.push("Sub ranch for mayo");
            state.currentItem.notes.push("Add mild buffalo sauce on the side with extra charge");
          }

          if (isWingBase(state.currentItem) && state.currentItem.quantity && !validWingQuantity(state.currentItem.quantity)) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "We have 6, 9, 12, 18, 24, or 48.", "Tenemos 6, 9, 12, 18, 24 o 48."),
              false
            )));
            break;
          }

          if (comboUpsellAvailable(state.currentItem)) {
            state.currentItem.pendingComboUpsell = true;
          }

          const burgerIngredientPrompt =
            state.currentItem.itemType === "classic burger combo"
              ? t(state, "That comes with cheese, mayo, lettuce, onion, tomato, and pickles. Any changes?", "Trae queso, mayo, lechuga, cebolla, tomate y pickles. ¿Algún cambio?")
              : state.currentItem.itemType === "chicken sandwich combo" && state.currentItem.chickenStyle
              ? t(state, "That comes with cheese, mayo, lettuce, onion, tomato, and pickles. Any changes?", "Trae queso, mayo, lechuga, cebolla, tomate y pickles. ¿Algún cambio?")
              : state.currentItem.itemType === "flyin burger combo" && state.currentItem.chickenStyle
              ? t(state, "That comes with cheese, mayo, chipotle ranch, lettuce, onion, tomato, and pickles. Any changes?", "Trae queso, mayo, chipotle ranch, lechuga, cebolla, tomate y pickles. ¿Algún cambio?")
              : state.currentItem.itemType === "buffalo burger combo"
              ? t(state, "Perfect. That comes with cheese, buffalo sauce, ranch, lettuce, onion, tomato, and pickles. Any changes?", "Perfecto. Trae queso, buffalo sauce, ranch, lechuga, cebolla, tomate y pickles. ¿Algún cambio?")
              : null;

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            burgerIngredientPrompt || nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "respond_combo_upsell": {
          if (!state.currentItem.pendingComboUpsell) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              nextQuestion(state, state.currentItem),
              false
            )));
            break;
          }

          const accept = Boolean(parameters.accept);

          if (accept) {
            if (state.currentItem.itemType === "wings") {
              state.currentItem.itemType = "8 wings combo";
            } else if (state.currentItem.itemType === "boneless") {
              state.currentItem.itemType = "8 boneless combo";
            } else if (state.currentItem.itemType === "ribs" && state.currentItem.size === "half rack") {
              state.currentItem.itemType = "half rack combo";
            }
          }

          state.currentItem.pendingComboUpsell = false;

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_quantity": {
          if (!isWingBase(state.currentItem)) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "This item does not use wing quantity.", "Este item no usa cantidad de alitas."),
              false
            )));
            break;
          }

          const qty = Number(parameters.quantity);
          if (!validWingQuantity(qty)) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "We have 6, 9, 12, 18, 24, or 48.", "Tenemos 6, 9, 12, 18, 24 o 48."),
              false
            )));
            break;
          }

          state.currentItem.quantity = qty;

          if (comboUpsellAvailable(state.currentItem)) {
            state.currentItem.pendingComboUpsell = true;
          }

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_size": {
          if (state.currentItem.itemType !== "ribs") {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "This item does not need rack size.", "Este item no necesita tamaño de rack."),
              false
            )));
            break;
          }

          const sizeNorm = normalize(parameters.size || "");
          if (sizeNorm.includes("half") || sizeNorm.includes("medio") || sizeNorm.includes("media")) {
            state.currentItem.size = "half rack";
          } else if (sizeNorm.includes("full") || sizeNorm.includes("completo")) {
            state.currentItem.size = "full rack";
          } else {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "Half rack or full rack?", "¿Medio rack o rack completo?"),
              false
            )));
            break;
          }

          if (comboUpsellAvailable(state.currentItem)) {
            state.currentItem.pendingComboUpsell = true;
          }

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_sauces": {
          if (sauceSlotsAllowed(state.currentItem) === 0 && !state.currentItem.noSauce) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "This item does not need sauce selection.", "Este item no necesita selección de salsa."),
              false
            )));
            break;
          }

          if (parameters.noSauce) {
            state.currentItem.noSauce = true;
            state.currentItem.sauces = [];
            state.currentItem.pendingSauceCorrection = null;
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              nextQuestion(state, state.currentItem)
            )));
            break;
          }

          const rawSauces = Array.isArray(parameters.sauces) ? parameters.sauces : [];
          const finalSauces = [];
          let correction = null;

          for (const raw of rawSauces) {
            const parsed = parseSauce(raw);
            if (parsed.correctionRequired) {
              correction = parsed.correctedValue;
              break;
            }
            if (parsed.correctedValue) finalSauces.push(parsed.correctedValue);
          }

          if (correction) {
            state.currentItem.pendingSauceCorrection = correction;
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              nextQuestion(state, state.currentItem)
            )));
            break;
          }

          const sauces = unique(finalSauces);

          if (!sauces.length) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "What sauce would you like?", "¿Qué salsa quieres?"),
              false
            )));
            break;
          }

          if (sauces.length > sauceSlotsAllowed(state.currentItem)) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, `You can only choose ${sauceSlotsAllowed(state.currentItem)} sauce${sauceSlotsAllowed(state.currentItem) > 1 ? "s" : ""} for that item.`, `Solo puedes escoger ${sauceSlotsAllowed(state.currentItem)} salsa${sauceSlotsAllowed(state.currentItem) > 1 ? "s" : ""} para ese item.`),
              false
            )));
            break;
          }

          state.currentItem.sauces = sauces;
          state.currentItem.sauceOnSide = Boolean(parameters.onSide);
          state.currentItem.pendingSauceCorrection = null;

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "resolve_pending_sauce_correction": {
          if (!state.currentItem.pendingSauceCorrection) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              nextQuestion(state, state.currentItem),
              false
            )));
            break;
          }

          const accept = Boolean(parameters.accept);

          if (accept) {
            state.currentItem.sauces = [state.currentItem.pendingSauceCorrection];
          }

          state.currentItem.pendingSauceCorrection = null;

          if (!accept) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "What sauce would you like instead?", "¿Qué salsa quieres en su lugar?")
            )));
            break;
          }

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_dips": {
          const dips = mapList(parameters.dips || [], DIP_ALIASES);

          if (dipSlotsAllowed(state.currentItem) === 0) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "This item does not need included dips.", "Este item no necesita dips incluidos."),
              false
            )));
            break;
          }

          if (!dips.length) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "What dip would you like?", "¿Qué dip quieres?"),
              false
            )));
            break;
          }

          if (dips.length > dipSlotsAllowed(state.currentItem)) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, `You only get ${dipSlotsAllowed(state.currentItem)} dip${dipSlotsAllowed(state.currentItem) > 1 ? "s" : ""} included.`, `Solo te incluye ${dipSlotsAllowed(state.currentItem)} dip${dipSlotsAllowed(state.currentItem) > 1 ? "s" : ""}.`),
              false
            )));
            break;
          }

          state.currentItem.dips = dips;

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "add_extra_dips": {
          const extra = mapList(parameters.extraDips || [], DIP_ALIASES);
          if (!extra.length) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "What extra dip would you like?", "¿Qué dip extra quieres?"),
              false
            )));
            break;
          }

          state.currentItem.extraDips = unique([...state.currentItem.extraDips, ...extra]);

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            t(state, "Got it.", "Listo.")
          )));
          break;
        }

        case "set_side": {
          const side = parseSide(parameters.side);
          if (!side) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "What side would you like?", "¿Qué acompañante quieres?"),
              false
            )));
            break;
          }

          if (!comboSideAllowed(state.currentItem, side)) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "That side is not available for this combo.", "Ese acompañante no está disponible para este combo."),
              false
            )));
            break;
          }

          state.currentItem.side = side;

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_dressing": {
          const dressing = parseDressing(parameters.dressing);
          if (!dressing) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "What dressing would you like?", "¿Qué aderezo quieres?"),
              false
            )));
            break;
          }

          state.currentItem.dressing = dressing;

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_protein": {
          if (state.currentItem.itemType !== "baked potato combo") {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "This item does not need a protein choice.", "Este item no necesita proteína."),
              false
            )));
            break;
          }

          const protein = parseProtein(parameters.protein);
          if (!protein) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "Chicken, steak, pork belly, or no protein?", "¿Pollo, carne asada, pork belly o sin proteína?"),
              false
            )));
            break;
          }

          state.currentItem.protein = protein;

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_chicken_style": {
          const style = parseChickenStyle(parameters.chickenStyle);
          if (!style) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "Grilled or fried?", "¿A la plancha o frito?"),
              false
            )));
            break;
          }

          state.currentItem.chickenStyle = style;

          const burgerPrompt =
            state.currentItem.itemType === "chicken sandwich combo"
              ? t(state, "That comes with cheese, mayo, lettuce, onion, tomato, and pickles. Any changes?", "Trae queso, mayo, lechuga, cebolla, tomate y pickles. ¿Algún cambio?")
              : state.currentItem.itemType === "flyin burger combo"
              ? t(state, "That comes with cheese, mayo, chipotle ranch, lettuce, onion, tomato, and pickles. Any changes?", "Trae queso, mayo, chipotle ranch, lechuga, cebolla, tomate y pickles. ¿Algún cambio?")
              : null;

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            burgerPrompt || nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_baked_potato_drizzle": {
          const drizzle = parseDip(parameters.drizzle);
          if (!drizzle) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "What drizzle would you like on top?", "¿Qué drizzle quieres arriba?"),
              false
            )));
            break;
          }

          state.currentItem.drizzle = drizzle;

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_baked_potato_topping_mode": {
          const mode = normalize(parameters.mode || "");
          if (mode.includes("side") || mode.includes("lado") || mode.includes("aparte")) {
            state.currentItem.toppingMode = "on_the_side";
          } else if (mode.includes("top") || mode.includes("arriba")) {
            state.currentItem.toppingMode = "on_top";
          } else {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "Would you like everything on top or all on the side?", "¿Lo quieres arriba o todo por un lado?"),
              false
            )));
            break;
          }

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_baked_potato_drink": {
          const drinkNorm = normalize(parameters.drink || "");
          if (drinkNorm.includes("water") || drinkNorm.includes("agua")) {
            state.currentItem.drink = "bottled water";
          } else if (drinkNorm.includes("soft") || drinkNorm.includes("fountain") || drinkNorm.includes("cup") || drinkNorm.includes("refill") || drinkNorm.includes("vaso")) {
            state.currentItem.drink = "soft drink";
          } else {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "Soft drink cup or bottled water?", "¿Vaso para refill o agua embotellada?"),
              false
            )));
            break;
          }

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "add_modifications": {
          const mods = parseMods(parameters.modifications || []);
          if (!mods.length) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "Tell me the change you want.", "Dime qué cambio quieres."),
              false
            )));
            break;
          }

          state.currentItem.modifications = unique([...state.currentItem.modifications, ...mods]);

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "describe_item": {
          const itemType = parseItem(parameters.itemType || parameters.item || "");
          if (!itemType) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "Which item would you like me to explain?", "¿Qué item quieres que te explique?"),
              false
            )));
            break;
          }

          let speak = t(state, "I can explain that item.", "Puedo explicarte ese item.");

          if (itemType === "flyin fries") {
            speak = t(
              state,
              "The Flain Fries come with fries, boneless, ranch, chipotle ranch, and buffalo drizzle.",
              "Las Flain Fries llevan papas, boneless, ranch, chipotle ranch y buffalo drizzle."
            );
          } else if (itemType === "pork belly fries") {
            speak = t(
              state,
              "The pork belly fries come with fries, pork belly, ranch, green chile drizzle, onion, and cilantro.",
              "Las pork belly fries llevan papas, pork belly, ranch, drizzle de green chile, cebolla y cilantro."
            );
          } else if (itemType === "chicken parmesan fries") {
            speak = t(
              state,
              "The chicken parmesan fries come with fries, fried chicken breast, ranch, marinara, and parmesan.",
              "Las chicken parmesan fries llevan papas, pechuga de pollo frita, ranch, marinara y parmesan."
            );
          }

          results.push(toolResult(name, toolCallId, buildPayload(state, speak)));
          break;
        }

        case "finalize_current_item": {
          if (!itemComplete(state.currentItem)) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              nextQuestion(state, state.currentItem),
              false
            )));
            break;
          }

          state.items.push(JSON.parse(JSON.stringify(state.currentItem)));
          state.currentItem = blankItem();

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            t(state, "Perfect. What would you like to add next?", "Perfecto. ¿Qué más te agrego?")
          )));
          break;
        }

        case "set_customer_name": {
          const name = String(parameters.customerName || "").trim();
          if (!name) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "What name should I put on the order?", "¿A nombre de quién pongo la orden?"),
              false
            )));
            break;
          }

          state.customerName = name;

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            t(state, "Got it.", "Listo.")
          )));
          break;
        }

        case "get_order_summary": {
          const summary = fullOrderSummary(state);
          const speak = state.customerName
            ? t(
                state,
                `Perfect. I have ${summary}, under ${state.customerName}. Everything look right?`,
                `Perfecto. Tengo ${summary}, a nombre de ${state.customerName}. ¿Todo está bien?`
              )
            : t(
                state,
                `So far I have ${summary}.`,
                `Hasta ahora tengo ${summary}.`
              );

          results.push(toolResult(name, toolCallId, buildPayload(state, speak)));
          break;
        }

        case "finalize_order": {
          if (state.currentItem.itemType && itemComplete(state.currentItem)) {
            state.items.push(JSON.parse(JSON.stringify(state.currentItem)));
            state.currentItem = blankItem();
          }

          state.orderComplete = true;

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            t(
              state,
              "Perfect, we’ll have that ready for pickup. See you soon.",
              "Perfecto, tendremos tu orden lista para recoger. Gracias."
            )
          )));
          break;
        }

        case "reset_current_item": {
          state.currentItem = blankItem();

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            t(state, "Okay, let’s start that item again.", "Está bien, vamos a empezar ese item otra vez.")
          )));
          break;
        }

        default: {
          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            t(state, "That backend tool is not configured yet.", "Esa herramienta del backend todavía no está configurada."),
            false
          )));
        }
      }
    }

    return res.status(200).json({ results });
  } catch (error) {
    console.error("Error in /vapi/tools:", error);
    return res.status(200).json({ results: [] });
  }
});

app.listen(PORT, () => {
  console.log(`Jeffrey backend listening on port ${PORT}`);
});
