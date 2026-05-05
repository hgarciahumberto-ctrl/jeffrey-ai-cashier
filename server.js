// ===============================
// FLAPS & RACKS AI CASHIER BACKEND V1.4 WITH TAXES
// Cart + Totals + Tucson Tax + Customer Memory + Transfer Intent + POS Stub
// ES MODULE VERSION FOR RAILWAY + VAPI
// ===============================

import express from "express";

const app = express();
app.use(express.json({ limit: "1mb" }));

const VERSION = "1.4-cart-tax-memory-transfer";

// ===============================
// CONFIG
// ===============================

const PORT = process.env.PORT || 3000;

// Tucson combined 2026 rate: AZ 5.6% + Pima 0.5% + Tucson 2.6% = 8.7%
const TAX_RATE = Number(process.env.TAX_RATE || 0.087);

// Flaps physical phone number for escalation / transfer.
// Set in Railway as RESTAURANT_PHONE=+15206582634
const RESTAURANT_PHONE = process.env.RESTAURANT_PHONE || "+15206582634";

// Optional POS mode.
// "stub" = logs order only.
// Future: "spoton" once SpotOn API credentials/details are available.
const POS_MODE = process.env.POS_MODE || "stub";

// ===============================
// IN-MEMORY STORES
// NOTE: Good for pilot testing. For production, replace with Redis/Postgres.
// ===============================

const sessions = {};
const customers = {};

// ===============================
// MENU DATA
// ===============================

