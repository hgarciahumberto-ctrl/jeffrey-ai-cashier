// ===============================
// FLAPS & RACKS AI CASHIER BACKEND V1.9 FINAL ENGLISH EXTRAS
// Cart + Totals + Tucson Tax + Customer Memory + Transfer Message + POS Stub
// Fixes: canonical itemId normalization, final-total-only speak output,
// empty-cart finalize guard, baked potato dressing/drizzle handling,
// fish combo alias support, side upcharges, combo payload stability.
// ES MODULE VERSION FOR RAILWAY + VAPI
// ===============================

import express from "express";

const app = express();
app.use(express.json({ limit: "1mb" }));

const VERSION = "1.9-final-english-extras";
const PORT = process.env.PORT || 3000;
const TAX_RATE = Number(process.env.TAX_RATE || 0.087);
const RESTAURANT_PHONE = process.env.RESTAURANT_PHONE || "+15206582634";
const POS_MODE = process.env.POS_MODE || "stub";

const sessions = {};
const customers = {};
const transferMessages = [];

// ===============================
// MENU DATA
// ===============================

const SAUCES = [
  "al pastor",
  "barbeque",
  "barbeque chiltepin",
  "chorizo",
  "chocolate chiltepin",
  "cinnamon roll",
  "citrus chipotle",
  "garlic parmesan",
  "green chile",
  "buffalo hot",
  "lime pepper",
  "buffalo mild",
  "mango habanero",
  "pizza",
  "teriyaki",
  "flavor of the month"
];

const DIPS = ["ranch", "blue cheese", "chipotle ranch", "jalapeno ranch"];
const NO_DRESSING_VALUES = ["no dressing", "no drizzle", "none"];

const SIDE_CHOICES = [
  "regular fries",
  "sweet potato fries",
  "potato salad",
  "buffalo ranch fries",
  "tostones",
  "yuca fries"
];

const SIDE_UPGRADES = {
  "buffalo ranch fries": 1.5
};

const WING_PREFERENCE_UPCHARGES = {
  combo_8_wings: 0.75,
  wings_standalone: {
    6: 0.5,
    9: 1.0,
    12: 1.0,
    18: 1.25,
    24: 1.5,
    48: 2.5
  }
};

const BAKED_POTATO_DRESSINGS = [
  "ranch",
  "chipotle ranch",
  "jalapeno ranch"
];

const EXTRA_TOPPINGS = [
  "tomato",
  "lettuce",
  "pickles",
  "onion",
  "mayo",
  "cilantro",
  "parmesan",
  "green chile drizzle",
  "flyin sauce"
];

const EXTRA_ITEM_PRICES = {
  extra_dip: 0.75,
  extra_sauce: 0.75,
  extra_topping: 0.75,
  extra_cheese: 0.75,
  extra_marinara: 0.75,
  extra_sour_cream: 0.75,
  extra_beef_patty: 3.45,
  extra_grilled_chicken_patty: 3.99,
  extra_fried_chicken_patty: 3.99,
  extra_boneless_chicken: 3.99,
  extra_pork_belly: 5.99,
  extra_steak: 5.99
};

