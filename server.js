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
  return [...new Set((arr || []).filter(Boolean))];
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
    "papas de camote",
    "hamburguesa",
    "pollo",
    "aderezo",
    "queso",
    "cebolla"
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
    "sweet potato fries",
    "burger",
    "sandwich",
    "sauce",
    "dip"
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

function safeSpeak(state, maybeText) {
  if (maybeText && String(maybeText).trim()) return maybeText;
  return t(
    state,
    "Sorry, I didn’t catch that. Can you repeat that for me?",
    "Perdón, no te entendí bien. ¿Me lo repites?"
  );
}

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
    speak: safeSpeak(state, speak),
    ...extra
  };
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

/* ----------------------------- aliases ----------------------------- */

const SAUCE_ALIASES = [
  { keys: ["al pastor", "pastor"], value: "al pastor" },
  { keys: ["barbeque", "barbecue", "bbq", "barbacoa"], value: "barbeque" },
  { keys: ["barbeque chiltepin", "barbecue chiltepin", "bbq chiltepin", "barbacoa chiltepin"], value: "barbeque chiltepin" },
  { keys: ["chorizo"], value: "chorizo" },
  { keys: ["chocolate chiltepin"], value: "chocolate chiltepin" },
  { keys: ["cinnamon roll", "canela"], value: "cinnamon roll" },
  { keys: ["citrus chipotle", "chipotle citrico", "chipotle cítrico"], value: "citrus chipotle" },
  { keys: ["garlic parmesan", "garlic parm", "parm", "parmesan", "garlic parmesano", "garlic parmesan sauce", "ajo parmesano"], value: "garlic parmesan" },
  { keys: ["green chile", "green chili", "chile verde"], value: "green chile" },
  { keys: ["hot", "buffalo hot", "picante", "picosa"], value: "hot" },
  { keys: ["lime pepper", "laim pepper", "laim peper", "limon pepper", "limón pepper", "limon pimienta", "limón pimienta"], value: "lime pepper" },
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
  { keys: ["regular fries", "fries", "french fries", "papas", "papas fritas", "frais"], value: "regular fries" },
  { keys: ["sweet potato fries", "papas de camote"], value: "sweet potato fries" },
  { keys: ["potato salad", "ensalada de papa"], value: "potato salad" },
  { keys: ["buffalo ranch fries"], value: "buffalo ranch fries" },
  { keys: ["mac bites", "mac and cheese bites"], value: "mac bites" },
  { keys: ["corn ribs", "costillas de elote"], value: "corn ribs" },
  { keys: ["mozzarella sticks", "mozzarella"], value: "mozzarella sticks" },
  { keys: ["onion rings", "aros de cebolla"], value: "onion rings" },
  { keys: ["flyin corn", "flyin’ corn", "flying corn", "elote"], value: "flyin corn" },
  { keys: ["tostones"], value: "tostones" },
  { keys: ["yuca fries", "yucca fries", "yuca"], value: "yuca fries" }
];

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

  { keys: ["classic burger combo"], value: "classic burger combo" },
  { keys: ["classic burger"], value: "classic burger" },

  { keys: ["buffalo burger combo"], value: "buffalo burger combo" },
  { keys: ["buffalo burger"], value: "buffalo burger" },

  { keys: ["chicken sandwich combo"], value: "chicken sandwich combo" },
  { keys: ["chicken sandwich"], value: "chicken sandwich" },

  { keys: ["flyin burger combo", "flyin’ burger combo"], value: "flyin burger combo" },
  { keys: ["flyin burger", "flyin’ burger"], value: "flyin burger" },

  { keys: ["flyin baked potato combo", "baked potato combo", "loaded baked potato combo"], value: "baked potato combo" },

  {
    keys: [
      "flyin fries",
      "flyin’ fries",
      "flying fries",
      "flain fries",
      "flain frais",
      "flying fries",
      "frailin fries",
      "junior flyin fries"
    ],
    value: "flyin fries"
  },
  { keys: ["pork belly fries"], value: "pork belly fries" },
  { keys: ["chicken parmesan fries", "chicken parm fries"], value: "chicken parmesan fries" },
  { keys: ["buffalo ranch fries"], value: "buffalo ranch fries" },

  { keys: ["house salad"], value: "house salad" },
  { keys: ["flyin salad", "flyin’ salad"], value: "flyin salad" },

  { keys: ["pork belly", "6 piece pork belly", "6 pieces pork belly"], value: "pork belly" },
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
  { keys: ["no pickles", "sin pickles", "sin pepinillos"], value: "no pickles" },
  { keys: ["on the side", "aparte", "on side"], value: "on the side" }
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