const MENU = {
  wings_standalone: {
    label: "Classic Wings",
    family: "wings",
    pricesByQuantity: { 6: 10.10, 9: 14.20, 12: 18.30, 18: 23.65, 24: 30.65, 48: 58.50 },
    sauceLimitByQuantity: { 6: 1, 9: 1, 12: 2, 18: 3, 24: 4, 48: 8 },
    dipLimitByQuantity: { 6: 1, 9: 1, 12: 2, 18: 3, 24: 4, 48: 8 },
    requiredSlots: ["quantity", "sauces", "dips"]
  },

  boneless_standalone: {
    label: "Boneless",
    family: "boneless",
    pricesByQuantity: { 6: 9.05, 9: 13.35, 12: 16.45, 18: 22.65, 24: 28.85, 48: 56.85 },
    sauceLimitByQuantity: { 6: 1, 9: 1, 12: 2, 18: 3, 24: 4, 48: 8 },
    dipLimitByQuantity: { 6: 1, 9: 1, 12: 2, 18: 3, 24: 4, 48: 8 },
    requiredSlots: ["quantity", "sauces", "dips"]
  },

  combo_8_wings: {
    label: "8 Wings Combo",
    family: "combo",
    price: 15.45,
    sauceLimit: 1,
    dipLimit: 1,
    requiredSlots: ["sauces", "dips", "sideChoice"],
    drinkIncluded: "24oz soft drink"
  },

  combo_8_boneless: {
    label: "8 Boneless Combo",
    family: "combo",
    price: 13.35,
    sauceLimit: 1,
    dipLimit: 1,
    requiredSlots: ["sauces", "dips", "sideChoice"],
    drinkIncluded: "24oz soft drink"
  },

  pork_belly: {
    label: "6 Piece Pork Belly",
    family: "pork_belly",
    price: 13.25,
    sauceLimit: 1,
    requiredSlots: ["sauces"]
  },

  ribs_half: {
    label: "Korean Style Ribs - Half Rack",
    family: "ribs",
    price: 13.25,
    sauceLimit: 1,
    requiredSlots: ["sauces"]
  },

  ribs_full: {
    label: "Korean Style Ribs - Full Rack",
    family: "ribs",
    price: 20.99,
    sauceLimit: 2,
    requiredSlots: ["sauces"]
  },

  combo_half_rack: {
    label: "Half Rack Combo",
    family: "combo",
    price: 15.35,
    sauceLimit: 1,
    requiredSlots: ["sauces", "sideChoice"],
    drinkIncluded: "24oz soft drink"
  },

  combo_half_rack_4_bonein: {
    label: "Half Rack and 4 Bone-In Combo",
    family: "combo",
    price: 19.65,
    sauceLimit: 1,
    requiredSlots: ["sauces", "wingSauce", "wingDip", "sideChoice"],
    drinkIncluded: "24oz soft drink"
  },

  combo_fish: {
    label: "4 Piece Fish & Fries Combo",
    family: "combo",
    price: 12.65,
    requiredSlots: ["sideChoice"],
    drinkIncluded: "24oz soft drink"
  },

  classic_burger: {
    label: "Classic Burger",
    family: "burger",
    price: 8.85,
    ingredients: ["queso", "mayonesa", "lechuga", "cebolla", "tomate", "pepinillos"],
    requiredSlots: []
  },

  buffalo_burger: {
    label: "Buffalo Burger",
    family: "burger",
    price: 9.45,
    ingredients: ["queso", "buffalo mild", "ranch", "lechuga", "cebolla", "tomate", "pepinillos"],
    requiredSlots: []
  },

  chicken_sandwich: {
    label: "Chicken Sandwich",
    family: "sandwich",
    price: 8.85,
    ingredients: ["queso", "mayonesa", "lechuga", "cebolla", "tomate", "pepinillos"],
    requiredSlots: ["chickenStyle"]
  },

  flyin_burger: {
    label: "Flyin’ Burger",
    family: "burger",
    price: 11.55,
    ingredients: ["carne con queso", "pollo con queso", "flyin sauce", "mayonesa", "lechuga", "cebolla", "tomate", "pepinillos"],
    requiredSlots: ["chickenStyle"]
  },

  combo_classic_burger: {
    label: "Classic Burger Combo",
    family: "combo",
    price: 13.55,
    ingredients: ["queso", "mayonesa", "lechuga", "cebolla", "tomate", "pepinillos"],
    requiredSlots: ["sideChoice"],
    drinkIncluded: "24oz soft drink"
  },

  combo_buffalo_burger: {
    label: "Buffalo Burger Combo",
    family: "combo",
    price: 13.55,
    ingredients: ["queso", "ranch", "buffalo mild", "lechuga", "cebolla", "tomate", "pepinillos"],
    requiredSlots: ["sideChoice"],
    drinkIncluded: "24oz soft drink",
    extraCharges: [{ label: "buffalo sauce", amount: 0.75 }],
    kitchenNote: "Classic burger combo base: remove mayo, sub ranch free, add buffalo sauce side charge."
  },

  combo_chicken_sandwich: {
    label: "Chicken Sandwich Combo",
    family: "combo",
    price: 12.35,
    ingredients: ["queso", "mayonesa", "lechuga", "cebolla", "tomate", "pepinillos"],
    requiredSlots: ["chickenStyle", "sideChoice"],
    drinkIncluded: "24oz soft drink"
  },

  combo_flyin_burger: {
    label: "Flyin’ Burger Combo",
    family: "combo",
    price: 16.65,
    ingredients: ["carne con queso", "pollo con queso", "flyin sauce", "mayonesa", "lechuga", "cebolla", "tomate", "pepinillos"],
    requiredSlots: ["chickenStyle", "sideChoice"],
    drinkIncluded: "24oz soft drink"
  },

  combo_baked_potato: {
    label: "Flyin’ Baked Potato Combo",
    family: "baked_potato",
    pricesByProtein: {
      chicken: 10.89,
      steak: 12.95,
      "pork belly": 12.95,
      "no protein": 4.99
    },
    sauceLimit: 1,
    requiredSlots: ["protein", "sauces", "drizzle", "saucePlacement", "drinkType"]
  },

  house_salad: {
    label: "House Salad",
    family: "salad",
    price: 7.70,
    ingredients: ["lechuga", "tomate cherry", "cebolla frita", "huevo cocido", "pepino"],
    requiredSlots: ["dressing"]
  },

  flyin_salad: {
    label: "Flyin’ Salad",
    family: "salad",
    price: 11.30,
    ingredients: ["lechuga", "tomate cherry", "cebolla frita", "tocino", "huevo cocido", "pepino", "pollo"],
    requiredSlots: ["chickenStyle", "dressing"]
  },

  flyin_fries: {
    label: "Flyin’ Fries",
    family: "loaded_fries",
    price: 9.85,
    ingredients: ["papas", "boneless", "ranch", "chipotle ranch", "buffalo drizzle"],
    requiredSlots: []
  },

  pork_belly_fries: {
    label: "Pork Belly Fries",
    family: "loaded_fries",
    price: 12.25,
    ingredients: ["papas", "pork belly", "ranch", "green chile drizzle", "cebolla", "cilantro"],
    requiredSlots: []
  },

  chicken_parmesan_fries: {
    label: "Chicken Parmesan Fries",
    family: "loaded_fries",
    price: 12.25,
    ingredients: ["papas", "pollo frito", "ranch", "marinara", "parmesan"],
    requiredSlots: []
  },

  fries: { label: "Fries", family: "side", price: 4.15, requiredSlots: [] },
  mac_bites: { label: "Mac Bites", family: "side", price: 7.25, dipLimit: 1, requiredSlots: ["dips"] },
  mozzarella_sticks: { label: "Mozzarella Sticks", family: "side", price: 7.25, requiredSlots: [] },
  onion_rings: { label: "Onion Rings", family: "side", price: 7.25, requiredSlots: [] },
  potato_salad: { label: "Potato Salad", family: "side", price: 2.99, requiredSlots: [] },
  sweet_potato_fries: { label: "Sweet Potato Fries", family: "side", price: 4.95, requiredSlots: [] },
  flyin_corn: { label: "Flyin’ Corn", family: "side", price: 5.90, requiredSlots: [] },
  corn_ribs: { label: "Corn Ribs", family: "side", price: 6.45, sauceLimit: 1, requiredSlots: ["sauces"] },
  buffalo_ranch_fries: { label: "Buffalo Ranch Fries", family: "side", price: 8.25, requiredSlots: [] },
  sampler_platter: { label: "Sampler Platter", family: "side", price: 15.65, requiredSlots: ["cornRibsSauce"] },

  kids_boneless: {
    label: "Kids 4 Boneless",
    family: "kids",
    price: 8.99,
    sauceLimit: 1,
    dipLimit: 1,
    requiredSlots: ["sauces", "dips"],
    drinkIncluded: "12oz soft drink"
  },

  kids_wings: {
    label: "Kids 4 Classic Wings",
    family: "kids",
    price: 9.49,
    sauceLimit: 1,
    dipLimit: 1,
    requiredSlots: ["sauces", "dips"],
    drinkIncluded: "12oz soft drink"
  },

  kids_cheeseburger: {
    label: "Kids Cheeseburger",
    family: "kids",
    price: 9.25,
    ingredients: ["queso", "mayonesa"],
    requiredSlots: []
  },

  soft_drink_24oz: { label: "24oz Soft Drink", family: "drink", price: 2.99, requiredSlots: [] },
  bottled_water: { label: "Bottled Water", family: "drink", price: 2.00, requiredSlots: [] }
};

