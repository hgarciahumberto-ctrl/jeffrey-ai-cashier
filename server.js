// ===============================
// FLAPS & RACKS AI CASHIER BACKEND V1.0
// ===============================

const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// ===============================
// MENU DATA (CORE TRUTH)
// ===============================

const MENU = {
  wings: {
    sizes: [6, 9, 12, 18, 24, 48],
    sauceLimit: { 6:1, 9:1, 12:2, 18:3, 24:4, 48:8 },
    dipLimit: { 6:1, 9:1, 12:2, 18:3, 24:4, 48:8 }
  },

  boneless: {
    sizes: [6, 9, 12, 18, 24, 48],
    sauceLimit: { 6:1, 9:1, 12:2, 18:3, 24:4, 48:8 },
    dipLimit: { 6:1, 9:1, 12:2, 18:3, 24:4, 48:8 }
  },

  sauces: [
    "barbeque",
    "teriyaki",
    "cinnamon roll",
    "barbeque chiltepin",
    "mango habanero",
    "citrus chipotle",
    "chocolate chiltepin",
    "mild",
    "hot",
    "lime pepper",
    "garlic parmesan",
    "pizza",
    "chorizo",
    "al pastor",
    "green chile"
  ],

  dips: [
    "ranch",
    "blue cheese",
    "chipotle ranch",
    "jalapeño ranch"
  ],

  pricing: {
    extraSauce: 0.75,
    buffaloRanchUpgrade: 1.50
  }
};

// ===============================
// VALIDATOR ENGINE
// ===============================

function validateOrder(item) {
  let errors = [];

  // Wings / Boneless validation
  if (item.type === "wings" || item.type === "boneless") {
    const { quantity, sauces = [], dips = [] } = item;

    if (!MENU.wings.sizes.includes(quantity)) {
      errors.push("Invalid quantity");
    }

    const maxSauces = MENU.wings.sauceLimit[quantity];
    const maxDips = MENU.wings.dipLimit[quantity];

    if (sauces.length > maxSauces) {
      errors.push(`Too many sauces. Max allowed: ${maxSauces}`);
    }

    if (dips.length > maxDips) {
      errors.push(`Too many dips. Max allowed: ${maxDips}`);
    }

    if ((quantity === 6 || quantity === 9) && sauces.length > 1) {
      errors.push("Cannot split sauces for 6 or 9 wings");
    }
  }

  // Lemon pepper correction
  if (item.sauces) {
    item.sauces = item.sauces.map(s => {
      if (s === "lemon pepper") {
        throw new Error("We have that as lime pepper. Is that okay?");
      }
      return s;
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ===============================
// APPLY MENU RULES
// ===============================

function applyMenuRules(item) {

  // Default: sauce mixed
  if (!item.saucePlacement) {
    item.saucePlacement = "mixed";
  }

  // Buffalo Burger Combo rule
  if (item.type === "buffalo_burger_combo") {
    item.modifications = [
      { remove: "mayo" },
      { add: "ranch", price: 0 },
      { add: "buffalo sauce", price: 0.75 }
    ];

    item.kitchenNote = "Sub ranch for mayo + buffalo sauce side charge";
  }

  return item;
}

// ===============================
// MAIN TOOL HANDLER (VAPI)
// ===============================

app.post("/order", (req, res) => {
  try {
    let item = req.body;

    // Validate
    const validation = validateOrder(item);

    if (!validation.valid) {
      return res.json({
        success: false,
        message: validation.errors[0]
      });
    }

    // Apply rules
    const finalItem = applyMenuRules(item);

    return res.json({
      success: true,
      item: finalItem,
      message: "Item added successfully"
    });

  } catch (error) {
    return res.json({
      success: false,
      message: error.message || "Unexpected error"
    });
  }
});

// ===============================
// SERVER START
// ===============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`AI Cashier running on port ${PORT}`);
});