function parseDip(value) {
  return findAlias(value, DIP_ALIASES);
}

function parseMods(values) {
  return unique((values || []).map((v) => findAlias(v, MOD_ALIASES)).filter(Boolean));
}

function parseSauce(value) {
  const norm = normalize(value);

  if (
    norm.includes("lemon pepper") ||
    norm.includes("limon pepper") ||
    norm.includes("limón pepper") ||
    norm === "lemon" ||
    norm === "limon"
  ) {
    return { correctionRequired: true, correctedValue: "lime pepper" };
  }

  const mapped = findAlias(value, SAUCE_ALIASES);
  return { correctionRequired: false, correctedValue: mapped || null };
}

function mapListKeepRepeats(values, aliasList) {
  return (values || []).map((v) => findAlias(v, aliasList)).filter(Boolean);
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
    pendingSauceCorrection: null,

    includedDips: [],
    extraDips: [],

    side: null,
    dressing: null,
    protein: null,
    chickenStyle: null,
    drizzle: null,
    toppingMode: null,
    drink: null,

    modifications: [],
    notes: [],

    pendingComboUpsell: false,
    pendingComboTarget: null,

    pendingIngredientConfirmation: null,
    ingredientConfirmed: false
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
  if (!calls.has(callId)) calls.set(callId, blankCallState());
  return calls.get(callId);
}

/* ----------------------------- menu logic ----------------------------- */

function isWingBase(item) {
  return item.itemType === "wings" || item.itemType === "boneless";
}

function isStandaloneBurgerLike(item) {
  return ["classic burger", "buffalo burger", "chicken sandwich", "flyin burger"].includes(item.itemType);
}

function isBurgerLike(item) {
  return [
    "classic burger",
    "classic burger combo",
    "buffalo burger",
    "buffalo burger combo",
    "chicken sandwich",
    "chicken sandwich combo",
    "flyin burger",
    "flyin burger combo"
  ].includes(item.itemType);
}

function isLoadedFries(item) {
  return ["flyin fries", "pork belly fries", "chicken parmesan fries"].includes(item.itemType);
}

function sideChoiceItems(itemType) {
  return [
    "8 wings combo",
    "8 boneless combo",
    "half rack combo",
    "half rack and 4 bone in combo",
    "fish combo",
    "classic burger combo",
    "buffalo burger combo",
    "chicken sandwich combo",
    "flyin burger combo"
  ].includes(itemType);
}

function sauceSlotsAllowed(item) {
  if (item.itemType === "wings" || item.itemType === "boneless") {
    if (!item.quantity) return 0;
    if (item.quantity === 6) return 1;
    if (item.quantity === 9) return 1;
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
    if (item.quantity === 6) return 1;
    if (item.quantity === 9) return 1;
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
    (item.itemType === "ribs" && item.size === "half rack") ||
    isStandaloneBurgerLike(item)
  );
}

function getComboTarget(itemType) {
  if (itemType === "wings") return "8 wings combo";
  if (itemType === "boneless") return "8 boneless combo";
  if (itemType === "ribs") return "half rack combo";
  if (itemType === "classic burger") return "classic burger combo";
  if (itemType === "buffalo burger") return "buffalo burger combo";
  if (itemType === "chicken sandwich") return "chicken sandwich combo";
  if (itemType === "flyin burger") return "flyin burger combo";
  return null;
}

function comboSideAllowed(itemType, side) {
  const standard = ["regular fries", "sweet potato fries", "potato salad"];

  if (
    [
      "8 wings combo",
      "8 boneless combo",
      "half rack combo",
      "half rack and 4 bone in combo",
      "classic burger combo",
      "buffalo burger combo",
      "chicken sandwich combo",
      "flyin burger combo"
    ].includes(itemType)
  ) {
    return standard.includes(side);
  }

  if (itemType === "fish combo") {
    return [...standard, "tostones", "yuca fries"].includes(side);
  }

  return true;
}