const SAUCES = [
  "al pastor", "barbeque", "barbeque chiltepin", "chorizo", "chocolate chiltepin",
  "cinnamon roll", "citrus chipotle", "garlic parmesan", "green chile",
  "buffalo hot", "lime pepper", "buffalo mild", "mango habanero", "pizza",
  "teriyaki", "flavor of the month"
];

const DIPS = ["ranch", "blue cheese", "chipotle ranch", "jalapeno ranch"];
const SIDE_CHOICES = ["regular fries", "sweet potato fries", "potato salad", "buffalo ranch fries"];
const PROTEINS = ["chicken", "steak", "pork belly", "no protein"];
const CHICKEN_STYLES = ["grilled", "fried"];
const DRINK_TYPES = ["soft drink", "bottled water"];

// ===============================
// ALIASES
// ===============================

const ITEM_ALIASES = {
  wings: "wings_standalone",
  "classic wings": "wings_standalone",
  alitas: "wings_standalone",

  boneless: "boneless_standalone",
  "boneless wings": "boneless_standalone",

  "8 wings combo": "combo_8_wings",
  "combo de 8 alitas": "combo_8_wings",
  "8 boneless combo": "combo_8_boneless",
  "combo de 8 boneless": "combo_8_boneless",

  "pork belly": "pork_belly",
  "6 piezas de pork belly": "pork_belly",

  "half rack": "ribs_half",
  "medio rack": "ribs_half",
  "full rack": "ribs_full",
  "rack completo": "ribs_full",
  "half rack combo": "combo_half_rack",
  "combo medio rack": "combo_half_rack",

  "half rack and 4 bone in combo": "combo_half_rack_4_bonein",
  "medio rack con 4 alitas": "combo_half_rack_4_bonein",

  "fish combo": "combo_fish",

  "classic burger": "classic_burger",
  "hamburguesa classic": "classic_burger",
  "buffalo burger": "buffalo_burger",
  "chicken sandwich": "chicken_sandwich",
  "sandwich de pollo": "chicken_sandwich",
  "flyin burger": "flyin_burger",
  "flying burger": "flyin_burger",
  "flain burger": "flyin_burger",

  "classic burger combo": "combo_classic_burger",
  "combo classic burger": "combo_classic_burger",
  "buffalo burger combo": "combo_buffalo_burger",
  "chicken sandwich combo": "combo_chicken_sandwich",
  "combo chicken sandwich": "combo_chicken_sandwich",
  "flyin burger combo": "combo_flyin_burger",
  "flying burger combo": "combo_flyin_burger",

  "baked potato": "combo_baked_potato",
  "baked potato combo": "combo_baked_potato",

  "house salad": "house_salad",
  "haus salad": "house_salad",
  "jaus salad": "house_salad",
  "ensalada house": "house_salad",
  "ensalada haus": "house_salad",

  "flyin salad": "flyin_salad",
  "flying salad": "flyin_salad",
  "flain salad": "flyin_salad",
  "flayn salad": "flyin_salad",
  "flaing salad": "flyin_salad",
  "flane salad": "flyin_salad",
  "flyn salad": "flyin_salad",
  "fly salad": "flyin_salad",
  "ensalada flyin": "flyin_salad",
  "ensalada flain": "flyin_salad",
  "ensalada flayn": "flyin_salad",

  "flyin fries": "flyin_fries",
  "flying fries": "flyin_fries",
  "flain fries": "flyin_fries",
  "pork belly fries": "pork_belly_fries",
  "chicken parmesan fries": "chicken_parmesan_fries",

  fries: "fries",
  papas: "fries",
  "mac bites": "mac_bites",
  "mozzarella sticks": "mozzarella_sticks",
  "motsarela sticks": "mozzarella_sticks",
  "onion rings": "onion_rings",
  "potato salad": "potato_salad",
  "ensalada de papa": "potato_salad",
  "sweet potato fries": "sweet_potato_fries",
  "papas de camote": "sweet_potato_fries",
  "flyin corn": "flyin_corn",
  "corn ribs": "corn_ribs",
  "buffalo ranch fries": "buffalo_ranch_fries",
  sampler: "sampler_platter",
  "sampler platter": "sampler_platter",

  "kids boneless": "kids_boneless",
  "kids wings": "kids_wings",
  "kids classic wings": "kids_wings",
  "kids cheeseburger": "kids_cheeseburger",

  soda: "soft_drink_24oz",
  drink: "soft_drink_24oz",
  "soft drink": "soft_drink_24oz",
  water: "bottled_water",
  "bottled water": "bottled_water",
  "botella de agua": "bottled_water"
};

