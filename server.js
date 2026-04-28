import express from "express";
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

// State management for active calls
const calls = new Map();

/* -------------------------------------------------------------------------- */
/* 1. THE COMPLETE MENU & POLICY ENGINE (The Library of Truth)               */
/* -------------------------------------------------------------------------- */
const MENU = {
  wings: {
    prices: { 6: 9.75, 9: 14.50, 12: 18.50, 18: 27.50, 24: 36.50, 48: 72.00 },
    sauce_slots: (q) => (q >= 12 ? Math.floor(q / 6) : 1),
    dip_slots: (q) => (q >= 12 ? Math.floor(q / 6) : 1)
  },
  combos: {
    "8pc_wings_combo": { price: 15.75, sauces: 1, dips: 1, side: true, drink: "auto" },
    "8pc_boneless_combo": { price: 15.75, sauces: 1, dips: 1, side: true, drink: "auto" },
    "half_rack_combo": { price: 19.50, sauces: 1, side: true, drink: "auto" },
    "flyin_burger_combo": { price: 17.75, side: true, protein_req: true, drink: "auto" },
    "classic_burger_combo": { price: 14.75, side: true, drink: "auto" },
    "buffalo_chicken_sandwich_combo": { price: 15.50, side: true, protein_req: true, drink: "auto" },
    "chicken_sandwich_combo": { price: 14.50, side: true, protein_req: true, drink: "auto" },
    "fish_chips_combo": { price: 16.50, side: true, drink: "auto" },
    "baked_potato_combo": { price: 16.50, protein_req: true, side: "fixed", drink_choice: true }
  },
  specialties: {
    "pork_belly_6pc": { price: 11.50, sauces: 1 },
    "flyin_fries": { price: 15.75 }, // Junior order
    "pork_belly_fries": { price: 15.75 },
    "sampler_platter": { price: 22.50, corn_rib_sauce: 1 },
    "house_salad": { price: 10.50, dressing: 1 },
    "flyin_salad": { price: 15.50, dressing: 1, protein_req: true }
  },
  sides: {
    "regular_fries": 4.50, "sweet_potato_fries": 5.75, "tostones": 5.75, "yuca_fries": 5.75,
    "buffalo_ranch_fries": 8.50, "corn_ribs_4pc": 8.50, "mac_bites_6pc": 8.50,
    "mozzarella_sticks_6pc": 8.50, "onion_rings": 7.50, "potato_salad": 4.50
  },
  sauces: [
    "al pastor", "barbeque", "barbeque chiltepin", "chorizo", "chocolate chiltepin",
    "cinnamon roll", "citrus chipotle", "garlic parmesan", "green chile", "hot",
    "lime pepper", "mild", "mango habanero", "pizza", "teriyaki"
  ],
  policies: {
    extra_sauce_price: 0.75,
    flats_drums_extra: 1.50,
    payment_threshold: 50.00,
    pickup_only: true,
    no_alcohol_phone: true
  }
};

/* -------------------------------------------------------------------------- */
/* 2. DEFENSIVE UTILITIES (Crash Prevention)                                  */
/* -------------------------------------------------------------------------- */
function normalize(text = "") {
  return String(text).toLowerCase().trim();
}

function getCallState(callId) {
  if (!calls.has(callId)) {
    calls.set(callId, {
      language: "en",
      order: [],
      total: 0,
      currentItem: { id: null, qty: null, sauces: [], dips: [], side: null, protein: null, upsell_offered: false }
    });
  }
  return calls.get(callId);
}

const t = (state, en, es) => (state.language === "es" ? es : en);

/* -------------------------------------------------------------------------- */
/* 3. THE LOGIC ENGINE                                                       */
/* -------------------------------------------------------------------------- */
app.post("/vapi/tools", async (req, res) => {
  try {
    const toolCalls = req.body?.message?.toolCalls;
    if (!toolCalls) return res.status(200).json({ results: [] });

    const callId = req.body.message.call?.id || "default";
    const state = getCallState(callId);
    const results = [];

    for (const call of toolCalls) {
      const { name, arguments: args, id } = call;

      if (name === "add_item") {
        const itemId = args?.item_id;
        if (!itemId) {
          results.push({ toolCallId: id, result: JSON.stringify({ ok: false, speak: t(state, "What can I add for you?", "¿Qué te agrego?") }) });
          continue;
        }

        // Logic: Identify Item & Check Requirements
        const isCombo = MENU.combos[itemId];
        const isWings = itemId.includes("wing") || itemId.includes("boneless");
        
        // 1. UPSELL CHECK (6/9 Wings)
        if ((itemId === "6pc" || itemId === "9pc") && !state.currentItem.upsell_offered) {
          state.currentItem.upsell_offered = true;
          results.push({ toolCallId: id, result: JSON.stringify({ ok: false, speak: t(state, "Would you like to make that an 8-piece combo with fries and a drink instead?", "¿Gusta hacerlo combo de 8 piezas con papas y refresco?") }) });
          continue;
        }

        // 2. MISSING DATA CHECKS
        if (isCombo && !args.side_choice) {
          results.push({ toolCallId: id, result: JSON.stringify({ ok: false, speak: t(state, "Which side would you like? We have fries, sweet potato fries, tostones, yuca, or potato salad.", "¿Qué acompañamiento gustas? Tenemos papas, papas de camote, tostones, yuca o ensalada de papa.") }) });
          continue;
        }

        // 3. FINALIZE ITEM
        const basePrice = isCombo ? MENU.combos[itemId].price : (MENU.wings.prices[parseInt(itemId)] || 0);
        state.order.push({ id: itemId, price: basePrice });
        state.total += basePrice;

        let feedback = t(state, `Added ${itemId}. Total is $${state.total.toFixed(2)}.`, `Agregué ${itemId}. El total es $${state.total.toFixed(2)}.`);
        
        if (state.total >= MENU.policies.payment_threshold) {
          feedback += " " + t(state, "Since we are over $50, I'll need to take payment over the phone.", "Como pasamos de $50, tomaré tu pago por teléfono.");
        }

        results.push({ toolCallId: id, result: JSON.stringify({ ok: true, speak: feedback }) });
      }
    }
    return res.status(200).json(results);
  } catch (err) {
    console.error("CRITICAL ERROR:", err);
    return res.status(200).json({ results: [{ result: "Error" }] });
  }
});

app.listen(PORT, () => console.log(`Master Engine Live on ${PORT}`));