function loadedFriesPrompt(state, itemType) {
  if (itemType === "flyin fries") {
    return t(
      state,
      "That comes with fries, boneless, ranch, chipotle ranch, and buffalo sauce on top. Everything okay?",
      "Eso lleva Flain frais, boneless, ranch, chipotle ranch y buffalo arriba. ¿Está bien así?"
    );
  }

  if (itemType === "pork belly fries") {
    return t(
      state,
      "That comes with fries, pork belly, ranch, green chile on top, onion, and cilantro. Everything okay?",
      "Eso lleva frais, pork belly, ranch, green chile arriba, cebolla y cilantro. ¿Está bien así?"
    );
  }

  if (itemType === "chicken parmesan fries") {
    return t(
      state,
      "That comes with fries, fried chicken breast, ranch, marinara, and parmesan on top. Everything okay?",
      "Eso lleva frais, pechuga frita, ranch, marinara y parmesan arriba. ¿Está bien así?"
    );
  }

  return null;
}

function burgerIngredientsPrompt(state, itemType) {
  if (itemType === "classic burger" || itemType === "classic burger combo") {
    return t(
      state,
      "That comes with cheese, mayo, lettuce, onion, tomato, and pickles. Any changes?",
      "Eso lleva queso, mayo, lechuga, cebolla, tomate y pickles. ¿Algún cambio?"
    );
  }

  if (itemType === "buffalo burger" || itemType === "buffalo burger combo") {
    return t(
      state,
      "That comes with cheese, buffalo mild sauce, ranch, lettuce, onion, tomato, and pickles. Any changes?",
      "Eso lleva queso, buffalo mild, ranch, lechuga, cebolla, tomate y pickles. ¿Algún cambio?"
    );
  }

  if (itemType === "chicken sandwich" || itemType === "chicken sandwich combo") {
    return t(
      state,
      "That comes with cheese, mayo, lettuce, onion, tomato, and pickles. Any changes?",
      "Eso lleva queso, mayo, lechuga, cebolla, tomate y pickles. ¿Algún cambio?"
    );
  }

  if (itemType === "flyin burger" || itemType === "flyin burger combo") {
    return t(
      state,
      "That comes with a beef patty with cheese, a chicken patty with cheese, mayo, chipotle ranch, lettuce, onion, tomato, and pickles. Any changes?",
      "Eso lleva una carne con queso, una pechuga de pollo con queso, mayo, chipotle ranch, lechuga, cebolla, tomate y pickles. ¿Algún cambio?"
    );
  }

  return null;
}

function setLoadedItemDefaults(item) {
  if (item.itemType === "flyin fries") {
    item.pendingIngredientConfirmation = "loaded_item";
    item.notes.push("Default loaded item: fries, boneless, ranch, chipotle ranch, buffalo on top");
  }

  if (item.itemType === "pork belly fries") {
    item.pendingIngredientConfirmation = "loaded_item";
    item.notes.push("Default loaded item: fries, pork belly, ranch, green chile on top, onion, cilantro");
  }

  if (item.itemType === "chicken parmesan fries") {
    item.pendingIngredientConfirmation = "loaded_item";
    item.notes.push("Default loaded item: fries, fried chicken breast, ranch, marinara, parmesan on top");
  }

  if (item.itemType === "buffalo ranch fries") {
    item.side = item.side || "regular fries";
  }
}

