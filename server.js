import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

const calls = new Map();

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
  { keys: ["lime pepper", "laim pepper", "lemon pepper", "limon pepper", "limón pepper", "limon pimienta", "limón pimienta"], value: "lime pepper" },
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
  { keys: ["steak"], value: "steak" },
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

  { keys: ["half rack combo", "1/2 rack combo", "combo de medio rack", "combo de media costilla"], value: "half rack combo" },
  { keys: ["8 wings combo", "wing combo", "combo de 8 alitas"], value: "8 wings combo" },
  { keys: ["8 boneless combo", "boneless combo", "combo de 8 boneless"], value: "8 boneless combo" },
  { keys: ["half rack and 4 bone in combo", "1/2 rack and 4 bone in combo", "media costilla y 4 alitas"], value: "half rack and 4 bone in combo" },
  { keys: ["fish combo", "fish and fries", "4 pieces fish and fries"], value: "fish combo" },

  { keys: ["ribs", "korean ribs", "korean style ribs", "costillas"], value: "ribs" },
  { keys: ["half rack", "1/2 rack", "medio rack", "media costilla"], value: "half rack" },
  { keys: ["full rack", "rack completo", "costillar completo"], value: "full rack" },

  { keys: ["classic burger combo", "classic burger"], value: "classic burger combo" },
  { keys: ["chicken sandwich combo", "chicken sandwich"], value: "chicken sandwich combo" },
  { keys: ["flyin burger combo", "flyin burger", "flyin’ burger"], value: "flyin burger combo" },
  { keys: ["buffalo burger"], value: "buffalo burger combo" },

  { keys: ["baked potato combo", "flyin baked potato combo", "loaded baked potato combo"], value: "baked potato combo" },

  { keys: ["house salad"], value: "house salad" },
  { keys: ["flyin salad", "flyin’ salad"], value: "flyin salad" },
  { keys: ["pork belly"], value: "pork belly" },
  { keys: ["corn ribs", "costillas de elote"], value: "corn ribs" },
  { keys: ["mac bites", "mac bite"], value: "mac bites" },
  { keys: ["mozzarella sticks"], value: "mozzarella sticks" },
  { keys: ["onion rings"], value: "onion rings" },
  { keys: ["flyin fries", "flyin’ fries", "flying fries", "junior flyin fries"], value: "flyin fries" },
  { keys: ["buffalo ranch fries"], value: "buffalo ranch fries" },
  { keys: ["sampler platter", "sampler"], value: "sampler platter" }
];

const REMOVAL_ALIASES = [
  { keys: ["no onion", "sin cebolla"], value: "no onion" },
  { keys: ["no tomato", "sin tomate"], value: "no tomato" },
  { keys: ["no cheese", "sin queso"], value: "no cheese" },
  { keys: ["no mayo", "sin mayonesa"], value: "no mayo" },
  { keys: ["no lettuce", "sin lechuga"], value: "no lettuce" },
  { keys: ["no pickles", "sin pickles", "sin pepinillos"], value: "no pickles" }
];

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findAlias(value, aliasList) {
  const text = normalize(value);
  for (const entry of aliasList) {
    for (const key of entry.keys) {
      if (text === normalize(key) || text.includes(normalize(key))) {
        return entry.value;
      }
    }
  }
  return null;
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function canonicalSauce(value) {
  return findAlias(value, SAUCE_ALIASES) || null;
}

function canonicalDip(value) {
  return findAlias(value, DIP_ALIASES) || null;
}

function canonicalSide(value) {
  return findAlias(value, SIDE_ALIASES) || null;
}

function canonicalDressing(value) {
  return findAlias(value, DRESSING_ALIASES) || null;
}

function canonicalProtein(value) {
  return findAlias(value, PROTEIN_ALIASES) || null;
}

function canonicalChickenStyle(value) {
  return findAlias(value, CHICKEN_STYLE_ALIASES) || null;
}

function canonicalItem(value) {
  return findAlias(value, ITEM_ALIASES) || null;
}

function canonicalRemoval(value) {
  return findAlias(value, REMOVAL_ALIASES) || null;
}

function detectLanguage(text = "") {
  const input = normalize(text);

  if (
    /\b(espanol|español|hablas espanol|en espanol|quiero|papas|alitas|nombre|gracias)\b/.test(input)
  ) {
    return "es";
  }

  if (
    /\b(english|in english|i want|wings|fries|name|thank you)\b/.test(input)
  ) {
    return "en";
  }

  return "unknown";
}

function getLatestCustomerText(message) {
  const msgs = message?.artifact?.messages;
  if (Array.isArray(msgs)) {
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      if (msgs[i]?.role === "user" && typeof msgs[i]?.message === "string") {
        return msgs[i].message;
      }
    }
  }
  if (typeof message?.customer?.message === "string") return message.customer.message;
  if (typeof message?.transcript === "string") return message.transcript;
  return "";
}

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
    modifications: [],
    notes: [],
    drinkIncluded: false
  };
}