// ===============================
// HELPERS
// ===============================

function clean(value = "") {
  return String(value).trim().toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ");
}

function cleanSpeak(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function getLanguage(payload = {}) {
  return clean(payload.language || payload.lang) === "es" ? "es" : "en";
}

function normalizeItemId(value = "") {
  const raw = clean(value);
  const snake = raw.replace(/[\s-]+/g, "_");
  return MENU[snake] ? snake : ITEM_ALIASES[raw] || snake;
}

function normalizeSauce(value = "") {
  const sauce = clean(value);
  const map = {
    bbq: "barbeque",
    barbecue: "barbeque",
    barbeque: "barbeque",
    barbiquiu: "barbeque",

    mild: "buffalo mild",
    "buffalo mild": "buffalo mild",

    hot: "buffalo hot",
    "buffalo hot": "buffalo hot",

    "lemon pepper": "lemon pepper",
    "lime pepper": "lime pepper",
    "laim pepper": "lime pepper",

    "green chili": "green chile",
    "green chile": "green chile",

    "bbq chiltepin": "barbeque chiltepin",
    "barbiquiu chiltepin": "barbeque chiltepin",
    "barbiquiu chiltepín": "barbeque chiltepin",
    "barbecue chiltepin": "barbeque chiltepin",
    "barbeque chiltepin": "barbeque chiltepin",
    "chiltepin bbq": "barbeque chiltepin",

    "garlic parm": "garlic parmesan",
    "garlic parmesan": "garlic parmesan"
  };

  return map[sauce] || sauce;
}

function normalizeDip(value = "") {
  const dip = clean(value);
  const map = {
    "jalapeño ranch": "jalapeno ranch",
    "jalapeno ranch": "jalapeno ranch",
    "blue cheese": "blue cheese",
    "blu chis": "blue cheese",
    ranch: "ranch",
    "chipotle ranch": "chipotle ranch"
  };
  return map[dip] || dip;
}

function normalizeSide(value = "") {
  const side = clean(value);
  const map = {
    fries: "regular fries",
    papas: "regular fries",
    "papas regulares": "regular fries",
    "regular fries": "regular fries",
    "sweet potato fries": "sweet potato fries",
    "papas de camote": "sweet potato fries",
    "potato salad": "potato salad",
    "ensalada de papa": "potato salad",
    "buffalo ranch fries": "buffalo ranch fries"
  };
  return map[side] || side;
}

function normalizeProtein(value = "") {
  const protein = clean(value);
  const map = {
    pollo: "chicken",
    chicken: "chicken",
    steak: "steak",
    "carne asada": "steak",
    "pork belly": "pork belly",
    none: "no protein",
    "no protein": "no protein",
    "sin proteina": "no protein",
    "sin proteína": "no protein"
  };
  return map[protein] || protein;
}

function normalizeChickenStyle(value = "") {
  const style = clean(value);
  const map = {
    grilled: "grilled",
    parrilla: "grilled",
    "a la parrilla": "grilled",
    fried: "fried",
    frito: "fried",
    frita: "fried"
  };
  return map[style] || style;
}

function normalizeDrinkType(value = "") {
  const drink = clean(value);
  const map = {
    soda: "soft drink",
    "soft drink": "soft drink",
    drink: "soft drink",
    "bottled water": "bottled water",
    water: "bottled water",
    "botella de agua": "bottled water"
  };
  return map[drink] || drink;
}

function normalizeItem(raw = {}) {
  return {
    ...raw,
    language: getLanguage(raw),
    itemId: normalizeItemId(raw.itemId || raw.type || raw.item || ""),
    quantity: raw.quantity !== undefined && raw.quantity !== "" ? Number(raw.quantity) : undefined,
    sauces: asArray(raw.sauces).map(normalizeSauce).filter(Boolean),
    dips: asArray(raw.dips).map(normalizeDip).filter(Boolean),
    sideChoice: raw.sideChoice ? normalizeSide(raw.sideChoice) : undefined,
    protein: raw.protein ? normalizeProtein(raw.protein) : undefined,
    chickenStyle: raw.chickenStyle ? normalizeChickenStyle(raw.chickenStyle) : undefined,
    drizzle: raw.drizzle ? normalizeDip(raw.drizzle) : undefined,
    dressing: raw.dressing ? normalizeDip(raw.dressing) : undefined,
    drinkType: raw.drinkType ? normalizeDrinkType(raw.drinkType) : undefined,
    saucePlacement: raw.saucePlacement ? clean(raw.saucePlacement) : undefined,
    cornRibsSauce: raw.cornRibsSauce ? normalizeSauce(raw.cornRibsSauce) : undefined,
    wingSauce: raw.wingSauce ? normalizeSauce(raw.wingSauce) : undefined,
    wingDip: raw.wingDip ? normalizeDip(raw.wingDip) : undefined,
    modifications: asArray(raw.modifications).map(String)
  };
}

function speak(lang, en, es) {
  return lang === "es" ? es : en;
}

function getSessionId(payload = {}) {
  return (
    payload.sessionId ||
    payload.callId ||
    payload.call?.id ||
    payload.message?.call?.id ||
    payload.message?.callId ||
    "default-session"
  );
}

function getPhone(payload = {}) {
  return (
    payload.customerPhone ||
    payload.phone ||
    payload.callerPhone ||
    payload.message?.customer?.number ||
    payload.message?.phoneNumber?.number ||
    payload.message?.call?.customer?.number ||
    ""
  );
}

function ensureSession(sessionId, phone = "") {
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      sessionId,
      phone,
      customerName: "",
      items: [],
      createdAt: new Date().toISOString(),
      status: "active"
    };
  }

  if (phone && !sessions[sessionId].phone) {
    sessions[sessionId].phone = phone;
  }

  return sessions[sessionId];
}