function nextQuestion(state, item) {
  if (item.pendingSauceCorrection) {
    return t(
      state,
      "We have that as lime pepper. Is that okay?",
      "La tenemos como lime pepper. ¿Está bien así?"
    );
  }

  if (item.pendingComboUpsell) {
    if (item.itemType === "wings" || item.itemType === "boneless") {
      return t(
        state,
        "You can make that an 8-piece combo with fries and a drink. Want to do that?",
        "Lo puedes hacer combo de 8 piezas con fries y bebida. ¿Lo quieres así?"
      );
    }

    if (item.itemType === "ribs" && item.size === "half rack") {
      return t(
        state,
        "You can make that a half rack combo with fries and a drink. Want to do that?",
        "Lo puedes hacer combo de medio rack con fries y bebida. ¿Lo quieres así?"
      );
    }

    if (isStandaloneBurgerLike(item)) {
      return t(
        state,
        "You can make that a combo with fries and a drink. Want to do that?",
        "Lo puedes hacer combo con fries y bebida. ¿Lo quieres así?"
      );
    }
  }

  if (item.pendingIngredientConfirmation) {
    if (isLoadedFries(item)) return loadedFriesPrompt(state, item.itemType);
    if (isBurgerLike(item)) return burgerIngredientsPrompt(state, item.itemType);
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

  if ((item.itemType === "chicken sandwich" || item.itemType === "chicken sandwich combo") && !item.chickenStyle) {
    return t(state, "Would you like grilled or fried chicken?", "¿Lo quieres a la plancha o frito?");
  }

  if ((item.itemType === "flyin burger" || item.itemType === "flyin burger combo") && !item.chickenStyle) {
    return t(state, "Would you like the chicken grilled or fried?", "¿Quieres el pollo a la plancha o frito?");
  }

  if (item.itemType === "flyin salad" && !item.chickenStyle) {
    return t(state, "Would you like grilled or fried chicken?", "¿Lo quieres a la plancha o frito?");
  }

  if (item.itemType === "baked potato combo" && !item.protein) {
    return t(
      state,
      "For the baked potato combo: chicken, steak, pork belly, or no protein?",
      "Para el combo de baked potato: ¿pollo, carne asada, pork belly o sin proteína?"
    );
  }

  if (item.itemType === "baked potato combo" && item.protein === "chicken" && !item.chickenStyle) {
    return t(state, "Would you like grilled or fried chicken?", "¿Lo quieres a la plancha o frito?");
  }

  if (sauceSlotsAllowed(item) > 0 && !item.noSauce && item.sauces.length === 0) {
    if (item.itemType === "wings" || item.itemType === "boneless") {
      const slots = sauceSlotsAllowed(item);
      return t(
        state,
        `What sauce would you like? You can choose up to ${slots}.`,
        `¿Qué salsa quieres? Puedes escoger hasta ${slots}.`
      );
    }

    return t(state, "What sauce would you like?", "¿Qué salsa quieres?");
  }

  if (dipSlotsAllowed(item) > 0 && item.includedDips.length < dipSlotsAllowed(item)) {
    const remaining = dipSlotsAllowed(item) - item.includedDips.length;
    if (item.includedDips.length === 0) {
      return t(
        state,
        `What dip would you like? Ranch, blue cheese, chipotle ranch, or jalapeño ranch. You get ${dipSlotsAllowed(item)}.`,
        `¿Qué dip quieres? Ranch, blue cheese, chipotle ranch o jalapeño ranch. Te incluye ${dipSlotsAllowed(item)}.`
      );
    }

    return t(
      state,
      `I still need ${remaining} more dip${remaining > 1 ? "s" : ""}. Ranch, blue cheese, chipotle ranch, or jalapeño ranch.`,
      `Todavía me faltan ${remaining} dip${remaining > 1 ? "s" : ""}. Ranch, blue cheese, chipotle ranch o jalapeño ranch.`
    );
  }

  if ((item.itemType === "house salad" || item.itemType === "flyin salad") && !item.dressing) {
    return t(
      state,
      "What dressing would you like: ranch, blue cheese, chipotle ranch, or jalapeño ranch?",
      "¿Qué aderezo quieres: ranch, blue cheese, chipotle ranch o jalapeño ranch?"
    );
  }

  if (sideChoiceItems(item.itemType) && !item.side) {
    return t(
      state,
      "What side would you like: regular fries, sweet potato fries, or potato salad?",
      "¿Qué acompañante quieres: papas regulares, papas de camote o ensalada de papa?"
    );
  }

  if (item.itemType === "baked potato combo" && !item.drizzle) {
    return t(
      state,
      "What drizzle would you like: ranch, blue cheese, chipotle ranch, or jalapeño ranch?",
      "¿Qué drizzle quieres: ranch, blue cheese, chipotle ranch o jalapeño ranch?"
    );
  }

  if (item.itemType === "baked potato combo" && !item.toppingMode) {
    return t(
      state,
      "Would you like everything on top or all on the side?",
      "¿Lo quieres todo arriba o todo por un lado?"
    );
  }

  if (item.itemType === "baked potato combo" && !item.drink) {
    return t(state, "Soft drink or bottled water?", "¿Refresco o agua embotellada?");
  }

  return t(state, "Perfect. What would you like to add next?", "Perfecto. ¿Qué más te agrego?");
}

function itemComplete(item) {
  if (!item.itemType) return false;
  if (item.pendingComboUpsell) return false;
  if (item.pendingIngredientConfirmation) return false;
  if (item.pendingSauceCorrection) return false;

  if (isWingBase(item)) {
    return Boolean(
      item.quantity &&
      (item.noSauce || item.sauces.length > 0) &&
      item.includedDips.length >= dipSlotsAllowed(item)
    );
  }

  if (item.itemType === "ribs") {
    return Boolean(item.size && (item.noSauce || item.sauces.length > 0));
  }

  if (item.itemType === "8 wings combo" || item.itemType === "8 boneless combo") {
    return Boolean(item.sauces.length >= 1 && item.includedDips.length >= 1 && item.side);
  }

  if (item.itemType === "half rack combo") {
    return Boolean(item.sauces.length >= 1 && item.side);
  }

  if (item.itemType === "half rack and 4 bone in combo") {
    return Boolean(item.sauces.length >= 2 && item.includedDips.length >= 1 && item.side);
  }

  if (item.itemType === "fish combo") return Boolean(item.side);

  if (item.itemType === "classic burger" || item.itemType === "buffalo burger") {
    return Boolean(item.ingredientConfirmed);
  }

  if (item.itemType === "classic burger combo" || item.itemType === "buffalo burger combo") {
    return Boolean(item.ingredientConfirmed && item.side);
  }

  if (item.itemType === "chicken sandwich" || item.itemType === "flyin burger") {
    return Boolean(item.chickenStyle && item.ingredientConfirmed);
  }

  if (item.itemType === "chicken sandwich combo" || item.itemType === "flyin burger combo") {
    return Boolean(item.chickenStyle && item.ingredientConfirmed && item.side);
  }

  if (item.itemType === "baked potato combo") {
    return Boolean(item.protein && (item.protein !== "chicken" || item.chickenStyle) && item.sauces.length >= 1 && item.drizzle && item.toppingMode && item.drink);
  }

  if (item.itemType === "house salad") return Boolean(item.dressing);
  if (item.itemType === "flyin salad") return Boolean(item.chickenStyle && item.dressing);

  if (item.itemType === "pork belly") return Boolean(item.sauces.length >= 1);
  if (item.itemType === "corn ribs") return Boolean(item.sauces.length >= 1);
  if (item.itemType === "mac bites") return Boolean(item.includedDips.length >= 1);

  if (item.itemType === "kids boneless" || item.itemType === "kids wings") {
    return Boolean(item.sauces.length >= 1 && item.includedDips.length >= 1);
  }

  if (item.itemType === "kids cheeseburger") return Boolean(item.ingredientConfirmed);
  if (item.itemType === "sampler platter") return Boolean(item.sauces.length >= 1);
  if (isLoadedFries(item)) return Boolean(item.ingredientConfirmed);

  return true;
}

/* ----------------------------- display ----------------------------- */

function displaySide(side, lang) {
  if (lang === "es") {
    const map = {
      "regular fries": "papas regulares",
      "sweet potato fries": "papas de camote",
      "potato salad": "ensalada de papa",
      "tostones": "tostones",
      "yuca fries": "papas de yuca",
      "buffalo ranch fries": "buffalo ranch fries"
    };
    return map[side] || side;
  }
  return side;
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
    "classic burger": "classic burger",
    "classic burger combo": "classic burger combo",
    "buffalo burger": "buffalo burger",
    "buffalo burger combo": "buffalo burger combo",
    "chicken sandwich": "chicken sandwich",
    "chicken sandwich combo": "chicken sandwich combo",
    "flyin burger": "Flyin' Burger",
    "flyin burger combo": "Flyin' Burger combo",
    "baked potato combo": "Flyin' baked potato combo",
    "flyin fries": "Flyin' Fries",
    "pork belly fries": "pork belly fries",
    "chicken parmesan fries": "chicken parmesan fries",
    "buffalo ranch fries": "buffalo ranch fries",
    "house salad": "house salad",
    "flyin salad": "Flyin' Salad",
    "pork belly": "order of pork belly",
    "mac bites": "mac bites",
    "onion rings": "onion rings",
    "flyin corn": "Flyin' corn",
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
    "classic burger": "classic burger",
    "classic burger combo": "classic burger combo",
    "buffalo burger": "buffalo burger",
    "buffalo burger combo": "buffalo burger combo",
    "chicken sandwich": "chicken sandwich",
    "chicken sandwich combo": "chicken sandwich combo",
    "flyin burger": "Flyin' Burger",
    "flyin burger combo": "Flyin' Burger combo",
    "baked potato combo": "combo de baked potato",
    "flyin fries": "Flyin' Fries",
    "pork belly fries": "pork belly fries",
    "chicken parmesan fries": "chicken parmesan fries",
    "buffalo ranch fries": "buffalo ranch fries",
    "house salad": "house salad",
    "flyin salad": "Flyin' Salad",
    "pork belly": "orden de pork belly",
    "mac bites": "mac bites",
    "onion rings": "onion rings",
    "flyin corn": "Flyin' corn",
    "corn ribs": "corn ribs",
    "mozzarella sticks": "mozzarella sticks",
    "sampler platter": "sampler platter",
    "kids boneless": "kids de 4 boneless",
    "kids wings": "kids de 4 alitas",
    "kids cheeseburger": "kids cheeseburger"
  };

  return lang === "es" ? (mapEs[item.itemType] || item.itemType) : (mapEn[item.itemType] || item.itemType);
}