const MENU = {
  wings_standalone: {
    label: "Classic Wings",
    family: "wings",
    pricesByQuantity: {
      6: 10.1,
      9: 14.2,
      12: 18.3,
      18: 23.65,
      24: 30.65,
      48: 58.5
    },
    sauceLimitByQuantity: {
      6: 1,
      9: 1,
      12: 2,
      18: 3,
      24: 4,
      48: 8
    },
    dipLimitByQuantity: {
      6: 1,
      9: 1,
      12: 2,
      18: 3,
      24: 4,
      48: 8
    },
    requiredSlots: ["quantity", "sauces", "dips"]
  },

  boneless_standalone: {
    label: "Boneless",
    family: "boneless",
    pricesByQuantity: {
      6: 9.05,
      9: 13.35,
      12: 16.45,
      18: 22.65,
      24: 28.85,
      48: 56.85
    },
    sauceLimitByQuantity: {
      6: 1,
      9: 1,
      12: 2,
      18: 3,
      24: 4,
      48: 8
    },
    dipLimitByQuantity: {
      6: 1,
      9: 1,
      12: 2,
      18: 3,
      24: 4,
      48: 8
    },
    requiredSlots: ["quantity", "sauces", "dips"]
  },

  combo_8_wings: {
    label: "8 Classic Wings Combo",
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
    requiredSlots: [
      "sauces",
      "wingSauce",
      "wingDip",
      "sideChoice"
    ],
    drinkIncluded: "24oz soft drink"
  },

  combo_fish: {
    label: "4 Piece Fish Fry Combo",
    family: "combo",
    price: 12.65,
    requiredSlots: ["sideChoice"],
    drinkIncluded: "24oz soft drink"
  },

  classic_burger: {
    label: "Classic Burger",
    family: "burger",
    price: 8.85,
    ingredients: [
      "cheese",
      "mayo",
      "lettuce",
      "onion",
      "tomato",
      "pickles"
    ],
    requiredSlots: []
  },

  buffalo_burger: {
    label: "Buffalo Burger",
    family: "burger",
    price: 9.45,
    ingredients: [
      "cheese",
      "buffalo mild sauce",
      "ranch",
      "lettuce",
      "onion",
      "tomato",
      "pickles"
    ],
    requiredSlots: []
  },

  chicken_sandwich: {
    label: "Chicken Sandwich",
    family: "sandwich",
    price: 8.85,
    ingredients: [
      "cheese",
      "mayo",
      "lettuce",
      "onion",
      "tomato",
      "pickles"
    ],
    requiredSlots: ["chickenStyle"]
  },

  flyin_burger: {
    label: "Flyin’ Burger",
    family: "burger",
    price: 11.55,
    ingredients: [
      "beef patty with cheese",
      "chicken patty with cheese",
      "Flyin sauce",
      "mayo",
      "lettuce",
      "tomato",
      "onion",
      "pickles"
    ],
    requiredSlots: ["chickenStyle"]
  },

  combo_classic_burger: {
    label: "Classic Burger Combo",
    family: "combo",
    price: 13.55,
    requiredSlots: ["sideChoice"],
    drinkIncluded: "24oz soft drink"
  },

  combo_buffalo_burger: {
    label: "Buffalo Burger Combo",
    family: "combo",
    price: 13.55,
    requiredSlots: ["sideChoice"],
    drinkIncluded: "24oz soft drink",
    extraCharges: [
      {
        label: "buffalo sauce",
        amount: 0.75
      }
    ],
    kitchenNote:
      "Use classic burger combo base. Remove mayo. Sub ranch. Add buffalo sauce side charge."
  },

  combo_chicken_sandwich: {
    label: "Chicken Sandwich Combo",
    family: "combo",
    price: 12.35,
    requiredSlots: ["chickenStyle", "sideChoice"],
    drinkIncluded: "24oz soft drink"
  },

  combo_flyin_burger: {
    label: "Flyin’ Burger Combo",
    family: "combo",
    price: 16.65,
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
    requiredSlots: [
      "protein",
      "sauces",
      "drizzle",
      "drinkType"
    ],
    allowedDressings: BAKED_POTATO_DRESSINGS,
    drinkIncluded: "24oz soft drink"
  },

  house_salad: {
    label: "House Salad",
    family: "salad",
    price: 7.7,
    requiredSlots: ["dressing"]
  },

  flyin_salad: {
    label: "Flyin’ Salad",
    family: "salad",
    price: 11.3,
    requiredSlots: ["chickenStyle", "dressing"]
  },

  flyin_fries: {
    label: "Jr Flyin Fries",
    family: "loaded_fries",
    price: 9.85,
    ingredients: [
      "fries",
      "boneless",
      "ranch",
      "chipotle ranch",
      "buffalo drizzle"
    ],
    requiredSlots: []
  },

  pork_belly_fries: {
    label: "Pork Belly Fries",
    family: "loaded_fries",
    price: 12.25,
    ingredients: [
      "fries",
      "pork belly",
      "ranch",
      "green chile drizzle",
      "onion",
      "cilantro"
    ],
    requiredSlots: []
  },

  chicken_parmesan_fries: {
    label: "Chicken Parmesan Fries",
    family: "loaded_fries",
    price: 12.25,
    ingredients: [
      "fries",
      "fried chicken breast",
      "ranch",
      "marinara",
      "parmesan"
    ],
    requiredSlots: []
  },

  fries: {
    label: "Fries",
    family: "side",
    price: 4.15,
    requiredSlots: []
  },

  mac_bites: {
    label: "Mac Bites",
    family: "side",
    price: 7.25,
    dipLimit: 1,
    requiredSlots: ["dips"]
  },

  mozzarella_sticks: {
    label: "Mozzarella Sticks",
    family: "side",
    price: 7.25,
    includedAccompaniment: "marinara",
    requiredSlots: []
  },

  onion_rings: {
    label: "Onion Rings",
    family: "side",
    price: 7.25,
    includedAccompaniment: "ranch",
    requiredSlots: []
  },

  potato_salad: {
    label: "Potato Salad",
    family: "side",
    price: 2.99,
    requiredSlots: []
  },

  sweet_potato_fries: {
    label: "Sweet Potato Fries",
    family: "side",
    price: 4.95,
    requiredSlots: []
  },

  flyin_corn: {
    label: "Flyin’ Corn",
    family: "side",
    price: 5.9,
    ingredients: [
      "butter",
      "mayo",
      "parmesan",
      "lime zest",
      "tajin"
    ],
    requiredSlots: []
  },

  corn_ribs: {
    label: "Corn Ribs",
    family: "side",
    price: 6.45,
    sauceLimit: 1,
    requiredSlots: ["sauces"]
  },

  buffalo_ranch_fries: {
    label: "Buffalo Ranch Fries",
    family: "side",
    price: 8.25,
    requiredSlots: []
  },

  sampler_platter: {
    label: "Sampler Platter",
    family: "side",
    price: 15.65,
    ingredients: [
      "3 mac bites",
      "3 onion rings",
      "4 corn ribs",
      "3 mozzarella sticks",
      "sweet potato buffalo ranch fries"
    ],
    requiredSlots: ["cornRibsSauce"]
  },

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
    ingredients: ["cheese", "mayo"],
    requiredSlots: []
  },

  side_tostones: {
    label: "Side of Tostones",
    family: "side",
    price: 5.5,
    requiredSlots: []
  },

  side_yuca_fries: {
    label: "Side of Yuca Fries",
    family: "side",
    price: 4.99,
    requiredSlots: []
  },

  extra_dip: {
    label: "Extra Dipping Sauce",
    family: "extra",
    price: EXTRA_ITEM_PRICES.extra_dip,
    requiredSlots: ["dips"]
  },

  extra_sauce: {
    label: "Extra Sauce",
    family: "extra",
    price: EXTRA_ITEM_PRICES.extra_sauce,
    requiredSlots: ["sauces"]
  },

  extra_topping: {
    label: "Extra Topping",
    family: "extra",
    price: EXTRA_ITEM_PRICES.extra_topping,
    requiredSlots: ["extraSelection"]
  },

  extra_cheese: {
    label: "Extra Cheese",
    family: "extra",
    price: EXTRA_ITEM_PRICES.extra_cheese,
    requiredSlots: []
  },

  extra_marinara: {
    label: "Extra Marinara",
    family: "extra",
    price: EXTRA_ITEM_PRICES.extra_marinara,
    requiredSlots: []
  },

  extra_sour_cream: {
    label: "Extra Sour Cream",
    family: "extra",
    price: EXTRA_ITEM_PRICES.extra_sour_cream,
    requiredSlots: []
  },

  extra_beef_patty: {
    label: "Extra Beef Patty",
    family: "extra",
    price: EXTRA_ITEM_PRICES.extra_beef_patty,
    requiredSlots: []
  },

  extra_grilled_chicken_patty: {
    label: "Extra Grilled Chicken Patty",
    family: "extra",
    price: EXTRA_ITEM_PRICES.extra_grilled_chicken_patty,
    requiredSlots: []
  },

  extra_fried_chicken_patty: {
    label: "Extra Fried Chicken Patty",
    family: "extra",
    price: EXTRA_ITEM_PRICES.extra_fried_chicken_patty,
    requiredSlots: []
  },

  extra_boneless_chicken: {
    label: "Extra Boneless Chicken",
    family: "extra",
    price: EXTRA_ITEM_PRICES.extra_boneless_chicken,
    requiredSlots: []
  },

  extra_pork_belly: {
    label: "Extra Pork Belly",
    family: "extra",
    price: EXTRA_ITEM_PRICES.extra_pork_belly,
    requiredSlots: []
  },

  extra_steak: {
    label: "Extra Steak",
    family: "extra",
    price: EXTRA_ITEM_PRICES.extra_steak,
    requiredSlots: []
  },

  soft_drink_24oz: {
    label: "24oz Soft Drink",
    family: "drink",
    price: 2.99,
    requiredSlots: []
  },

  bottled_water: {
    label: "Bottled Water",
    family: "drink",
    price: 2,
    requiredSlots: []
  }
};

// ===============================
// HELPERS
// ===============================

function clean(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ");
}

function phraseKey(value = "") {
  return clean(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSpeak(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value.filter(
      (x) => x !== "" && x !== null && x !== undefined
    );
  }

  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return [];
  }

  return [value];
}

function speak(lang, en, es) {
  return lang === "es" ? es : en;
}

function getLanguage(payload = {}) {
  return clean(payload.language || payload.lang) === "es"
    ? "es"
    : "en";
}