function getCustomer(phone = "") {
  if (!phone) return null;
  return customers[phone] || null;
}

function updateCustomerMemory(phone, name, order) {
  if (!phone) return;

  const current = customers[phone] || {
    phone,
    name: name || "",
    visits: 0,
    lastOrder: null,
    orders: []
  };

  current.name = name || current.name;
  current.visits += 1;
  current.lastOrder = order;
  current.orders.push({
    date: new Date().toISOString(),
    order
  });

  customers[phone] = current;
}

// ===============================
// VALIDATION + PRICE
// ===============================

function buildError(code, message, details = []) {
  return {
    code,
    message: cleanSpeak(message),
    details: Array.isArray(details) ? details.map(cleanSpeak) : []
  };
}

function fail(code, message, details = []) {
  return {
    success: false,
    ok: false,
    speak: cleanSpeak(message),
    error: buildError(code, message, details)
  };
}

function itemPrice(item, def) {
  if (def.pricesByQuantity) return money(def.pricesByQuantity[item.quantity]);
  if (def.pricesByProtein) return money(def.pricesByProtein[item.protein]);
  return money(def.price || 0);
}

function validateRequiredSlots(item, def) {
  const missing = [];

  for (const slot of def.requiredSlots || []) {
    if (slot === "quantity" && !item.quantity) missing.push(slot);
    if (slot === "sauces" && item.sauces.length === 0 && item.saucePlacement !== "no sauce") missing.push(slot);
    if (slot === "dips" && item.dips.length === 0) missing.push(slot);
    if (slot === "sideChoice" && !item.sideChoice) missing.push(slot);
    if (slot === "protein" && !item.protein) missing.push(slot);
    if (slot === "chickenStyle" && !item.chickenStyle) missing.push(slot);
    if (slot === "drizzle" && !item.drizzle) missing.push(slot);
    if (slot === "drinkType" && !item.drinkType) missing.push(slot);
    if (slot === "dressing" && !item.dressing) missing.push(slot);
    if (slot === "cornRibsSauce" && !item.cornRibsSauce) missing.push(slot);
    if (slot === "wingSauce" && !item.wingSauce) missing.push(slot);
    if (slot === "wingDip" && !item.wingDip) missing.push(slot);
  }

  if (def.family === "baked_potato" && item.protein === "chicken" && !item.chickenStyle) {
    missing.push("chickenStyle");
  }

  return [...new Set(missing)];
}

function missingSlotMessage(slot, lang) {
  const messages = {
    quantity: speak(lang, "What quantity would you like: 6, 9, 12, 18, 24, or 48?", "¿Qué cantidad quieres: 6, 9, 12, 18, 24 o 48?"),
    sauces: speak(lang, "What sauce would you like?", "¿Qué salsa quieres?"),
    dips: speak(lang, "What dip would you like?", "¿Qué aderezo quieres?"),
    sideChoice: speak(lang, "What side would you like: regular fries, sweet potato fries, or potato salad?", "¿Qué prefieres de acompañamiento: papas regulares, papas de camote o ensalada de papa?"),
    protein: speak(lang, "What protein would you like: chicken, steak, pork belly, or no protein?", "¿Qué proteína quieres: pollo, carne asada, pork belly o sin proteína?"),
    chickenStyle: speak(lang, "Would you like the chicken grilled or fried?", "¿El pollo lo quieres a la parrilla o frito?"),
    drizzle: speak(lang, "What drizzle would you like?", "¿Qué aderezo quieres encima?"),
    drinkType: speak(lang, "Would you like a soft drink or bottled water?", "¿Quieres soda o botella de agua?"),
    dressing: speak(lang, "What dressing would you like?", "¿Qué aderezo quieres?"),
    cornRibsSauce: speak(lang, "What sauce would you like for the corn ribs?", "¿Qué salsa quieres para los corn ribs?"),
    wingSauce: speak(lang, "What sauce would you like for the wings?", "¿Qué salsa quieres para las alitas?"),
    wingDip: speak(lang, "What dip would you like for the wings?", "¿Qué aderezo quieres para las alitas?")
  };

  return messages[slot] || speak(lang, "Can you confirm that?", "¿Me confirmas ese dato?");
}