function countList(list) {
  const counts = {};
  for (const item of list || []) counts[item] = (counts[item] || 0) + 1;
  return Object.entries(counts).map(([name, qty]) => `${qty} ${name}`).join(", ");
}

function summaryForItem(item, lang = "en") {
  const parts = [];

  if (isWingBase(item) && item.quantity) {
    parts.push(`${item.quantity} ${itemDisplay(item, lang)}`);
  } else {
    parts.push(itemDisplay(item, lang));
  }

  if (!isBurgerLike(item) && !isLoadedFries(item)) {
    if (item.noSauce) {
      parts.push(lang === "es" ? "sin salsa" : "no sauce");
    } else if (item.sauces.length) {
      parts.push(item.sauces.join(lang === "es" ? " y " : " and "));
      if (item.sauceOnSide) parts.push(lang === "es" ? "aparte" : "on the side");
    }
  }

  if (item.includedDips.length) parts.push((lang === "es" ? "dips " : "dips ") + countList(item.includedDips));
  if (item.extraDips.length) parts.push((lang === "es" ? "extra " : "extra ") + countList(item.extraDips));
  if (item.side) parts.push(displaySide(item.side, lang));

  if (item.chickenStyle) {
    if (lang === "es") parts.push(item.chickenStyle === "grilled" ? "pollo a la plancha" : "pollo frito");
    else parts.push(item.chickenStyle === "grilled" ? "grilled chicken" : "fried chicken");
  }

  if (item.protein) {
    if (lang === "es") {
      const proteins = {
        "chicken": "pollo",
        "steak": "carne asada",
        "pork belly": "pork belly",
        "no protein": "sin proteína"
      };
      parts.push(proteins[item.protein] || item.protein);
    } else {
      parts.push(item.protein);
    }
  }

  if (item.dressing) parts.push(lang === "es" ? `aderezo ${item.dressing}` : `dressing ${item.dressing}`);
  if (item.drizzle) parts.push(lang === "es" ? `drizzle ${item.drizzle}` : `drizzle ${item.drizzle}`);

  if (item.toppingMode) {
    parts.push(
      lang === "es"
        ? item.toppingMode === "on_the_side"
          ? "todo por un lado"
          : "todo arriba"
        : item.toppingMode === "on_the_side"
          ? "all on the side"
          : "everything on top"
    );
  }

  const filteredMods = (item.modifications || []).filter((m) => m !== "on the side");
  if (filteredMods.length) {
    if (lang === "es") parts.push(filteredMods.map((m) => m.replace(/^no /, "sin ")).join(", "));
    else parts.push(filteredMods.join(", "));
  }

  return parts.join(", ");
}