function getSessionId(payload = {}) {
  const existing =
    payload.sessionId ||
    payload.callId ||
    payload.call?.id ||
    payload.message?.call?.id ||
    payload.message?.callId ||
    payload.message?.call?.sid;

  if (existing) {
    return existing;
  }

  return `manual-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
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

// ===============================
// NORMALIZATION
// ===============================

function normalizeSauce(value = "") {
  const sauce = phraseKey(value);

  const map = {
    bbq: "barbeque",
    barbecue: "barbeque",
    barbeque: "barbeque",
    "barbeque sauce": "barbeque",
    "barbecue sauce": "barbeque",
    "bbq sauce": "barbeque",
    barbiquiu: "barbeque",
    mild: "buffalo mild",
    "buffalo mild": "buffalo mild",
    "buffalo mild sauce": "buffalo mild",
    hot: "buffalo hot",
    "buffalo hot": "buffalo hot",
    "buffalo hot sauce": "buffalo hot",
    "lemon pepper": "lemon pepper",
    "lime pepper": "lime pepper",
    "laim pepper": "lime pepper",
    "green chili": "green chile",
    "green chile": "green chile",
    "bbq chiltepin": "barbeque chiltepin",
    "barbeque chiltepin": "barbeque chiltepin",
    "barbecue chiltepin": "barbeque chiltepin",
    "chiltepin bbq": "barbeque chiltepin",
    "garlic parm": "garlic parmesan",
    "garlic parmesan": "garlic parmesan",
    "garlic parmesan sauce": "garlic parmesan",
    teriyaki: "teriyaki",
    "teriyaki sauce": "teriyaki",
    teriaki: "teriyaki",
    teriyake: "teriyaki",
    "al pastor": "al pastor",
    chorizo: "chorizo",
    "chocolate chiltepin": "chocolate chiltepin",
    "cinnamon roll": "cinnamon roll",
    "citrus chipotle": "citrus chipotle",
    "mango habanero": "mango habanero",
    "mango habanero sauce": "mango habanero",
    pizza: "pizza",
    "flavor of the month": "flavor of the month"
  };

  return map[sauce] || sauce;
}

function normalizeDip(value = "") {
  const dip = phraseKey(value);

  const map = {
    ranch: "ranch",
    "ranch dressing": "ranch",
    "blue cheese": "blue cheese",
    "blue cheese dressing": "blue cheese",
    "blu chis": "blue cheese",
    "chipotle ranch": "chipotle ranch",
    "chipotle ranch dressing": "chipotle ranch",
    "jalapeno ranch": "jalapeno ranch",
    "jalapeno ranch dressing": "jalapeno ranch",
    "jalapeño ranch": "jalapeno ranch"
  };

  return map[dip] || dip;
}

function normalizeDressing(value = "") {
  const val = phraseKey(value);

  if (!val) {
    return "";
  }

  if (
    [
      "no",
      "none",
      "nothing",
      "no dressing",
      "no drizzle",
      "without dressing",
      "without drizzle"
    ].includes(val)
  ) {
    return "no drizzle";
  }

  return normalizeDip(val);
}

function normalizeSide(value = "") {
  const side = phraseKey(value);

  const map = {
    fries: "regular fries",
    papas: "regular fries",
    "regular fries": "regular fries",
    "papas regulares": "regular fries",
    "sweet potato fries": "sweet potato fries",
    "sweet fries": "sweet potato fries",
    "papas de camote": "sweet potato fries",
    "potato salad": "potato salad",
    "ensalada de papa": "potato salad",
    "buffalo ranch fries": "buffalo ranch fries",
    "buffalo fries": "buffalo ranch fries",
    tostones: "tostones",
    "fried plantains": "tostones",
    "yuca fries": "yuca fries",
    yuca: "yuca fries"
  };

  return map[side] || side;
}

function normalizeProtein(value = "") {
  const protein = phraseKey(value);

  const map = {
    chicken: "chicken",
    pollo: "chicken",
    steak: "steak",
    "carne asada": "steak",
    "pork belly": "pork belly",
    none: "no protein",
    "no protein": "no protein",
    "sin proteina": "no protein"
  };

  return map[protein] || protein;
}

function normalizeChickenStyle(value = "") {
  const style = phraseKey(value);

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
  const drink = phraseKey(value);

  const map = {
    soda: "soft drink",
    drink: "soft drink",
    "soft drink": "soft drink",
    coke: "Coke",
    coca: "Coke",
    "diet coke": "Diet Coke",
    sprite: "Sprite",
    lemonade: "lemonade",
    water: "bottled water",
    "bottled water": "bottled water",
    "botella de agua": "bottled water"
  };

  return map[drink] || cleanSpeak(value);
}

function normalizeSaucePlacement(
  value = "",
  itemId = ""
) {
  const placement = phraseKey(value);

  if (placement.includes("side")) {
    return "on the side";
  }

  if (
    placement.includes("on top") ||
    placement.includes("encima")
  ) {
    return "on top";
  }

  if (itemId === "combo_baked_potato") {
    return "on top";
  }

  return placement || "";
}

function detectQuantity(text = "") {
  const t = phraseKey(text);
  const match = t.match(/\b(48|24|18|12|9|8|6|4)\b/);

  return match ? Number(match[1]) : 0;
}

function extractSaucesFromText(text = "") {
  const t = phraseKey(text);
  const found = [];

  const saucePhrases = [
    "barbeque chiltepin",
    "barbecue chiltepin",
    "bbq chiltepin",
    "al pastor",
    "chocolate chiltepin",
    "cinnamon roll",
    "citrus chipotle",
    "garlic parmesan",
    "garlic parm",
    "green chile",
    "green chili",
    "buffalo mild",
    "buffalo hot",
    "mango habanero",
    "lime pepper",
    "lemon pepper",
    "flavor of the month",
    "barbeque",
    "barbecue",
    "bbq",
    "chorizo",
    "teriyaki",
    "pizza",
    "mild",
    "hot"
  ];

  for (const phrase of saucePhrases) {
    if (t.includes(phraseKey(phrase))) {
      const normalized = normalizeSauce(phrase);

      if (!found.includes(normalized)) {
        found.push(normalized);
      }
    }
  }

  return found;
}

function extractDipsFromText(text = "") {
  const t = phraseKey(text);
  const found = [];

  const dipPhrases = [
    "chipotle ranch",
    "jalapeno ranch",
    "jalapeño ranch",
    "blue cheese",
    "ranch"
  ];

  for (const phrase of dipPhrases) {
    if (t.includes(phraseKey(phrase))) {
      const normalized = normalizeDip(phrase);

      if (!found.includes(normalized)) {
        found.push(normalized);
      }
    }
  }

  return found;
}

function extractSideFromText(text = "") {
  const t = phraseKey(text);

  if (t.includes("buffalo ranch fries")) {
    return "buffalo ranch fries";
  }

  if (
    t.includes("tostones") ||
    t.includes("fried plantains")
  ) {
    return "tostones";
  }

  if (
    t.includes("yuca fries") ||
    t.includes("yuca")
  ) {
    return "yuca fries";
  }

  if (
    t.includes("sweet potato") ||
    t.includes("camote")
  ) {
    return "sweet potato fries";
  }

  if (
    t.includes("potato salad") ||
    t.includes("ensalada de papa")
  ) {
    return "potato salad";
  }

  if (
    t.includes("fries") ||
    t.includes("papas")
  ) {
    return "regular fries";
  }

  return "";
}

function normalizeItemId(value = "") {
  const raw = String(value || "").trim();

  if (MENU[raw]) {
    return raw;
  }

  const underscoreCandidate = phraseKey(raw)
    .replace(/\s+/g, "_");

  if (MENU[underscoreCandidate]) {
    return underscoreCandidate;
  }

  return normalizeItemIdFromText(raw);
}

function normalizeItemIdFromText(text = "") {
  const t = phraseKey(text);

  if (!t) {
    return "";
  }

  if (MENU[t.replace(/\s+/g, "_")]) {
    return t.replace(/\s+/g, "_");
  }

  if (
    t.includes("combo") &&
    t.includes("8") &&
    t.includes("boneless")
  ) {
    return "combo_8_boneless";
  }

  if (
    t.includes("combo") &&
    t.includes("8") &&
    (
      t.includes("wing") ||
      t.includes("alita") ||
      t.includes("bone in")
    )
  ) {
    return "combo_8_wings";
  }

  if (
    t.includes("half rack") &&
    (
      t.includes("4 bone") ||
      t.includes("four bone") ||
      t.includes("4 wing")
    )
  ) {
    return "combo_half_rack_4_bonein";
  }

  if (
    t.includes("half rack combo") ||
    t.includes("medio rack combo")
  ) {
    return "combo_half_rack";
  }

  if (
    t.includes("fish fry combo") ||
    t.includes("4 piece fish") ||
    t.includes("4 fish combo") ||
    t.includes("fish combo")
  ) {
    return "combo_fish";
  }

  if (t.includes("buffalo burger combo")) {
    return "combo_buffalo_burger";
  }

  if (t.includes("classic burger combo")) {
    return "combo_classic_burger";
  }

  if (t.includes("chicken sandwich combo")) {
    return "combo_chicken_sandwich";
  }

  if (
    t.includes("flyin burger combo") ||
    t.includes("flying burger combo")
  ) {
    return "combo_flyin_burger";
  }

  if (
    t.includes("extra dipping sauce") ||
    t.includes("extra dip")
  ) {
    return "extra_dip";
  }

  if (t.includes("extra sauce")) {
    return "extra_sauce";
  }

  if (t.includes("extra beef patty")) {
    return "extra_beef_patty";
  }

  if (t.includes("extra grilled chicken patty")) {
    return "extra_grilled_chicken_patty";
  }

  if (t.includes("extra fried chicken patty")) {
    return "extra_fried_chicken_patty";
  }

  if (
    t.includes("extra boneless chicken") ||
    t.includes("extra boneless")
  ) {
    return "extra_boneless_chicken";
  }

  if (t.includes("extra pork belly")) {
    return "extra_pork_belly";
  }

  if (t.includes("extra steak")) {
    return "extra_steak";
  }

  if (t.includes("extra cheese")) {
    return "extra_cheese";
  }

  if (t.includes("extra marinara")) {
    return "extra_marinara";
  }

  if (t.includes("extra sour cream")) {
    return "extra_sour_cream";
  }

  if (
    t.includes("extra topping") ||
    t.includes("extra tomato") ||
    t.includes("extra lettuce") ||
    t.includes("extra pickles") ||
    t.includes("extra onion") ||
    t.includes("extra mayo") ||
    t.includes("extra cilantro") ||
    t.includes("extra parmesan") ||
    t.includes("extra green chile drizzle") ||
    t.includes("extra flyin sauce")
  ) {
    return "extra_topping";
  }

  if (
    t.includes("side of tostones") ||
    t === "tostones"
  ) {
    return "side_tostones";
  }

  if (
    t.includes("side of yuca") ||
    t.includes("yuca fries")
  ) {
    return "side_yuca_fries";
  }

  if (t.includes("baked potato")) {
    return "combo_baked_potato";
  }

  if (t.includes("boneless")) {
    return "boneless_standalone";
  }

  if (
    t.includes("classic wings") ||
    t.includes("bone in") ||
    t.includes("traditional wings") ||
    t.includes("wings") ||
    t.includes("alitas")
  ) {
    return "wings_standalone";
  }

  if (t.includes("pork belly fries")) {
    return "pork_belly_fries";
  }

  if (t.includes("pork belly")) {
    return "pork_belly";
  }

  if (t.includes("full rack")) {
    return "ribs_full";
  }

  if (
    t.includes("half rack") ||
    t.includes("medio rack")
  ) {
    return "ribs_half";
  }

  if (t.includes("buffalo burger")) {
    return "buffalo_burger";
  }

  if (t.includes("classic burger")) {
    return "classic_burger";
  }

  if (t.includes("chicken sandwich")) {
    return "chicken_sandwich";
  }

  if (
    t.includes("flyin burger") ||
    t.includes("flying burger")
  ) {
    return "flyin_burger";
  }

  if (
    t.includes("flyin salad") ||
    t.includes("flying salad")
  ) {
    return "flyin_salad";
  }

  if (t.includes("house salad")) {
    return "house_salad";
  }

  if (t.includes("chicken parmesan fries")) {
    return "chicken_parmesan_fries";
  }

  if (t.includes("pork belly fries")) {
    return "pork_belly_fries";
  }

  if (
    t.includes("jr flyin fries") ||
    t.includes("junior flyin fries") ||
    t.includes("flyin fries") ||
    t.includes("flying fries")
  ) {
    return "flyin_fries";
  }

  if (t.includes("buffalo ranch fries")) {
    return "buffalo_ranch_fries";
  }

  if (t.includes("mac bites")) {
    return "mac_bites";
  }

  if (t.includes("mozzarella")) {
    return "mozzarella_sticks";
  }

  if (t.includes("onion rings")) {
    return "onion_rings";
  }

  if (t.includes("corn ribs")) {
    return "corn_ribs";
  }

  if (t.includes("flyin corn")) {
    return "flyin_corn";
  }

  if (t.includes("sampler")) {
    return "sampler_platter";
  }

  if (
    t.includes("kids") &&
    t.includes("boneless")
  ) {
    return "kids_boneless";
  }

  if (
    t.includes("kids") &&
    (
      t.includes("wings") ||
      t.includes("alitas")
    )
  ) {
    return "kids_wings";
  }

  if (
    t.includes("kids") &&
    t.includes("cheeseburger")
  ) {
    return "kids_cheeseburger";
  }

  if (t.includes("sweet potato fries")) {
    return "sweet_potato_fries";
  }

  if (t.includes("potato salad")) {
    return "potato_salad";
  }

  if (
    t.includes("fries") ||
    t.includes("papas")
  ) {
    return "fries";
  }

  return "";
}

function normalizeWingPreference(
  raw = {},
  combinedText = ""
) {
  const candidates = [
    raw.wingPreference,
    raw.piecePreference,
    ...asArray(raw.modifications),
    combinedText
  ]
    .filter(Boolean)
    .map(phraseKey);

  if (
    candidates.some(
      (value) =>
        value.includes("all flats") ||
        value.includes("only flats")
    )
  ) {
    return "all flats";
  }

  if (
    candidates.some(
      (value) =>
        value.includes("all drums") ||
        value.includes("all drummies") ||
        value.includes("only drums")
    )
  ) {
    return "all drums";
  }

  return "";
}

function normalizePayload(raw = {}) {
  const combinedText = [
    raw.text,
    raw.item,
    raw.itemId,
    raw.type,
    raw.name,
    raw.description
  ]
    .filter(Boolean)
    .join(" ");

  const itemId =
    normalizeItemId(raw.itemId || "") ||
    normalizeItemId(raw.item || "") ||
    normalizeItemIdFromText(combinedText);

  const def = MENU[itemId] || {};

  const saucesFromFields = asArray(raw.sauces)
    .map(normalizeSauce);

  const saucesFromText =
    extractSaucesFromText(combinedText);

  const sauces = [
    ...new Set([
      ...saucesFromFields,
      ...saucesFromText
    ])
  ].filter(Boolean);

  const dipsFromFields = asArray(raw.dips)
    .map(normalizeDip);

  const dipsFromText =
    extractDipsFromText(combinedText);

  const dips = [
    ...new Set([
      ...dipsFromFields,
      ...dipsFromText
    ])
  ].filter(Boolean);

  const rawDressing = raw.dressing || "";
  const rawDrizzle = raw.drizzle || "";

  let dressing = normalizeDressing(rawDressing);
  let drizzle = normalizeDressing(rawDrizzle);

  if (itemId === "combo_baked_potato") {
    if (!drizzle && dressing) {
      drizzle = dressing;
    }

    if (!dressing && drizzle) {
      dressing = drizzle;
    }

    if (
      !drizzle &&
      !dressing &&
      dips.length > 0
    ) {
      drizzle = dips[0];
      dressing = dips[0];
    }
  }

  const sideChoice = raw.sideChoice
    ? normalizeSide(raw.sideChoice)
    : extractSideFromText(combinedText);

  const quantity = def.pricesByQuantity
    ? Number(
        raw.quantity ||
        detectQuantity(combinedText) ||
        0
      )
    : def.family === "extra"
      ? Math.max(
          1,
          Number(raw.quantity || 1)
        )
      : 0;

  const modifications = asArray(
    raw.modifications
  )
    .map(String)
    .filter(Boolean);

  const wingPreference = normalizeWingPreference(
    {
      ...raw,
      modifications
    },
    combinedText
  );

  return {
    ...raw,
    language: getLanguage(raw),
    itemId,
    quantity,
    sauces,
    dips,
    sideChoice,
    protein: raw.protein
      ? normalizeProtein(raw.protein)
      : "",
    chickenStyle: raw.chickenStyle
      ? normalizeChickenStyle(raw.chickenStyle)
      : "",
    drinkType: raw.drinkType
      ? normalizeDrinkType(raw.drinkType)
      : "",
    dressing,
    drizzle,
    saucePlacement: normalizeSaucePlacement(
      raw.saucePlacement,
      itemId
    ),
    cornRibsSauce: raw.cornRibsSauce
      ? normalizeSauce(raw.cornRibsSauce)
      : "",
    wingSauce: raw.wingSauce
      ? normalizeSauce(raw.wingSauce)
      : "",
    wingDip: raw.wingDip
      ? normalizeDip(raw.wingDip)
      : "",
    wingPreference,
    extraSelection: phraseKey(
      raw.extraSelection ||
      raw.selection ||
      (
        itemId === "extra_topping"
          ? modifications[0] || ""
          : ""
      )
    ),
    modifications
  };
}

// ===============================
// VALIDATION AND PRICING
// ===============================

function fail(
  code,
  message,
  details = []
) {
  return {
    success: false,
    ok: false,
    speak: cleanSpeak(message),
    error: {
      code,
      message: cleanSpeak(message),
      details
    }
  };
}

function missingSlotMessage(slot, lang) {
  const messages = {
    quantity: speak(
      lang,
      "What quantity would you like: 6, 9, 12, 18, 24, or 48?",
      "¿Qué cantidad quieres: 6, 9, 12, 18, 24 o 48?"
    ),

    sauces: speak(
      lang,
      "What sauce would you like?",
      "¿Qué salsa quieres?"
    ),

    dips: speak(
      lang,
      "What dip would you like: ranch, blue cheese, chipotle ranch, or jalapeno ranch?",
      "¿Qué aderezo quieres: ranch, blue cheese, chipotle ranch o jalapeño ranch?"
    ),

    sideChoice: speak(
      lang,
      "What side would you like: regular fries, sweet potato fries, potato salad, or buffalo ranch fries?",
      "¿Qué acompañamiento quieres: papas regulares, papas de camote, ensalada de papa o buffalo ranch fries?"
    ),

    protein: speak(
      lang,
      "What protein would you like: chicken, steak, pork belly, or no protein?",
      "¿Qué proteína quieres: pollo, carne asada, pork belly o sin proteína?"
    ),

    chickenStyle: speak(
      lang,
      "Would you like the chicken grilled or fried?",
      "¿El pollo lo quieres a la parrilla o frito?"
    ),

    drinkType: speak(
      lang,
      "What drink would you like with that?",
      "¿Qué bebida quieres con eso?"
    ),

    dressing: speak(
      lang,
      "What dressing or drizzle would you like?",
      "¿Qué aderezo quieres encima?"
    ),

    drizzle: speak(
      lang,
      "What dressing or drizzle would you like?",
      "¿Qué aderezo quieres encima?"
    ),

    cornRibsSauce: speak(
      lang,
      "What sauce would you like for the corn ribs?",
      "¿Qué salsa quieres para los corn ribs?"
    ),

    wingSauce: speak(
      lang,
      "What sauce would you like for the wings?",
      "¿Qué salsa quieres para las alitas?"
    ),

    wingDip: speak(
      lang,
      "What dip would you like for the wings?",
      "¿Qué aderezo quieres para las alitas?"
    ),

    extraSelection: speak(
      lang,
      "Which extra topping would you like?",
      "¿Qué ingrediente extra quieres?"
    )
  };

  return (
    messages[slot] ||
    speak(
      lang,
      "Let me confirm that item one step at a time.",
      "Déjame confirmar ese producto paso a paso."
    )
  );
}

function slotMissing(item, slot) {
  if (slot === "quantity") {
    return !item.quantity;
  }

  if (slot === "sauces") {
    return (
      item.sauces.length === 0 &&
      item.saucePlacement !== "no sauce"
    );
  }

  if (slot === "dips") {
    return item.dips.length === 0;
  }

  if (slot === "sideChoice") {
    return !item.sideChoice;
  }

  if (slot === "protein") {
    return !item.protein;
  }

  if (slot === "chickenStyle") {
    return !item.chickenStyle;
  }

  if (slot === "drinkType") {
    return !item.drinkType;
  }

  if (slot === "dressing") {
    return !item.dressing;
  }

  if (slot === "drizzle") {
    return !item.drizzle;
  }

  if (slot === "cornRibsSauce") {
    return !item.cornRibsSauce;
  }

  if (slot === "wingSauce") {
    return !item.wingSauce;
  }

  if (slot === "wingDip") {
    return !item.wingDip;
  }

  if (slot === "extraSelection") {
    return !item.extraSelection;
  }

  return false;
}

function validateRequiredSlots(item, def) {
  const missing = [];

  for (const slot of def.requiredSlots || []) {
    if (slotMissing(item, slot)) {
      missing.push(slot);
    }
  }

  if (
    item.itemId === "combo_baked_potato" &&
    item.protein === "chicken" &&
    !item.chickenStyle
  ) {
    missing.push("chickenStyle");
  }

  return [...new Set(missing)];
}

function itemPrice(item, def) {
  if (def.pricesByQuantity) {
    return money(
      def.pricesByQuantity[item.quantity]
    );
  }

  if (def.pricesByProtein) {
    return money(
      def.pricesByProtein[item.protein]
    );
  }

  if (def.family === "extra") {
    return money(
      (def.price || 0) *
      Math.max(
        1,
        Number(item.quantity || 1)
      )
    );
  }

  return money(def.price || 0);
}

function validateItem(raw = {}) {
  const item = normalizePayload(raw);

  if (
    item.itemId === "combo_fish" &&
    !item.sideChoice
  ) {
    item.sideChoice = "regular fries";
  }

  const lang = item.language;
  const def = MENU[item.itemId];

  if (!def) {
    return fail(
      "INVALID_ITEM",
      speak(
        lang,
        "I am sorry, I do not see that item on our menu. What would you like to order?",
        "Lo siento, no veo ese producto en el menú. ¿Qué te gustaría ordenar?"
      ),
      [
        raw.itemId ||
        raw.item ||
        raw.text ||
        ""
      ]
    );
  }

  if (item.sauces.includes("lemon pepper")) {
    return fail(
      "CORRECTION_REQUIRED",
      speak(
        lang,
        "We have that as lime pepper. Is that okay?",
        "Aquí la tenemos como lime pepper, ¿está bien?"
      ),
      ["lemon pepper"]
    );
  }

  const missing = validateRequiredSlots(
    item,
    def
  );

  if (missing.length) {
    return fail(
      "MISSING_SLOT",
      missingSlotMessage(
        missing[0],
        lang
      ),
      missing
    );
  }

  if (
    def.family === "extra" &&
    (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    )
  ) {
    return fail(
      "INVALID_EXTRA_QUANTITY",
      speak(
        lang,
        "How many would you like?",
        "¿Cuántos quieres?"
      ),
      [item.quantity]
    );
  }

  if (
    item.itemId === "extra_topping" &&
    !EXTRA_TOPPINGS.includes(
      item.extraSelection
    )
  ) {
    return fail(
      "INVALID_EXTRA_TOPPING",
      speak(
        lang,
        "Available extra toppings are tomato, lettuce, pickles, onion, mayo, cilantro, parmesan, green chile drizzle, or Flyin sauce.",
        "Los ingredientes extra disponibles son tomate, lechuga, pepinillos, cebolla, mayonesa, cilantro, parmesano, green chile drizzle o Flyin sauce."
      ),
      [item.extraSelection]
    );
  }

  for (const sauce of item.sauces) {
    if (!SAUCES.includes(sauce)) {
      return fail(
        "INVALID_SAUCE",
        speak(
          lang,
          `I do not have ${sauce} as a sauce. What sauce would you like?`,
          `No tengo ${sauce} como salsa. ¿Qué salsa quieres?`
        ),
        [sauce]
      );
    }
  }

  for (const dip of item.dips) {
    if (!DIPS.includes(dip)) {
      return fail(
        "INVALID_DIP",
        speak(
          lang,
          `I do not have ${dip} as a dip. What dip would you like?`,
          `No tengo ${dip} como aderezo. ¿Qué aderezo quieres?`
        ),
        [dip]
      );
    }
  }

  for (
    const dipLike of [
      item.dressing,
      item.drizzle,
      item.wingDip
    ].filter(Boolean)
  ) {
    if (
      !DIPS.includes(dipLike) &&
      !NO_DRESSING_VALUES.includes(
        dipLike
      )
    ) {
      return fail(
        "INVALID_DRESSING",
        speak(
          lang,
          `I do not have ${dipLike} as a dressing. What dressing would you like?`,
          `No tengo ${dipLike} como aderezo. ¿Qué aderezo quieres?`
        ),
        [dipLike]
      );
    }
  }

  if (
    item.itemId === "combo_baked_potato"
  ) {
    const bakedPotatoDressing =
      item.drizzle ||
      item.dressing;

    if (
      bakedPotatoDressing &&
      !NO_DRESSING_VALUES.includes(
        bakedPotatoDressing
      ) &&
      !BAKED_POTATO_DRESSINGS.includes(
        bakedPotatoDressing
      )
    ) {
      return fail(
        "INVALID_BAKED_POTATO_DRESSING",
        speak(
          lang,
          "For the baked potato, the dressing choices are ranch, chipotle ranch, or jalapeno ranch.",
          "Para la papa, los aderezos son ranch, chipotle ranch o jalapeño ranch."
        ),
        [bakedPotatoDressing]
      );
    }
  }

  if (
    item.wingSauce &&
    !SAUCES.includes(item.wingSauce)
  ) {
    return fail(
      "INVALID_WING_SAUCE",
      speak(
        lang,
        `I do not have ${item.wingSauce} as a wing sauce. What sauce would you like for the wings?`,
        `No tengo ${item.wingSauce} como salsa para alitas. ¿Qué salsa quieres?`
      ),
      [item.wingSauce]
    );
  }

  if (
    item.cornRibsSauce &&
    !SAUCES.includes(
      item.cornRibsSauce
    )
  ) {
    return fail(
      "INVALID_CORN_RIBS_SAUCE",
      speak(
        lang,
        `I do not have ${item.cornRibsSauce} as a sauce. What sauce would you like for the corn ribs?`,
        `No tengo ${item.cornRibsSauce} como salsa. ¿Qué salsa quieres para los corn ribs?`
      ),
      [item.cornRibsSauce]
    );
  }

  if (
    def.pricesByQuantity &&
    !def.pricesByQuantity[item.quantity]
  ) {
    return fail(
      "INVALID_QUANTITY",
      speak(
        lang,
        "Available quantities are 6, 9, 12, 18, 24, or 48.",
        "Las cantidades disponibles son 6, 9, 12, 18, 24 o 48."
      ),
      [item.quantity]
    );
  }

  if (
    def.pricesByProtein &&
    !def.pricesByProtein[item.protein]
  ) {
    return fail(
      "INVALID_PROTEIN",
      speak(
        lang,
        "Protein choices are chicken, steak, pork belly, or no protein.",
        "Las proteínas son pollo, carne asada, pork belly o sin proteína."
      ),
      [item.protein]
    );
  }

  if (
    def.family !== "extra" &&
    def.sauceLimitByQuantity
  ) {
    const limit =
      def.sauceLimitByQuantity[
        item.quantity
      ];

    if (item.sauces.length > limit) {
      return fail(
        "TOO_MANY_SAUCES",
        speak(
          lang,
          `That order includes up to ${limit} sauce${limit > 1 ? "s" : ""}.`,
          `Esa orden incluye hasta ${limit} salsa${limit > 1 ? "s" : ""}.`
        ),
        item.sauces
      );
    }
  }

  if (
    def.family !== "extra" &&
    def.dipLimitByQuantity
  ) {
    const limit =
      def.dipLimitByQuantity[
        item.quantity
      ];

    if (item.dips.length > limit) {
      return fail(
        "TOO_MANY_DIPS",
        speak(
          lang,
          `That order includes up to ${limit} dip${limit > 1 ? "s" : ""}.`,
          `Esa orden incluye hasta ${limit} aderezo${limit > 1 ? "s" : ""}.`
        ),
        item.dips
      );
    }
  }

  if (
    def.family !== "extra" &&
    def.sauceLimit !== undefined &&
    item.sauces.length > def.sauceLimit
  ) {
    return fail(
      "TOO_MANY_SAUCES",
      speak(
        lang,
        `That item includes up to ${def.sauceLimit} sauce.`,
        `Ese producto incluye hasta ${def.sauceLimit} salsa.`
      ),
      item.sauces
    );
  }

  if (
    def.family !== "extra" &&
    def.dipLimit !== undefined &&
    item.dips.length > def.dipLimit
  ) {
    return fail(
      "TOO_MANY_DIPS",
      speak(
        lang,
        `That item includes up to ${def.dipLimit} dip.`,
        `Ese producto incluye hasta ${def.dipLimit} aderezo.`
      ),
      item.dips
    );
  }

  if (
    item.sideChoice &&
    !SIDE_CHOICES.includes(
      item.sideChoice
    )
  ) {
    return fail(
      "INVALID_SIDE",
      speak(
        lang,
        "Side choices are regular fries, sweet potato fries, potato salad, buffalo ranch fries, tostones, or yuca fries.",
        "Los acompañamientos son papas regulares, papas de camote, ensalada de papa, buffalo ranch fries, tostones o yuca fries."
      ),
      [item.sideChoice]
    );
  }

  const extraCharges = [];

  if (
    Array.isArray(def.extraCharges)
  ) {
    extraCharges.push(
      ...def.extraCharges
    );
  }

  if (
    item.sideChoice &&
    SIDE_UPGRADES[item.sideChoice]
  ) {
    extraCharges.push({
      label:
        "Buffalo Ranch Fries combo upgrade",
      amount:
        SIDE_UPGRADES[
          item.sideChoice
        ]
    });
  }

  if (
    item.wingPreference &&
    [
      "all flats",
      "all drums"
    ].includes(item.wingPreference)
  ) {
    let preferenceCharge = 0;

    if (
      item.itemId ===
      "combo_8_wings"
    ) {
      preferenceCharge =
        WING_PREFERENCE_UPCHARGES
          .combo_8_wings;
    }

    if (
      item.itemId ===
      "wings_standalone"
    ) {
      preferenceCharge =
        WING_PREFERENCE_UPCHARGES
          .wings_standalone[
            item.quantity
          ] || 0;
    }

    if (preferenceCharge > 0) {
      extraCharges.push({
        label: item.wingPreference,
        amount: preferenceCharge
      });
    }
  }

  const basePrice =
    itemPrice(item, def);

  const itemTotal = money(
    basePrice +
    extraCharges.reduce(
      (sum, charge) =>
        sum +
        Number(
          charge.amount || 0
        ),
      0
    )
  );

  return {
    success: true,
    ok: true,
    speak: speak(
      lang,
      "Perfect, I have that.",
      "Perfecto, lo tengo."
    ),
    item: {
      itemId: item.itemId,
      label: def.label,
      family: def.family,
      quantity: item.quantity,
      sauces: item.sauces,
      dips: item.dips,
      sideChoice: item.sideChoice,
      protein: item.protein,
      chickenStyle:
        item.chickenStyle,
      dressing: item.dressing,
      drizzle: item.drizzle,
      saucePlacement:
        item.saucePlacement,
      drinkType: item.drinkType,
      cornRibsSauce:
        item.cornRibsSauce,
      wingSauce: item.wingSauce,
      wingDip: item.wingDip,
      wingPreference:
        item.wingPreference,
      extraSelection:
        item.extraSelection,
      modifications:
        item.modifications,
      ingredients:
        def.ingredients || [],
      includedAccompaniment:
        def.includedAccompaniment ||
        "",
      kitchenNote:
        def.kitchenNote || "",
      drinkIncluded:
        def.drinkIncluded || "",
      basePrice,
      extraCharges,
      itemTotal
    }
  };
}

// ===============================
// CART AND SUMMARY
// ===============================

function cartTotals(items = []) {
  const subtotal = money(
    items.reduce(
      (sum, item) =>
        sum +
        Number(
          item.itemTotal || 0
        ),
      0
    )
  );

  const tax = money(
    subtotal * TAX_RATE
  );

  const total = money(
    subtotal + tax
  );

  return {
    subtotal,
    tax,
    total,
    taxRate: TAX_RATE,
    requiresPaymentBeforePreparation:
      total > 50
  };
}

function itemSummary(
  item,
  lang = "en"
) {
  const parts = [];

  if (
    item.quantity &&
    (
      item.family === "wings" ||
      item.family === "boneless" ||
      item.family === "extra"
    )
  ) {
    parts.push(
      `${item.quantity} ${item.label}`
    );
  } else {
    parts.push(item.label);
  }

  if (item.extraSelection) {
    parts.push(
      item.extraSelection
    );
  }

  if (item.sauces?.length) {
    parts.push(
      `${lang === "es" ? "salsa" : "sauce"} ${item.sauces.join(", ")}`
    );
  }

  if (item.dips?.length) {
    parts.push(
      `${lang === "es" ? "aderezo" : "dip"} ${item.dips.join(", ")}`
    );
  }

  if (item.wingSauce) {
    parts.push(
      `${lang === "es" ? "salsa de alitas" : "wing sauce"} ${item.wingSauce}`
    );
  }

  if (item.wingDip) {
    parts.push(
      `${lang === "es" ? "aderezo de alitas" : "wing dip"} ${item.wingDip}`
    );
  }

  if (item.wingPreference) {
    parts.push(
      item.wingPreference
    );
  }

  if (item.sideChoice) {
    parts.push(
      `${lang === "es" ? "acompañamiento" : "side"} ${item.sideChoice}`
    );
  }

  if (item.chickenStyle) {
    parts.push(
      item.chickenStyle
    );
  }

  if (item.protein) {
    parts.push(
      `${lang === "es" ? "proteína" : "protein"} ${item.protein}`
    );
  }

  if (
    item.drizzle &&
    !NO_DRESSING_VALUES.includes(
      item.drizzle
    )
  ) {
    parts.push(
      `${lang === "es" ? "aderezo" : "dressing"} ${item.drizzle}`
    );
  }

  if (item.drinkType) {
    parts.push(
      `${lang === "es" ? "bebida" : "drink"} ${item.drinkType}`
    );
  }

  if (
    item.modifications?.length
  ) {
    parts.push(
      `${lang === "es" ? "modificaciones" : "modifications"} ${item.modifications.join(", ")}`
    );
  }

  return parts.join(", ");
}

function cartSummary(
  cart,
  lang = "en"
) {
  if (!cart.items.length) {
    return speak(
      lang,
      "The cart is empty.",
      "La orden está vacía."
    );
  }

  const lines = cart.items.map(
    (item, index) =>
      `${index + 1}. ${itemSummary(item, lang)}`
  );

  return speak(
    lang,
    `Your order: ${lines.join("; ")}.`,
    `Tu orden: ${lines.join("; ")}.`
  );
}

// ===============================
// CUSTOMER MEMORY AND POS
// ===============================

function getCustomer(phone = "") {
  if (!phone) {
    return null;
  }

  return customers[phone] || null;
}

function updateCustomerMemory(
  phone,
  name,
  order
) {
  if (!phone) {
    return;
  }

  const current =
    customers[phone] || {
      phone,
      name: name || "",
      visits: 0,
      lastOrder: null,
      orders: []
    };

  current.name =
    name || current.name;

  current.visits += 1;
  current.lastOrder = order;

  current.orders.push({
    date:
      new Date().toISOString(),
    order
  });

  customers[phone] = current;
}

async function submitToPOS(order) {
  if (POS_MODE === "stub") {
    console.log(
      "POS STUB ORDER:",
      JSON.stringify(
        order,
        null,
        2
      )
    );

    return {
      success: true,
      mode: "stub",
      posOrderId:
        order.orderId,
      message:
        "Order prepared for POS submission."
    };
  }

  return {
    success: false,
    mode: POS_MODE,
    message:
      "SpotOn integration is not configured yet."
  };
}

// ===============================
// TRANSFER
// ===============================

function detectTransferIntent(
  text = ""
) {
  const t = phraseKey(text);

  const phrases = [
    "complaint",
    "queja",
    "manager",
    "gerente",
    "speak to someone",
    "talk to someone",
    "hablar con alguien",
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
    "not ordering",
    "no quiero ordenar"
  ];

  return phrases.some(
    (phrase) =>
      t.includes(
        phraseKey(phrase)
      )
  );
}

function transferResponse(lang) {
  return {
    success: true,
    ok: true,
    transfer: true,
    transferTo:
      RESTAURANT_PHONE,
    speak: speak(
      lang,
      "I can connect you with the restaurant so someone can help you.",
      "Te puedo transferir con el restaurante para que alguien te ayude."
    )
  };
}

// ===============================
// ACTION HANDLER
// ===============================

async function handleAction(
  payload = {}
) {
  const action = clean(
    payload.action ||
    "add_item"
  );

  const lang =
    getLanguage(payload);

  const sessionId =
    getSessionId(payload);

  const phone =
    getPhone(payload);

  const cart =
    ensureSession(
      sessionId,
      phone
    );

  if (
    payload.text &&
    detectTransferIntent(
      payload.text
    )
  ) {
    return transferResponse(lang);
  }

  if (
    action === "get_customer"
  ) {
    const customer =
      getCustomer(phone);

    return {
      success: true,
      ok: true,
      customer,
      speak: customer
        ? speak(
            lang,
            `Welcome back ${customer.name || ""}.`,
            `Bienvenido de nuevo ${customer.name || ""}.`
          )
        : speak(
            lang,
            "First time customer.",
            "Cliente nuevo."
          )
    };
  }

  if (
    action ===
    "set_customer_name"
  ) {
    cart.customerName =
      payload.customerName ||
      payload.name ||
      cart.customerName;

    return {
      success: true,
      ok: true,
      speak: speak(
        lang,
        "Thank you.",
        "Gracias."
      )
    };
  }

  if (
    action === "clear_cart"
  ) {
    cart.items = [];

    return {
      success: true,
      ok: true,
      cart,
      totals:
        cartTotals(
          cart.items
        ),
      speak: speak(
        lang,
        "The order has been cleared.",
        "La orden quedó borrada."
      )
    };
  }

  if (
    action === "get_cart"
  ) {
    return {
      success: true,
      ok: true,
      cart,
      totals:
        cartTotals(
          cart.items
        ),
      speak:
        cartSummary(
          cart,
          lang
        )
    };
  }

  if (
    action ===
    "transfer_message"
  ) {
    const message = {
      sessionId,
      phone,
      customerName:
        payload.customerName ||
        payload.name ||
        "",
      callbackPhone:
        payload.callbackPhone ||
        payload.phone ||
        "",
      reason:
        payload.reason ||
        payload.text ||
        "",
      language: lang,
      createdAt:
        new Date().toISOString()
    };

    transferMessages.push(
      message
    );

    return {
      success: true,
      ok: true,
      transferMessage:
        message,
      speak: speak(
        lang,
        "I saved that information and will connect you now.",
        "Guardé esa información y ahora te voy a conectar."
      )
    };
  }

  if (
    action ===
    "finalize_order"
  ) {
    if (!cart.items.length) {
      return fail(
        "EMPTY_CART",
        speak(
          lang,
          "I do not have any items in the order yet. What would you like to order?",
          "Todavía no tengo productos en la orden. ¿Qué te gustaría ordenar?"
        ),
        []
      );
    }

    cart.customerName =
      payload.customerName ||
      payload.name ||
      cart.customerName;

    const totals =
      cartTotals(
        cart.items
      );

    const orderId =
      `FR-${Date.now()
        .toString()
        .slice(-6)}`;

    const order = {
      orderId,
      sessionId,
      phone: cart.phone,
      customerName:
        cart.customerName || "",
      items: cart.items,
      totals,
      createdAt:
        new Date().toISOString(),
      orderType: "pickup"
    };

    const posResult =
      await submitToPOS(order);

    updateCustomerMemory(
      cart.phone,
      order.customerName,
      order
    );

    cart.status = "finalized";
    cart.orderId = orderId;

    const paymentLine =
      totals.requiresPaymentBeforePreparation
        ? speak(
            lang,
            " Because this order is over fifty dollars, payment is required before preparation.",
            " Como esta orden es de más de cincuenta dólares, requiere pago antes de prepararla."
          )
        : "";

    return {
      success: true,
      ok: true,
      order,
      posResult,
      totals,
      speak: speak(
        lang,
        `Thank you. Your pickup order has been placed. Your total is ${totals.total.toFixed(2)} dollars.${paymentLine}`,
        `Gracias. Tu orden para recoger quedó registrada. El total es ${totals.total.toFixed(2)} dólares.${paymentLine}`
      )
    };
  }

  const validation =
    validateItem(payload);

  if (!validation.success) {
    return validation;
  }

  cart.items.push(
    validation.item
  );

  const totals =
    cartTotals(
      cart.items
    );

  return {
    success: true,
    ok: true,
    item:
      validation.item,
    cart,
    totals,
    speak: speak(
      lang,
      "Perfect, I added it.",
      "Perfecto, lo agregué."
    )
  };
}

// ===============================
// VAPI HELPERS
// ===============================

function getVapiToolCalls(
  body = {}
) {
  const message =
    body.message || {};

  return (
    message.toolCalls ||
    message.toolCallList ||
    body.toolCalls ||
    []
  );
}

function getToolArguments(
  toolCall = {}
) {
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

  return (
    args &&
    typeof args === "object"
      ? args
      : {}
  );
}

function getToolCallId(
  toolCall = {}
) {
  return (
    toolCall.id ||
    toolCall.toolCallId ||
    toolCall.function?.id ||
    toolCall.functionCallId ||
    ""
  );
}

// ===============================
// ROUTES
// ===============================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service:
      "Flaps & Racks AI Cashier Backend",
    version: VERSION
  });
});

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true,
      version: VERSION,
      taxRate: TAX_RATE,
      restaurantPhone:
        RESTAURANT_PHONE,
      posMode: POS_MODE
    });
  }
);

app.get(
  "/transfer-messages",
  (req, res) => {
    res.json({
      ok: true,
      count:
        transferMessages.length,
      messages:
        transferMessages.slice(-50)
    });
  }
);

app.post(
  "/order",
  async (req, res) => {
    try {
      const toolCalls =
        getVapiToolCalls(
          req.body
        );

      if (
        toolCalls.length > 0
      ) {
        const results = [];

        const requestSessionId =
          getSessionId(
            req.body
          );

        const requestPhone =
          getPhone(
            req.body
          );

        for (
          const toolCall of toolCalls
        ) {
          const args =
            getToolArguments(
              toolCall
            );

          const enrichedArgs = {
            ...args,
            sessionId:
              args.sessionId ||
              requestSessionId,
            callId:
              args.callId ||
              requestSessionId,
            phone:
              args.phone ||
              requestPhone
          };

          console.log(
            "VAPI TOOL CALL ARGS:",
            JSON.stringify(
              enrichedArgs,
              null,
              2
            )
          );

          const result =
            await handleAction(
              enrichedArgs
            );

          console.log(
            "VAPI TOOL CALL RESULT:",
            JSON.stringify(
              result,
              null,
              2
            )
          );

          results.push({
            toolCallId:
              getToolCallId(
                toolCall
              ),
            result:
              cleanSpeak(
                result.speak ||
                "Okay."
              )
          });
        }

        return res.json({
          results
        });
      }

      const result =
        await handleAction(
          req.body || {}
        );

      return res.json({
        success:
          result.success,
        ok: result.ok,
        speak: result.speak,
        result: result.speak,
        item:
          result.item || null,
        cart:
          result.cart || null,
        totals:
          result.totals || null,
        customer:
          result.customer || null,
        order:
          result.order || null,
        posResult:
          result.posResult || null,
        transfer:
          result.transfer || false,
        transferTo:
          result.transferTo || null,
        transferMessage:
          result.transferMessage ||
          null,
        error:
          result.error || null
      });
    } catch (err) {
      console.error(
        "SERVER_ERROR",
        err
      );

      const speakMessage =
        "Let me confirm that one step at a time.";

      return res.json({
        success: false,
        ok: false,
        speak: speakMessage,
        result: speakMessage,
        error: {
          code: "SERVER_ERROR",
          message:
            err.message ||
            speakMessage
        }
      });
    }
  }
);

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Flaps & Racks AI Cashier backend ${VERSION} running on port ${PORT}`
    );
  }
);