function validateItem(raw = {}) {
  const item = normalizeItem(raw);
  const lang = item.language;
  const def = MENU[item.itemId];

  if (!def) {
    return fail(
      "INVALID_ITEM",
      speak(lang, "I do not have that item in the menu. Can you repeat the item name?", "No tengo ese producto en el menú. ¿Me repites el nombre?"),
      [item.itemId]
    );
  }

  const missing = validateRequiredSlots(item, def);
  if (missing.length) {
    return fail("MISSING_SLOT", missingSlotMessage(missing[0], lang), missing);
  }

  if (item.sauces.includes("lemon pepper")) {
    return fail(
      "CORRECTION_REQUIRED",
      speak(lang, "We have that as lime pepper. Is that okay?", "Esa salsa aquí la tenemos como lime pepper. ¿Está bien?")
    );
  }

  for (const sauce of item.sauces) {
    if (!SAUCES.includes(sauce)) {
      return fail("INVALID_SAUCE", speak(lang, `We do not have ${sauce} as a sauce option.`, `No tenemos ${sauce} como salsa.`));
    }
  }

  for (const dip of item.dips) {
    if (!DIPS.includes(dip)) {
      return fail("INVALID_DIP", speak(lang, `We do not have ${dip} as a dip option.`, `No tenemos ${dip} como aderezo.`));
    }
  }

  if (def.pricesByQuantity && !def.pricesByQuantity[item.quantity]) {
    return fail(
      "INVALID_QUANTITY",
      speak(lang, "Available quantities are 6, 9, 12, 18, 24, or 48.", "Las cantidades disponibles son 6, 9, 12, 18, 24 o 48.")
    );
  }

  if (def.sauceLimitByQuantity) {
    const limit = def.sauceLimitByQuantity[item.quantity];
    if (item.sauces.length > limit) {
      return fail(
        "TOO_MANY_SAUCES",
        speak(lang, `That order includes up to ${limit} sauce${limit > 1 ? "s" : ""}.`, `Esa orden incluye hasta ${limit} salsa${limit > 1 ? "s" : ""}.`)
      );
    }

    if ((item.quantity === 6 || item.quantity === 9) && item.sauces.length > 1) {
      return fail(
        "SAUCE_SPLIT_NOT_ALLOWED",
        speak(lang, "For 6 or 9 pieces, we can only do one sauce.", "Para 6 o 9 piezas solo se puede una salsa.")
      );
    }
  }

  if (def.dipLimitByQuantity) {
    const limit = def.dipLimitByQuantity[item.quantity];
    if (item.dips.length > limit) {
      return fail(
        "TOO_MANY_DIPS",
        speak(lang, `That order includes up to ${limit} dip${limit > 1 ? "s" : ""}.`, `Esa orden incluye hasta ${limit} aderezo${limit > 1 ? "s" : ""}.`)
      );
    }
  }

  if (def.sauceLimit !== undefined && item.sauces.length > def.sauceLimit) {
    return fail(
      "TOO_MANY_SAUCES",
      speak(lang, `That order includes up to ${def.sauceLimit} sauce.`, `Esa orden incluye hasta ${def.sauceLimit} salsa.`)
    );
  }

  if (def.dipLimit !== undefined && item.dips.length > def.dipLimit) {
    return fail(
      "TOO_MANY_DIPS",
      speak(lang, `That order includes up to ${def.dipLimit} dip.`, `Esa orden incluye hasta ${def.dipLimit} aderezo.`)
    );
  }

  if (item.sideChoice && !SIDE_CHOICES.includes(item.sideChoice)) {
    return fail(
      "INVALID_SIDE",
      speak(lang, "Side choices are regular fries, sweet potato fries, or potato salad.", "Los acompañamientos son papas regulares, papas de camote o ensalada de papa.")
    );
  }

  if (item.protein && !PROTEINS.includes(item.protein)) {
    return fail(
      "INVALID_PROTEIN",
      speak(lang, "Protein choices are chicken, steak, pork belly, or no protein.", "Las opciones son pollo, carne asada, pork belly o sin proteína.")
    );
  }

  if (item.chickenStyle && !CHICKEN_STYLES.includes(item.chickenStyle)) {
    return fail(
      "INVALID_CHICKEN_STYLE",
      speak(lang, "Chicken must be grilled or fried.", "El pollo debe ser a la parrilla o frito.")
    );
  }

  if (item.drinkType && !DRINK_TYPES.includes(item.drinkType)) {
    return fail(
      "INVALID_DRINK_TYPE",
      speak(lang, "Drink choices are soft drink or bottled water.", "Las opciones son soda o botella de agua.")
    );
  }

  const extraCharges = [];
  if (Array.isArray(def.extraCharges)) {
    extraCharges.push(...def.extraCharges);
  }

  if (item.sideChoice === "buffalo ranch fries") {
    extraCharges.push({ label: "Buffalo Ranch Fries combo upgrade", amount: 1.50 });
  }

  const basePrice = itemPrice(item, def);
  const itemTotal = money(basePrice + extraCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0));

  const finalItem = {
    itemId: item.itemId,
    label: def.label,
    family: def.family,
    quantity: item.quantity,
    sauces: item.sauces,
    dips: item.dips,
    sideChoice: item.sideChoice,
    protein: item.protein,
    chickenStyle: item.chickenStyle,
    dressing: item.dressing,
    drizzle: item.drizzle,
    drinkType: item.drinkType,
    cornRibsSauce: item.cornRibsSauce,
    wingSauce: item.wingSauce,
    wingDip: item.wingDip,
    modifications: item.modifications,
    ingredients: def.ingredients || [],
    kitchenNote: def.kitchenNote || "",
    drinkIncluded: def.drinkIncluded || "",
    basePrice,
    extraCharges,
    itemTotal
  };

  return {
    success: true,
    ok: true,
    speak: speak(lang, "Perfect, I have that.", "Perfecto, lo tengo."),
    item: finalItem
  };
}

