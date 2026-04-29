// ===============================
// FLAPS & RACKS AI CASHIER BACKEND V1.0
// ES MODULE VERSION FOR RAILWAY
// ===============================

import express from "express";

const app = express();
app.use(express.json());

// ===============================
// MENU DATA
// ===============================

const MENU = {
  wings: {
    sizes: [6, 9, 12, 18, 24, 48],
    sauceLimit: { 6: 1, 9: 1, 12: 2, 18: 3, 24: 4, 48: 8 },
    dipLimit: { 6: 1, 9: 1, 12: 2, 18: 3, 24: 4, 48: 8 }
  },

  boneless: {
    sizes: [6, 9, 12, 18, 24, 48],
    sauceLimit: { 6: 1, 9: 1, 12: 2, 18: 3, 24: 4, 48: 8 },
    dipLimit: { 6: 1, 9: 1, 12: 2, 18: 3, 24: 4, 48: 8 }
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
// NORMALIZATION
// ===============================

function normalizeText(value = "") {
  return String(value).trim().toLowerCase();
}

function normalizeSauce(value = "") {
  const sauce = normalizeText(value);

  const aliases = {
    "bbq": "barbeque",
    "barbecue": "barbeque",
    "barbeque": "barbeque",
    "buffalo mild": "mild",
    "buffalo hot": "hot",
    "lemon pepper": "lemon pepper",
    "lime pepper": "lime pepper"
  };

  return aliases[sauce] || sauce;
}

// ===============================
// VALIDATOR ENGINE
// ===============================

function validateOrder(item = {}) {
  const errors = [];

  const type = normalizeText(item.type);
  const quantity = Number(item.quantity);
  const sauces = Array.isArray(item.sauces) ? item.sauces.map(normalizeSauce) : [];
  const dips = Array.isArray(item.dips) ? item.dips.map(normalizeText) : [];

  if (sauces.includes("lemon pepper")) {
    return {
      valid: false,
      correctionRequired: true,
      message: "We have that as lime pepper. Is that okay?"
    };
  }

  if (type === "wings" || type === "classic_wings" || type === "boneless") {
    const rules = type === "boneless" ? MENU.boneless : MENU.wings;

    if (!rules.sizes.includes(quantity)) {
      errors.push("That quantity is not available. Available sizes are 6, 9, 12, 18, 24, and 48.");
    }

    const maxSauces = rules.sauceLimit[quantity];
    const maxDips = rules.dipLimit[quantity];

    if (maxSauces && sauces.length > maxSauces) {
      errors.push(`That order includes up to ${maxSauces} sauce${maxSauces > 1 ? "s" : ""}.`);
    }

    if (maxDips && dips.length > maxDips) {
      errors.push(`That order includes up to ${maxDips} dip${maxDips > 1 ? "s" : ""}.`);
    }

    if ((quantity === 6 || quantity === 9) && sauces.length > 1) {
      errors.push("For 6 or 9 wings, we can only do one sauce. We can mix two sauces together for an extra sauce charge, but we cannot split them.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    message: errors[0] || "Valid order item."
  };
}

// ===============================
// APPLY MENU RULES
// ===============================

function applyMenuRules(item = {}) {
  const type = normalizeText(item.type);
  const finalItem = { ...item };

  if (!finalItem.saucePlacement) {
    finalItem.saucePlacement = "mixed";
  }

  if (type === "buffalo_burger_combo") {
    finalItem.baseItem = "classic_burger_combo";
    finalItem.modifications = [
      { action: "remove", item: "mayo", price: 0 },
      { action: "add", item: "ranch", price: 0 },
      { action: "add", item: "buffalo sauce", price: 0.75 }
    ];
    finalItem.kitchenNote = "Sub ranch for mayo + buffalo sauce side charge";
  }

  return finalItem;
}

// ===============================
// ROUTES
// ===============================

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Flaps & Racks AI Cashier Backend",
    version: "1.0-esm"
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/order", (req, res) => {
  try {
    const item = req.body || {};

    const validation = validateOrder(item);

    if (!validation.valid) {
      return res.json({
        success: false,
        message: validation.message || validation.errors?.[0] || "Invalid order item.",
        errors: validation.errors || []
      });
    }

    const finalItem = applyMenuRules(item);

    return res.json({
      success: true,
      item: finalItem,
      message: "Item added successfully."
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unexpected server error."
    });
  }
});

// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Flaps & Racks AI Cashier backend running on port ${PORT}`);
});