function blankCallState() {
  return {
    language: "unknown",
    languageLocked: false,
    customerName: null,
    items: [],
    currentItem: blankItem(),
    orderFinalized: false
  };
}

function getCallState(callId) {
  if (!calls.has(callId)) {
    calls.set(callId, blankCallState());
  }
  return calls.get(callId);
}

function maybeLockLanguage(state, latestText = "", explicitLanguage = null) {
  if (explicitLanguage === "es" || explicitLanguage === "en") {
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

function t(state, en, es) {
  return state.language === "es" ? es : en;
}

function isWingItem(item) {
  return item.itemType === "wings" || item.itemType === "boneless";
}

function isBurgerCombo(item) {
  return [
    "classic burger combo",
    "chicken sandwich combo",
    "flyin burger combo",
    "buffalo burger combo"
  ].includes(item.itemType);
}

function isCombo(item) {
  return [
    "8 wings combo",
    "8 boneless combo",
    "half rack combo",
    "half rack and 4 bone in combo",
    "fish combo",
    "classic burger combo",
    "chicken sandwich combo",
    "flyin burger combo",
    "buffalo burger combo",
    "baked potato combo"
  ].includes(item.itemType);
}

function sauceSlotsAllowed(item) {
  if (item.itemType === "wings" || item.itemType === "boneless") {
    if (!item.quantity) return 0;
    if (item.quantity === 9) return 1;
    return Math.floor(item.quantity / 6);
  }

  if (item.itemType === "8 wings combo" || item.itemType === "8 boneless combo") return 1;
  if (item.itemType === "half rack combo") return 1;
  if (item.itemType === "half rack and 4 bone in combo") return 2;
  if (item.itemType === "pork belly") return 1;
  if (item.itemType === "corn ribs") return 1;
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
    return Math.floor(item.quantity / 6);
  }

  if (item.itemType === "8 wings combo" || item.itemType === "8 boneless combo") return 1;
  if (item.itemType === "half rack and 4 bone in combo") return 1;

  return 0;
}

function validWingQuantity(quantity) {
  return [6, 9, 12, 18, 24, 48].includes(Number(quantity));
}

function validWingSauceCount(quantity, saucesCount) {
  if (!validWingQuantity(quantity)) return false;

  if (quantity === 6 || quantity === 9) {
    return saucesCount <= 1;
  }

  if (quantity === 12) {
    return saucesCount <= 2;
  }

  return saucesCount <= sauceSlotsAllowed({ itemType: "wings", quantity });
}

function comboSideAllowed(item, side) {
  const allowedStandard = ["regular fries", "sweet potato fries", "potato salad"];

  if (["8 wings combo", "8 boneless combo", "half rack combo", "half rack and 4 bone in combo", "classic burger combo", "chicken sandwich combo", "flyin burger combo", "buffalo burger combo"].includes(item.itemType)) {
    return allowedStandard.includes(side);
  }

  if (item.itemType === "fish combo") {
    return [...allowedStandard, "tostones", "yuca fries"].includes(side);
  }

  return true;
}

function currentItemLabel(item, lang = "en") {
  if (lang === "es") {
    const map = {
      wings: "alitas con hueso",
      boneless: "boneless",
      ribs: item.size === "full rack" ? "rack completo de costillas korean style" : "medio rack de costillas korean style",
      "8 wings combo": "combo de 8 alitas",
      "8 boneless combo": "combo de 8 boneless",
      "half rack combo": "combo de medio rack",
      "half rack and 4 bone in combo": "combo de medio rack y 4 alitas",
      "fish combo": "combo de pescado",
      "classic burger combo": "classic burger combo",
      "chicken sandwich combo": "chicken sandwich combo",
      "flyin burger combo": "flyin burger combo",
      "buffalo burger combo": "buffalo burger combo",
      "baked potato combo": "combo de baked potato",
      "pork belly": "pork belly",
      "corn ribs": "corn ribs",
      "house salad": "house salad",
      "flyin salad": "flyin salad",
      "mac bites": "mac bites",
      "mozzarella sticks": "mozzarella sticks",
      "onion rings": "onion rings",
      "flyin fries": "flyin fries",
      "buffalo ranch fries": "buffalo ranch fries",
      "sampler platter": "sampler platter"
    };
    return map[item.itemType] || item.itemType;
  }

  const map = {
    wings: "bone-in wings",
    boneless: "boneless",
    ribs: item.size === "full rack" ? "full rack korean style ribs" : "half rack korean style ribs",
    "8 wings combo": "8 wings combo",
    "8 boneless combo": "8 boneless combo",
    "half rack combo": "half rack combo",
    "half rack and 4 bone in combo": "half rack and 4 bone in combo",
    "fish combo": "fish combo",
    "classic burger combo": "classic burger combo",
    "chicken sandwich combo": "chicken sandwich combo",
    "flyin burger combo": "flyin burger combo",
    "buffalo burger combo": "buffalo burger combo",
    "baked potato combo": "baked potato combo",
    "pork belly": "pork belly",
    "corn ribs": "corn ribs",
    "house salad": "house salad",
    "flyin salad": "flyin salad",
    "mac bites": "mac bites",
    "mozzarella sticks": "mozzarella sticks",
    "onion rings": "onion rings",
    "flyin fries": "flyin fries",
    "buffalo ranch fries": "buffalo ranch fries",
    "sampler platter": "sampler platter"
  };
  return map[item.itemType] || item.itemType;
}

function listSummary(list) {
  const counts = {};
  for (const value of list) counts[value] = (counts[value] || 0) + 1;
  return Object.entries(counts)
    .map(([name, count]) => `${count} ${name}`)
    .join(", ");
}

function summaryForItem(item, lang = "en") {
  const parts = [];

  if (isWingItem(item) && item.quantity) {
    parts.push(`${item.quantity} ${currentItemLabel(item, lang)}`);
  } else {
    parts.push(currentItemLabel(item, lang));
  }

  if (!isBurgerCombo(item)) {
    if (item.noSauce) {
      parts.push(lang === "es" ? "sin salsa" : "no sauce");
    } else if (item.sauces.length) {
      parts.push(item.sauces.join(lang === "es" ? " y " : " and "));
      if (item.sauceOnSide) {
        parts.push(lang === "es" ? "aparte" : "on the side");
      }
    }
  }

  if (item.dips.length && !isBurgerCombo(item)) {
    parts.push(lang === "es" ? `dips ${listSummary(item.dips)}` : `dips ${listSummary(item.dips)}`);
  }

  if (item.extraDips.length) {
    parts.push(lang === "es" ? `extra ${listSummary(item.extraDips)}` : `extra ${listSummary(item.extraDips)}`);
  }

  if (item.side) {
    const sideMapEs = {
      "regular fries": "papas",
      "sweet potato fries": "papas de camote",
      "potato salad": "ensalada de papa",
      "buffalo ranch fries": "buffalo ranch fries",
      "tostones": "tostones",
      "yuca fries": "papas de yuca"
    };
    parts.push(lang === "es" ? (sideMapEs[item.side] || item.side) : item.side);
  }

  if (item.protein) {
    const proteinMapEs = {
      chicken: "pollo",
      steak: "steak",
      "pork belly": "pork belly",
      "no protein": "sin proteína"
    };
    parts.push(lang === "es" ? (proteinMapEs[item.protein] || item.protein) : item.protein);
  }

  if (item.chickenStyle) {
    parts.push(lang === "es" ? (item.chickenStyle === "grilled" ? "pollo a la plancha" : "pollo frito") : `${item.chickenStyle} chicken`);
  }

  if (item.dressing) {
    parts.push(lang === "es" ? `aderezo ${item.dressing}` : `dressing ${item.dressing}`);
  }

  if (item.drizzle) {
    parts.push(lang === "es" ? `drizzle ${item.drizzle}` : `drizzle ${item.drizzle}`);
  }

  if (item.modifications.length) {
    const esMods = item.modifications.map((m) => m.replace(/^no /, "sin "));
    parts.push(lang === "es" ? esMods.join(", ") : item.modifications.join(", "));
  }

  return parts.join(", ");
}

function fullOrderSummary(state) {
  const lang = state.language === "es" ? "es" : "en";
  return state.items.map((item) => summaryForItem(item, lang)).join("; ");
}

function applyBuffaloBurgerDefaults(item) {
  item.itemType = "buffalo burger combo";
  item.notes.push("Use classic burger combo");
  item.notes.push("Remove mayo");
  item.notes.push("Sub ranch for mayo");
  item.notes.push("Add mild buffalo sauce on side with extra charge");
}

function missingField(item) {
  if (!item.itemType) return "item";

  if (isWingItem(item) && !item.quantity) return "quantity";

  if (item.itemType === "ribs" && !item.size) return "size";

  if (item.itemType === "baked potato combo" && !item.protein) return "protein";
  if (
    (item.itemType === "baked potato combo" && item.protein === "chicken" && !item.chickenStyle) ||
    (item.itemType === "chicken sandwich combo" && !item.chickenStyle) ||
    (item.itemType === "flyin burger combo" && !item.chickenStyle) ||
    (item.itemType === "flyin salad" && !item.chickenStyle)
  ) {
    return "chickenStyle";
  }

  if (sauceSlotsAllowed(item) > 0 && !item.noSauce && item.sauces.length === 0) return "sauce";

  if (dipSlotsAllowed(item) > 0 && item.dips.length < dipSlotsAllowed(item)) return "dip";

  if (item.itemType === "house salad" || item.itemType === "flyin salad") {
    if (!item.dressing) return "dressing";
  }

  if ([
    "8 wings combo",
    "8 boneless combo",
    "half rack combo",
    "half rack and 4 bone in combo",
    "fish combo",
    "classic burger combo",
    "chicken sandwich combo",
    "flyin burger combo",
    "buffalo burger combo"
  ].includes(item.itemType) && !item.side) {
    return "side";
  }

  if (item.itemType === "baked potato combo" && !item.drizzle) return "drizzle";

  return null;
}

function nextQuestion(state, item) {
  const field = missingField(item);

  if (field === "item") {
    return t(state, "What can I get started for you?", "¿Qué te preparo?");
  }

  if (field === "quantity") {
    return t(state, "How many would you like?", "¿Cuántas quieres?");
  }

  if (field === "size") {
    return t(state, "Half rack or full rack?", "¿Medio rack o rack completo?");
  }

  if (field === "protein") {
    return t(
      state,
      "For the baked potato combo: chicken, steak, pork belly, or no protein?",
      "Para el baked potato combo: ¿pollo, steak, pork belly o sin proteína?"
    );
  }

  if (field === "chickenStyle") {
    return t(state, "Grilled or fried?", "¿A la plancha o frito?");
  }

  if (field === "sauce") {
    if (item.itemType === "ribs" || item.itemType === "half rack combo") {
      return t(
        state,
        "What sauce would you like? Green chile, barbeque chiltepin, and mango habanero are popular.",
        "¿Qué salsa quieres? Green chile, barbeque chiltepin y mango habanero son de las más pedidas."
      );
    }

    if (item.itemType === "corn ribs") {
      return t(
        state,
        "What sauce would you like? Laim pepper and garlic parmesan are popular.",
        "¿Qué salsa quieres? Laim pepper y garlic parmesan son de las más pedidas."
      );
    }

    if (item.itemType === "pork belly") {
      return t(
        state,
        "What sauce would you like? Green chile and barbeque chiltepin are popular.",
        "¿Qué salsa quieres? Green chile y barbeque chiltepin son de las más pedidas."
      );
    }

    if (item.itemType === "baked potato combo") {
      return t(
        state,
        "What sauce would you like? Green chile is the most popular.",
        "¿Qué salsa quieres? Green chile es la más pedida."
      );
    }

    if (isWingItem(item)) {
      return t(
        state,
        `What sauce would you like? You can choose up to ${sauceSlotsAllowed(item)}.`,
        `¿Qué salsa quieres? Puedes escoger hasta ${sauceSlotsAllowed(item)}.`
      );
    }

    return t(state, "What sauce would you like?", "¿Qué salsa quieres?");
  }

  if (field === "dip") {
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

  if (field === "dressing") {
    return t(
      state,
      "What dressing would you like: ranch, blue cheese, chipotle ranch, or jalapeño ranch?",
      "¿Qué aderezo quieres: ranch, blue cheese, chipotle ranch o jalapeño ranch?"
    );
  }

  if (field === "side") {
    return t(
      state,
      "What side would you like: fries, sweet potato fries, or potato salad?",
      "¿Qué acompañante quieres: papas, papas de camote o ensalada de papa?"
    );
  }

  if (field === "drizzle") {
    return t(
      state,
      "What drizzle would you like on top: ranch, blue cheese, chipotle ranch, or jalapeño ranch?",
      "¿Qué drizzle quieres arriba: ranch, blue cheese, chipotle ranch o jalapeño ranch?"
    );
  }

  return t(state, "Anything else for this item?", "¿Algo más para este item?");
}

function comboUpsellOpportunity(item) {
  return (
    (item.itemType === "wings" && [6, 9].includes(Number(item.quantity))) ||
    (item.itemType === "boneless" && [6, 9].includes(Number(item.quantity))) ||
    (item.itemType === "ribs" && item.size === "half rack")
  );
}

function comboUpsellMessage(state, item) {
  if (!comboUpsellOpportunity(item)) return null;

  if (state.language === "es") {
    return "Eso lo puedes hacer combo con acompañante y bebida. ¿Lo quieres así?";
  }
  return "You can make that a combo with a side and drink. Want to do that?";
}

function finalizeCurrentItem(state) {
  state.items.push(JSON.parse(JSON.stringify(state.currentItem)));
  state.currentItem = blankItem();
}

function toolResult(name, toolCallId, result) {
  return {
    name,
    toolCallId,
    result: JSON.stringify(result)
  };
}

function okPayload(state, speak, extra = {}) {
  return {
    ok: true,
    language: state.language,
    customerName: state.customerName,
    currentItem: state.currentItem,
    orderSummary: fullOrderSummary(state),
    speak,
    ...extra
  };
}

function errorPayload(state, speak, extra = {}) {
  return {
    ok: false,
    language: state.language,
    customerName: state.customerName,
    currentItem: state.currentItem,
    orderSummary: fullOrderSummary(state),
    speak,
    ...extra
  };
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
          const itemType = canonicalItem(rawItem);
          const quantity = parameters.quantity != null ? Number(parameters.quantity) : null;
          const sizeInput = normalize(parameters.size || "");
          const sauces = unique((parameters.sauces || []).map(canonicalSauce));
          const dips = unique((parameters.dips || []).map(canonicalDip));
          const side = parameters.side ? canonicalSide(parameters.side) : null;
          const dressing = parameters.dressing ? canonicalDressing(parameters.dressing) : null;
          const protein = parameters.protein ? canonicalProtein(parameters.protein) : null;
          const chickenStyle = parameters.chickenStyle ? canonicalChickenStyle(parameters.chickenStyle) : null;
          const noSauce = Boolean(parameters.noSauce);
          const sauceOnSide = Boolean(parameters.sauceOnSide);

          if (!itemType) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "What item would you like?", "¿Qué item quieres?")
            )));
            break;
          }

          if (itemType === "half rack" || itemType === "full rack") {
            state.currentItem.itemType = "ribs";
            state.currentItem.size = itemType;
          } else if (itemType === "buffalo burger combo") {
            applyBuffaloBurgerDefaults(state.currentItem);
          } else {
            state.currentItem.itemType = itemType;
          }

          if (quantity != null) state.currentItem.quantity = quantity;
          if (sizeInput === "half rack" || sizeInput === "medio rack" || sizeInput === "media costilla") {
            state.currentItem.size = "half rack";
          }
          if (sizeInput === "full rack" || sizeInput === "rack completo") {
            state.currentItem.size = "full rack";
          }

          state.currentItem.sauces = sauces;
          state.currentItem.dips = dips;
          state.currentItem.side = side;
          state.currentItem.dressing = dressing;
          state.currentItem.protein = protein;
          state.currentItem.chickenStyle = chickenStyle;
          state.currentItem.noSauce = noSauce;
          state.currentItem.sauceOnSide = sauceOnSide;
          state.currentItem.drinkIncluded = isCombo(state.currentItem);

          if (isWingItem(state.currentItem)) {
            if (!validWingQuantity(state.currentItem.quantity)) {
              results.push(toolResult(name, toolCallId, errorPayload(
                state,
                t(state, "We have 6, 9, 12, 18, 24, or 48.", "Tenemos 6, 9, 12, 18, 24 o 48.")
              )));
              break;
            }

            if (!validWingSauceCount(state.currentItem.quantity, state.currentItem.sauces.length)) {
              results.push(toolResult(name, toolCallId, errorPayload(
                state,
                t(state, "That sauce count does not match the wing rules.", "Esa cantidad de salsas no coincide con las reglas de alitas.")
              )));
              break;
            }
          }

          const burgerPrompt =
            state.currentItem.itemType === "classic burger combo"
              ? t(
                  state,
                  "That comes with cheese, mayo, lettuce, onion, tomato, and pickles. Any changes?",
                  "Trae queso, mayo, lechuga, cebolla, tomate y pickles. ¿Algún cambio?"
                )
              : state.currentItem.itemType === "chicken sandwich combo"
              ? t(
                  state,
                  "That comes with cheese, mayo, lettuce, onion, tomato, and pickles. Any changes?",
                  "Trae queso, mayo, lechuga, cebolla, tomate y pickles. ¿Algún cambio?"
                )
              : state.currentItem.itemType === "flyin burger combo"
              ? t(
                  state,
                  "That comes with cheese, mayo, chipotle ranch, lettuce, onion, tomato, and pickles. Any changes?",
                  "Trae queso, mayo, chipotle ranch, lechuga, cebolla, tomate y pickles. ¿Algún cambio?"
                )
              : state.currentItem.itemType === "buffalo burger combo"
              ? t(
                  state,
                  "Perfect. That comes with cheese, buffalo sauce, ranch, lettuce, onion, tomato, and pickles. Any changes?",
                  "Perfecto. Trae queso, buffalo sauce, ranch, lechuga, cebolla, tomate y pickles. ¿Algún cambio?"
                )
              : null;

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            burgerPrompt || nextQuestion(state, state.currentItem),
            { comboUpsell: comboUpsellMessage(state, state.currentItem) }
          )));
          break;
        }

        case "set_quantity": {
          const quantity = Number(parameters.quantity);

          if (!isWingItem(state.currentItem)) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "This item does not use a wing quantity.", "Este item no usa cantidad de alitas.")
            )));
            break;
          }

          if (!validWingQuantity(quantity)) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "We have 6, 9, 12, 18, 24, or 48.", "Tenemos 6, 9, 12, 18, 24 o 48.")
            )));
            break;
          }

          state.currentItem.quantity = quantity;
          state.currentItem.sauces = [];
          state.currentItem.dips = [];

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            nextQuestion(state, state.currentItem),
            { comboUpsell: comboUpsellMessage(state, state.currentItem) }
          )));
          break;
        }

        case "set_size": {
          const rawSize = normalize(parameters.size || "");
          const size =
            rawSize.includes("full") || rawSize.includes("completo")
              ? "full rack"
              : rawSize.includes("half") || rawSize.includes("medio") || rawSize.includes("media")
              ? "half rack"
              : null;

          if (state.currentItem.itemType !== "ribs") {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "This item does not need a rack size.", "Este item no necesita tamaño de rack.")
            )));
            break;
          }

          if (!size) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "Half rack or full rack?", "¿Medio rack o rack completo?")
            )));
            break;
          }

          state.currentItem.size = size;

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            nextQuestion(state, state.currentItem),
            { comboUpsell: comboUpsellMessage(state, state.currentItem) }
          )));
          break;
        }

        case "set_sauces": {
          const noSauce = Boolean(parameters.noSauce);
          const sauceOnSide = Boolean(parameters.sauceOnSide);
          const sauces = unique((parameters.sauces || []).map(canonicalSauce));

          if (sauceSlotsAllowed(state.currentItem) === 0 && !isBurgerCombo(state.currentItem)) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "This item does not need a sauce selection.", "Este item no necesita selección de salsa.")
            )));
            break;
          }

          if (noSauce) {
            state.currentItem.noSauce = true;
            state.currentItem.sauces = [];
            state.currentItem.sauceOnSide = false;
          } else {
            if (!sauces.length) {
              results.push(toolResult(name, toolCallId, errorPayload(
                state,
                t(state, "What sauce would you like?", "¿Qué salsa quieres?")
              )));
              break;
            }

            if (isWingItem(state.currentItem) && !validWingSauceCount(state.currentItem.quantity, sauces.length)) {
              results.push(toolResult(name, toolCallId, errorPayload(
                state,
                t(state, "That sauce count does not match the wing rules.", "Esa cantidad de salsas no coincide con las reglas de alitas.")
              )));
              break;
            }

            if (sauces.length > sauceSlotsAllowed(state.currentItem)) {
              results.push(toolResult(name, toolCallId, errorPayload(
                state,
                t(state, `You can choose up to ${sauceSlotsAllowed(state.currentItem)} sauce${sauceSlotsAllowed(state.currentItem) > 1 ? "s" : ""}.`, `Puedes escoger hasta ${sauceSlotsAllowed(state.currentItem)} salsa${sauceSlotsAllowed(state.currentItem) > 1 ? "s" : ""}.`)
              )));
              break;
            }

            state.currentItem.noSauce = false;
            state.currentItem.sauces = sauces;
            state.currentItem.sauceOnSide = sauceOnSide;
          }

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_dips": {
          const dips = unique((parameters.dips || []).map(canonicalDip));

          if (dipSlotsAllowed(state.currentItem) === 0) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "This item does not need included dips.", "Este item no necesita dips incluidos.")
            )));
            break;
          }

          if (!dips.length) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "What dip would you like?", "¿Qué dip quieres?")
            )));
            break;
          }

          if (dips.length > dipSlotsAllowed(state.currentItem)) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, `You only get ${dipSlotsAllowed(state.currentItem)} dip${dipSlotsAllowed(state.currentItem) > 1 ? "s" : ""} included.`, `Solo te incluye ${dipSlotsAllowed(state.currentItem)} dip${dipSlotsAllowed(state.currentItem) > 1 ? "s" : ""}.`)
            )));
            break;
          }

          state.currentItem.dips = dips;

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "add_extra_dips": {
          const extraDips = unique((parameters.extraDips || []).map(canonicalDip));

          if (!extraDips.length) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "What extra dip would you like?", "¿Qué dip extra quieres?")
            )));
            break;
          }

          state.currentItem.extraDips = unique([...state.currentItem.extraDips, ...extraDips]);

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            t(state, "Got it.", "Listo.")
          )));
          break;
        }

        case "set_side": {
          const side = canonicalSide(parameters.side);

          if (!side) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "What side would you like?", "¿Qué acompañante quieres?")
            )));
            break;
          }

          if (!comboSideAllowed(state.currentItem, side)) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "That side is not available for this combo.", "Ese acompañante no está disponible para este combo.")
            )));
            break;
          }

          state.currentItem.side = side;

          if (state.currentItem.itemType === "buffalo ranch fries" && !state.currentItem.side) {
            state.currentItem.side = "regular fries";
          }

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_dressing": {
          const dressing = canonicalDressing(parameters.dressing);

          if (!dressing) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "What dressing would you like?", "¿Qué aderezo quieres?")
            )));
            break;
          }

          state.currentItem.dressing = dressing;

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_protein": {
          const protein = canonicalProtein(parameters.protein);

          if (state.currentItem.itemType !== "baked potato combo") {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "This item does not need a protein choice.", "Este item no necesita proteína.")
            )));
            break;
          }

          if (!protein) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "Chicken, steak, pork belly, or no protein?", "¿Pollo, steak, pork belly o sin proteína?")
            )));
            break;
          }

          state.currentItem.protein = protein;

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_chicken_style": {
          const chickenStyle = canonicalChickenStyle(parameters.chickenStyle);

          if (!chickenStyle) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "Grilled or fried?", "¿A la plancha o frito?")
            )));
            break;
          }

          state.currentItem.chickenStyle = chickenStyle;

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "set_baked_potato_drizzle": {
          const drizzle = canonicalDip(parameters.drizzle);

          if (state.currentItem.itemType !== "baked potato combo") {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "This item does not need a drizzle choice.", "Este item no necesita drizzle.")
            )));
            break;
          }

          if (!drizzle) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "What drizzle would you like on top?", "¿Qué drizzle quieres arriba?")
            )));
            break;
          }

          state.currentItem.drizzle = drizzle;

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "add_modification": {
          const modifications = unique(
            (parameters.modifications || [])
              .map(canonicalRemoval)
              .filter(Boolean)
          );

          if (!modifications.length) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "Tell me the change you want on it.", "Dime qué cambio quieres.")
            )));
            break;
          }

          state.currentItem.modifications = unique([...state.currentItem.modifications, ...modifications]);

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "add_note": {
          const note = String(parameters.note || "").trim();

          if (!note) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "What note should I add?", "¿Qué nota agrego?")
            )));
            break;
          }

          state.currentItem.notes.push(note);

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            t(state, "Got it.", "Listo.")
          )));
          break;
        }

        case "convert_current_item_to_combo": {
          if (state.currentItem.itemType === "wings" && [6, 9].includes(Number(state.currentItem.quantity))) {
            state.currentItem.itemType = "8 wings combo";
            state.currentItem.drinkIncluded = true;
          } else if (state.currentItem.itemType === "boneless" && [6, 9].includes(Number(state.currentItem.quantity))) {
            state.currentItem.itemType = "8 boneless combo";
            state.currentItem.drinkIncluded = true;
          } else if (state.currentItem.itemType === "ribs" && state.currentItem.size === "half rack") {
            state.currentItem.itemType = "half rack combo";
            state.currentItem.drinkIncluded = true;
          } else {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "That item cannot be converted to a supported combo here.", "Ese item no se puede convertir a un combo soportado aquí.")
            )));
            break;
          }

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            nextQuestion(state, state.currentItem)
          )));
          break;
        }

        case "finalize_current_item": {
          const missing = missingField(state.currentItem);

          if (missing) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              nextQuestion(state, state.currentItem),
              { missingField: missing }
            )));
            break;
          }

          finalizeCurrentItem(state);

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            t(state, "Perfect. What would you like to add next?", "Perfecto. ¿Qué más te agrego?")
          )));
          break;
        }

        case "set_customer_name": {
          const name = String(parameters.customerName || "").trim();

          if (!name) {
            results.push(toolResult(name, toolCallId, errorPayload(
              state,
              t(state, "What name should I put on the order?", "¿A nombre de quién pongo la orden?")
            )));
            break;
          }

          state.customerName = name;

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            t(state, "Got it.", "Listo.")
          )));
          break;
        }

        case "get_order_summary": {
          results.push(toolResult(name, toolCallId, okPayload(
            state,
            state.customerName
              ? t(
                  state,
                  `Perfect. I have ${fullOrderSummary(state)}, under ${state.customerName}. Everything look right?`,
                  `Perfecto. Tengo ${fullOrderSummary(state)}, a nombre de ${state.customerName}. ¿Todo está bien?`
                )
              : t(
                  state,
                  `So far I have ${fullOrderSummary(state)}.`,
                  `Hasta ahora tengo ${fullOrderSummary(state)}.`
                )
          )));
          break;
        }

        case "finalize_order": {
          if (state.currentItem.itemType) {
            const missing = missingField(state.currentItem);
            if (!missing) {
              finalizeCurrentItem(state);
            }
          }

          state.orderFinalized = true;

          results.push(toolResult(name, toolCallId, okPayload(
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

          results.push(toolResult(name, toolCallId, okPayload(
            state,
            t(state, "Okay, let’s start that item again.", "Está bien, vamos a empezar ese item otra vez.")
          )));
          break;
        }

        default: {
          results.push(toolResult(name, toolCallId, errorPayload(
            state,
            t(state, "That backend tool is not configured yet.", "Esa herramienta del backend todavía no está configurada.")
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