// ===============================
// CART + TOTALS
// ===============================

function cartTotals(items = []) {
  const subtotal = money(items.reduce((sum, item) => sum + Number(item.itemTotal || 0), 0));
  const tax = money(subtotal * TAX_RATE);
  const total = money(subtotal + tax);

  return {
    subtotal,
    tax,
    total,
    taxRate: TAX_RATE,
    requiresPaymentBeforePreparation: total > 50
  };
}

function itemSummary(item, lang = "en") {
  const parts = [];

  if (item.quantity && (item.family === "wings" || item.family === "boneless")) {
    parts.push(`${item.quantity} ${item.label}`);
  } else {
    parts.push(item.label);
  }

  if (item.chickenStyle) {
    parts.push(lang === "es" ? `pollo ${item.chickenStyle === "grilled" ? "a la parrilla" : "frito"}` : item.chickenStyle);
  }

  if (item.sauces?.length) parts.push(`salsa ${item.sauces.join(", ")}`);
  if (item.dips?.length) parts.push(`aderezo ${item.dips.join(", ")}`);
  if (item.dressing) parts.push(`aderezo ${item.dressing}`);
  if (item.sideChoice) parts.push(`acompañamiento ${item.sideChoice}`);

  return parts.filter(Boolean).join(", ");
}

function cartSummary(cart, lang = "en") {
  if (!cart.items.length) {
    return speak(lang, "The cart is empty.", "La orden está vacía.");
  }

  const totals = cartTotals(cart.items);
  const lines = cart.items.map((item, index) => `${index + 1}. ${itemSummary(item, lang)}`);

  if (lang === "es") {
    return `Tu orden: ${lines.join("; ")}. Subtotal ${totals.subtotal.toFixed(2)} dólares, impuesto ${totals.tax.toFixed(2)} dólares, total ${totals.total.toFixed(2)} dólares.`;
  }

  return `Your order: ${lines.join("; ")}. Subtotal ${totals.subtotal.toFixed(2)} dollars, tax ${totals.tax.toFixed(2)} dollars, total ${totals.total.toFixed(2)} dollars.`;
}

// ===============================
// POS STUB
// ===============================

async function submitToPOS(order) {
  if (POS_MODE === "stub") {
    console.log("POS STUB ORDER:", JSON.stringify(order, null, 2));
    return {
      success: true,
      mode: "stub",
      posOrderId: order.orderId,
      message: "Order prepared for POS submission."
    };
  }

  // SpotOn integration placeholder.
  // We need SpotOn API credentials, endpoint documentation, item IDs/modifier IDs.
  return {
    success: false,
    mode: POS_MODE,
    message: "SpotOn integration is not configured yet."
  };
}

// ===============================
// TRANSFER / NON-ORDER INTENT
// ===============================

function detectTransferIntent(text = "") {
  const t = clean(text);

  const phrases = [
    "complaint",
    "queja",
    "manager",
    "gerente",
    "speak to someone",
    "hablar con alguien",
    "lost item",
    "objeto perdido",
    "refund",
    "reembolso",
    "wrong order",
    "orden equivocada",
    "reservation",
    "reservacion",
    "reservación",
    "hours",
    "horario",
    "job",
    "trabajo",
    "application",
    "aplicacion",
    "aplicación",
    "non order",
    "not ordering",
    "no quiero ordenar"
  ];

  return phrases.some((phrase) => t.includes(phrase));
}

function transferResponse(lang) {
  return {
    success: true,
    ok: true,
    transfer: true,
    transferTo: RESTAURANT_PHONE,
    speak: speak(
      lang,
      "I can transfer you to the restaurant so someone can help you.",
      "Te puedo transferir al restaurante para que alguien te ayude."
    )
  };
}

// ===============================
// ACTION HANDLER
// ===============================

