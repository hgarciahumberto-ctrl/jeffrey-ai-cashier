// ===============================
// FLAPS & RACKS AI CASHIER BACKEND V1.1
// ES MODULE VERSION FOR RAILWAY + VAPI TOOL FORMAT
// ===============================

import express from "express";

const app = express();
app.use(express.json());

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

  pricing: {
    extraSauce: 0.75,
    extraDip: 0.75,
    buffaloRanchUpgrade: 1.5
  }
};

function cleanSpeak(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeText(value = "") {
  return String(value).trim().toLowerCase();
}

function normalizeSauce(value = "") {
  const sauce = normalizeText(value);

  const aliases = {
    bbq: "barbeque",
    barbecue: "barbeque",
    barbeque: "barbeque",
    "buffalo mild": "mild",
    "buffalo hot": "hot",
    "lemon pepper": "lemon pepper",
    "lime pepper": "lime pepper"
  };

  return aliases[sauce] || sauce;
}

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
      errors.push(
        "For 6 or 9 wings, we can only do one sauce. We can mix two sauces together for an extra sauce charge, but we cannot split them."
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    message: errors[0] || "Valid order item."
  };
}

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

function getVapiToolCalls(body = {}) {
  const message = body.message || {};
  return message.toolCalls || message.toolCallList || [];
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

function buildOrderResult(item = {}) {
  const validation = validateOrder(item);

  if (!validation.valid) {
    const speak = cleanSpeak(
      validation.message ||
      validation.errors?.[0] ||
      "Invalid order item."
    );

    return {
      success: false,
      speak,
      error: {
        code: validation.correctionRequired ? "CORRECTION_REQUIRED" : "VALIDATION_ERROR",
        message: speak,
        details: validation.errors || []
      }
    };
  }

  const finalItem = applyMenuRules(item);

  return {
    success: true,
    speak: "Item added successfully.",
    item: finalItem
  };
}

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Flaps & Racks AI Cashier Backend",
    version: "1.1-vapi-safe-errors"
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/order", (req, res) => {
  try {
    const toolCalls = getVapiToolCalls(req.body);

    if (toolCalls.length > 0) {
      return res.json({
        results: toolCalls.map((toolCall) => {
          const item = getToolArguments(toolCall);
          const result = buildOrderResult(item);

          // IMPORTANT:
          // Even validation errors return as "result" so Vapi speaks the correction
          // instead of treating the tool call as crashed.
          return {
            toolCallId: toolCall.id,
            result: cleanSpeak(result.speak)
          };
        })
      });
    }

    const result = buildOrderResult(req.body || {});

    return res.json({
      success: result.success,
      speak: result.speak,
      message: result.speak,
      item: result.item || null,
      error: result.error || null
    });
  } catch (error) {
    const speak = cleanSpeak(error.message || "Unexpected server error.");

    return res.json({
      success: false,
      speak,
      message: speak,
      error: {
        code: "SERVER_ERROR",
        message: speak
      }
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Flaps & Racks AI Cashier backend running on port ${PORT}`);
});
