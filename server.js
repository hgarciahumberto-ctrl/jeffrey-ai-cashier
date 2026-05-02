// ===============================
// FLAPS & RACKS AI CASHIER BACKEND V1.2.1
// Codex-base + Vapi Safe Result Fix
// ===============================

import express from "express";

const app = express();
app.use(express.json());

const VERSION = "1.2.1-full-menu-vapi-safe";

// ===============================
// CONSTANTS
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

const DIPS = [
  "ranch",
  "blue cheese",
  "chipotle ranch",
  "jalapeno ranch"
];

const SIDE_CHOICES = [
  "regular fries",
  "fries",
  "sweet potato fries",
  "potato salad",
  "buffalo ranch fries"
];

const PROTEINS = [
  "chicken",
  "steak",
  "pork belly",
  "no protein"
];

const CHICKEN_STYLES = [
  "grilled",
  "fried"
];

// ===============================
// HELPERS
// ===============================

const clean = (value = "") => String(value).trim().toLowerCase();
const cleanSpeak = (value = "") => String(value).replace(/\s+/g, " ").trim();

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
};

const normalizeSauce = (value = "") => {
  const map = {
    bbq: "barbeque",
    barbecue: "barbeque",
    barbeque: "barbeque",
    mild: "buffalo mild",
    hot: "buffalo hot",
    "lemon pepper": "lemon pepper",
    "lime pepper": "lime pepper",
    "laim pepper": "lime pepper"
  };
  return map[clean(value)] || clean(value);
};

const normalizeDip = (value = "") => {
  const map = {
    "jalapeño ranch": "jalapeno ranch",
    "jalapeno ranch": "jalapeno ranch"
  };
  return map[clean(value)] || clean(value);
};

const normalizeSide = (value = "") => {
  const map = {
    fries: "regular fries",
    papas: "regular fries",
    "papas de camote": "sweet potato fries",
    "ensalada de papa": "potato salad"
  };
  return map[clean(value)] || clean(value);
};

const normalizeProtein = (value = "") => {
  const map = {
    "carne asada": "steak",
    pollo: "chicken",
    "sin proteina": "no protein",
    "sin proteína": "no protein"
  };
  return map[clean(value)] || clean(value);
};

// ===============================
// VALIDATOR
// ===============================

function validateOrder(item = {}) {
  const type = clean(item.itemId || item.type);
  const qty = Number(item.quantity);

  const sauces = asArray(item.sauces).map(normalizeSauce);
  const dips = asArray(item.dips).map(normalizeDip);

  // ITEM
  if (!type) {
    return fail("Missing item.");
  }

  // LEMON PEPPER FIX
  if (sauces.includes("lemon pepper")) {
    return correction("We have that as lime pepper. Is that okay?");
  }

  // INVALID SAUCES
  const invalidSauces = sauces.filter(s => !SAUCES.includes(s));
  if (invalidSauces.length) {
    return fail(`We do not have ${invalidSauces.join(", ")} as a sauce option.`);
  }

  // INVALID DIPS
  const invalidDips = dips.filter(d => !DIPS.includes(d));
  if (invalidDips.length) {
    return fail(`We do not have ${invalidDips.join(", ")} as a dip option.`);
  }

  // WINGS / BONELESS
  if (type.includes("wings") || type.includes("boneless")) {
    const limits = {6:1,9:1,12:2,18:3,24:4,48:8};

    if (!limits[qty]) {
      return fail("Available quantities are 6, 9, 12, 18, 24, or 48.");
    }

    if (sauces.length > limits[qty]) {
      return fail(`That order includes up to ${limits[qty]} sauce${limits[qty]>1?"s":""}.`);
    }

    if (dips.length > limits[qty]) {
      return fail(`That order includes up to ${limits[qty]} dip${limits[qty]>1?"s":""}.`);
    }

    if ((qty === 6 || qty === 9) && sauces.length > 1) {
      return fail("6 or 9 wings can only have one sauce.");
    }
  }

  // SIDE
  if (item.sideChoice && !SIDE_CHOICES.includes(normalizeSide(item.sideChoice))) {
    return fail("Invalid side choice.");
  }

  // PROTEIN
  if (item.protein && !PROTEINS.includes(normalizeProtein(item.protein))) {
    return fail("Invalid protein.");
  }

  // CHICKEN STYLE
  if (item.chickenStyle && !CHICKEN_STYLES.includes(clean(item.chickenStyle))) {
    return fail("Chicken must be grilled or fried.");
  }

  return success({
    ...item,
    itemId: type,
    quantity: qty || item.quantity,
    sauces,
    dips
  });
}

// ===============================
// RESPONSES
// ===============================

function success(item) {
  return {
    success: true,
    speak: "Perfect.",
    item
  };
}

function fail(message) {
  return {
    success: false,
    speak: cleanSpeak(message)
  };
}

function correction(message) {
  return {
    success: false,
    speak: cleanSpeak(message),
    correction: true
  };
}

// ===============================
// VAPI HELPERS
// ===============================

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

  return args || {};
}

// ===============================
// ROUTES
// ===============================

app.get("/health", (req, res) => {
  res.json({ ok: true, version: VERSION });
});

app.post("/order", (req, res) => {
  try {
    const toolCalls = getVapiToolCalls(req.body);

    if (toolCalls.length > 0) {
      return res.json({
        results: toolCalls.map((toolCall) => {
          const item = getToolArguments(toolCall);
          const result = validateOrder(item);

          // 🔥 CRITICAL FIX (VAPI SAFE)
          return {
            toolCallId: toolCall.id,
            result: cleanSpeak(result.speak)
          };
        })
      });
    }

    const result = validateOrder(req.body);

    return res.json({
      success: result.success,
      speak: result.speak,
      result: result.speak,
      item: result.item || null
    });

  } catch (err) {
    return res.json({
      success: false,
      speak: "Server error.",
      result: "Server error."
    });
  }
});

// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running ${VERSION} on port ${PORT}`);
});