async function handleAction(payload = {}) {
  const action = clean(payload.action || payload.intent || "add_item");
  const lang = getLanguage(payload);
  const sessionId = getSessionId(payload);
  const phone = getPhone(payload);
  const cart = ensureSession(sessionId, phone);

  if (payload.text && detectTransferIntent(payload.text)) {
    return transferResponse(lang);
  }

  if (action === "get_customer") {
    const customer = getCustomer(phone);
    if (customer) {
      return {
        success: true,
        ok: true,
        customer,
        speak: speak(
          lang,
          `Welcome back ${customer.name || ""}. Would you like your last order?`,
          `Bienvenido de nuevo ${customer.name || ""}. ¿Quieres repetir tu última orden?`
        )
      };
    }

    return {
      success: true,
      ok: true,
      customer: null,
      speak: speak(lang, "First time customer.", "Cliente nuevo.")
    };
  }

  if (action === "set_customer_name") {
    cart.customerName = payload.customerName || payload.name || cart.customerName;
    return {
      success: true,
      ok: true,
      speak: speak(lang, "Thank you.", "Gracias.")
    };
  }

  if (action === "get_menu_item") {
    const itemId = normalizeItemId(payload.itemId || payload.item || payload.type || "");
    const def = MENU[itemId];

    if (!def) {
      return fail("INVALID_ITEM", speak(lang, "I do not have that item in the menu.", "No tengo ese producto en el menú."));
    }

    return {
      success: true,
      ok: true,
      itemId,
      item: def,
      speak: `${def.label}: ${def.ingredients?.join(", ") || "menu item"}`
    };
  }

  if (action === "clear_cart") {
    cart.items = [];
    return {
      success: true,
      ok: true,
      speak: speak(lang, "The order has been cleared.", "La orden quedó borrada.")
    };
  }

  if (action === "get_cart") {
    return {
      success: true,
      ok: true,
      cart,
      totals: cartTotals(cart.items),
      speak: cartSummary(cart, lang)
    };
  }

  if (action === "finalize_order") {
    const totals = cartTotals(cart.items);
    const orderId = `FR-${Date.now().toString().slice(-6)}`;

    const order = {
      orderId,
      sessionId,
      phone: cart.phone,
      customerName: cart.customerName || payload.customerName || payload.name || "",
      items: cart.items,
      totals,
      createdAt: new Date().toISOString(),
      orderType: "pickup"
    };

    const posResult = await submitToPOS(order);
    updateCustomerMemory(cart.phone, order.customerName, order);

    cart.status = "finalized";
    cart.orderId = orderId;

    const paymentLine = totals.requiresPaymentBeforePreparation
      ? speak(lang, "This order requires payment before preparation.", "Esta orden requiere pago antes de prepararla.")
      : "";

    return {
      success: true,
      ok: true,
      order,
      posResult,
      speak: speak(
        lang,
        `Order ${orderId} finalized. Total is ${totals.total.toFixed(2)} dollars. ${paymentLine}`,
        `Orden ${orderId} finalizada. El total es ${totals.total.toFixed(2)} dólares. ${paymentLine}`
      )
    };
  }

  // Default: add_item
  const validation = validateItem(payload);

  if (!validation.success) {
    return validation;
  }

  cart.items.push(validation.item);
  const totals = cartTotals(cart.items);

  return {
    success: true,
    ok: true,
    item: validation.item,
    cart,
    totals,
    speak: speak(
      lang,
      `Perfect, I added it. Current total is ${totals.total.toFixed(2)} dollars.`,
      `Perfecto, lo agregué. El total actual es ${totals.total.toFixed(2)} dólares.`
    )
  };
}

// ===============================
// VAPI HELPERS
// ===============================

function getVapiToolCalls(body = {}) {
  const message = body.message || {};
  return message.toolCalls || message.toolCallList || body.toolCalls || [];
}

function getToolArguments(toolCall = {}) {
  const args =
    toolCall.function?.arguments ??
    toolCall.arguments ??
    toolCall.parameters ??
    {};

  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }

  return args && typeof args === "object" ? args : {};
}

// ===============================
// ROUTES
// ===============================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Flaps & Racks AI Cashier Backend",
    version: VERSION
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    taxRate: TAX_RATE,
    restaurantPhone: RESTAURANT_PHONE,
    posMode: POS_MODE
  });
});

app.post("/order", async (req, res) => {
  try {
    const toolCalls = getVapiToolCalls(req.body);

    if (toolCalls.length > 0) {
      const results = [];

      for (const toolCall of toolCalls) {
        const args = getToolArguments(toolCall);
        const result = await handleAction(args);

        // VAPI SAFE:
        // Always return result, never error, so Vapi speaks corrections.
        results.push({
          toolCallId: toolCall.id,
          result: cleanSpeak(result.speak || "Okay.")
        });
      }

      return res.json({ results });
    }

    const result = await handleAction(req.body || {});

    return res.json({
      success: result.success,
      ok: result.ok,
      speak: result.speak,
      result: result.speak,
      item: result.item || null,
      cart: result.cart || null,
      totals: result.totals || null,
      customer: result.customer || null,
      order: result.order || null,
      posResult: result.posResult || null,
      transfer: result.transfer || false,
      transferTo: result.transferTo || null,
      error: result.error || null
    });
  } catch (err) {
    const speakMessage = "Server error.";

    return res.json({
      success: false,
      ok: false,
      speak: speakMessage,
      result: speakMessage,
      error: buildError("SERVER_ERROR", err.message || speakMessage)
    });
  }
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Flaps & Racks AI Cashier backend ${VERSION} running on port ${PORT}`);
});