function fullOrderSummary(state) {
  const lang = state.language === "es" ? "es" : "en";
  return state.items.map((item) => summaryForItem(item, lang)).join("; ");
}

/* ----------------------------- route helpers ----------------------------- */

function setBurgerConfirmationIfNeeded(item) {
  if (isBurgerLike(item)) item.pendingIngredientConfirmation = "burger";
}

function setLoadedConfirmationIfNeeded(item) {
  if (isLoadedFries(item)) item.pendingIngredientConfirmation = "loaded";
}

function addBuffaloBurgerNotes(item) {
  if (item.itemType === "buffalo burger combo") {
    item.notes.push("Use classic burger combo");
    item.notes.push("Remove mayo");
    item.notes.push("Replace mayo with ranch");
    item.notes.push("Add buffalo sauce side charge");
    item.notes.push("Kitchen note: Sub ranch for mayo + buffalo sauce side charge");
  }
}

/* ----------------------------- routes ----------------------------- */

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
              t(state, "Sorry, I didn’t catch the item. What would you like?", "Perdón, no entendí el item. ¿Qué quieres ordenar?"),
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

          if (parameters.quantity != null) state.currentItem.quantity = Number(parameters.quantity);

          if (parameters.size) {
            const sizeNorm = normalize(parameters.size);
            if (sizeNorm.includes("half") || sizeNorm.includes("medio") || sizeNorm.includes("media")) {
              state.currentItem.size = "half rack";
            } else if (sizeNorm.includes("full") || sizeNorm.includes("completo")) {
              state.currentItem.size = "full rack";
            }
          }

          if (parameters.noSauce) state.currentItem.noSauce = true;
          if (parameters.sauceOnSide) state.currentItem.sauceOnSide = true;

          if (parameters.side) {
            const side = parseSide(parameters.side);
            if (side && comboSideAllowed(state.currentItem.itemType, side)) state.currentItem.side = side;
          }

          if (parameters.protein) state.currentItem.protein = parseProtein(parameters.protein);
          if (parameters.chickenStyle) state.currentItem.chickenStyle = parseChickenStyle(parameters.chickenStyle);
          if (Array.isArray(parameters.modifications)) state.currentItem.modifications = parseMods(parameters.modifications);

          setLoadedItemDefaults(state.currentItem);

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
            state.currentItem.pendingComboTarget = getComboTarget(state.currentItem.itemType);
          } else {
            setBurgerConfirmationIfNeeded(state.currentItem);
            setLoadedConfirmationIfNeeded(state.currentItem);
          }

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
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

          if (accept && state.currentItem.pendingComboTarget) {
            state.currentItem.itemType = state.currentItem.pendingComboTarget;
            addBuffaloBurgerNotes(state.currentItem);
          }

          state.currentItem.pendingComboUpsell = false;
          state.currentItem.pendingComboTarget = null;

          setBurgerConfirmationIfNeeded(state.currentItem);
          setLoadedConfirmationIfNeeded(state.currentItem);

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
            state.currentItem.pendingComboTarget = getComboTarget(state.currentItem.itemType);
          } else {
            state.currentItem.pendingComboUpsell = false;
            state.currentItem.pendingComboTarget = null;
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
            state.currentItem.pendingComboTarget = getComboTarget(state.currentItem.itemType);
          } else {
            state.currentItem.pendingComboUpsell = false;
            state.currentItem.pendingComboTarget = null;
          }

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_sauces": {
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

          const maxSauces = sauceSlotsAllowed(state.currentItem);
          if (maxSauces > 0 && sauces.length > maxSauces) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(
                state,
                `You can only choose up to ${maxSauces} sauce${maxSauces > 1 ? "s" : ""} for that item.`,
                `Solo puedes escoger hasta ${maxSauces} salsa${maxSauces > 1 ? "s" : ""} para ese item.`
              ),
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
              t(state, "What sauce would you like instead?", "¿Qué salsa quieres en lugar?")
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
          const dips = mapListKeepRepeats(parameters.dips || [], DIP_ALIASES);
          const allowed = dipSlotsAllowed(state.currentItem);

          if (allowed === 0) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "This item does not need dips.", "Este item no necesita dips."),
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

          if (dips.length > allowed) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(
                state,
                `You only get ${allowed} dip${allowed > 1 ? "s" : ""} included.`,
                `Solo te incluye ${allowed} dip${allowed > 1 ? "s" : ""}.`
              ),
              false
            )));
            break;
          }

          state.currentItem.includedDips = dips;

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "add_extra_dips": {
          const extra = mapListKeepRepeats(parameters.extraDips || [], DIP_ALIASES);

          if (!extra.length) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "What extra dip would you like?", "¿Qué dip extra quieres?"),
              false
            )));
            break;
          }

          state.currentItem.extraDips = [...state.currentItem.extraDips, ...extra];

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

          if (!comboSideAllowed(state.currentItem.itemType, side)) {
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
          const dressing = parseDip(parameters.dressing);

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
          if (isBurgerLike(state.currentItem)) setBurgerConfirmationIfNeeded(state.currentItem);

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_baked_potato_drizzle": {
          const drizzle = parseDip(parameters.drizzle);

          if (!drizzle) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "What drizzle would you like?", "¿Qué drizzle quieres?"),
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
              t(state, "Would you like everything on top or all on the side?", "¿Lo quieres todo arriba o todo por un lado?"),
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
          } else if (
            drinkNorm.includes("soft") ||
            drinkNorm.includes("soda") ||
            drinkNorm.includes("refresco") ||
            drinkNorm.includes("drink") ||
            drinkNorm.includes("vaso")
          ) {
            state.currentItem.drink = "soft drink";
          } else {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "Soft drink or bottled water?", "¿Refresco o agua embotellada?"),
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
              t(state, "Tell me the change you want.", "Dime el cambio que quieres."),
              false
            )));
            break;
          }

          state.currentItem.modifications = unique([...state.currentItem.modifications, ...mods]);

          if (state.currentItem.pendingIngredientConfirmation) {
            state.currentItem.pendingIngredientConfirmation = null;
            state.currentItem.ingredientConfirmed = true;
          }

          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "confirm_item_ingredients": {
          if (!state.currentItem.pendingIngredientConfirmation) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              nextQuestion(state, state.currentItem),
              false
            )));
            break;
          }

          state.currentItem.pendingIngredientConfirmation = null;
          state.currentItem.ingredientConfirmed = true;

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

          let speak = t(state, "I can explain that item.", "Te puedo explicar ese item.");

          if (itemType === "pork belly") {
            speak = t(
              state,
              "It is an order of pork belly, 6 pieces, with 1 sauce.",
              "Es una orden de pork belly de 6 piezas con 1 salsa."
            );
          } else if (itemType === "flyin fries" || itemType === "pork belly fries" || itemType === "chicken parmesan fries") {
            speak = loadedFriesPrompt(state, itemType);
          }

          results.push(toolResult(name, toolCallId, buildPayload(state, speak)));
          break;
        }

        case "recover_unclear_input": {
          results.push(toolResult(name, toolCallId, buildPayload(
            state,
            t(
              state,
              "Sorry, I didn’t catch that. Can you repeat that for me?",
              "Perdón, no te entendí bien. ¿Me lo repites?"
            ),
            false
          )));
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
          const customerName = String(parameters.customerName || "").trim();
          if (!customerName) {
            results.push(toolResult(name, toolCallId, buildPayload(
              state,
              t(state, "What name should I put on the order?", "¿A nombre de quién pongo la orden?"),
              false
            )));
            break;
          }

          state.customerName = customerName;

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
            t(
              state,
              "Sorry, I didn’t catch that. Can you repeat that for me?",
              "Perdón, no te entendí bien. ¿Me lo repites?"
            ),
            false
          )));
        }
      }
    }

    return res.status(200).json({ results });
  } catch (error) {
    console.error("Error in /vapi/tools:", error);
    return res.status(200).json({
      results: [
        {
          name: "error_fallback",
          toolCallId: "server-error",
          result: JSON.stringify({
            ok: false,
            speak: "Sorry, I didn’t catch that. Can you repeat that for me?"
          })
        }
      ]
    });
  }
});

app.listen(PORT, () => {
  console.log(`Jeffrey backend listening on port ${PORT}`);
});
