import express from "express";
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

const calls = new Map();

/* --- 1. THE DATA SOURCE (PRICES & RULES) --- */
const MENU = {
  wings: {
    prices: { 6: 9.75, 9: 14.50, 12: 18.50, 18: 27.50, 24: 36.50, 48: 72.00 },
    sauce_slots: (q) => (q >= 12 ? Math.floor(q / 6) : 1),
    dip_slots: (q) => (q >= 12 ? Math.floor(q / 6) : 1)
  },
  combos: {
    "8pc_wings_combo": { price: 15.75, sauce: 1, side: true },
    "8pc_boneless_combo": { price: 15.75, sauce: 1, side: true },
    "half_rack_combo": { price: 19.50, side: true },
    "flyin_burger_combo": { price: 17.75, side: true, protein_req: true },
    "classic_burger_combo": { price: 14.75, side: true },
    "buffalo_chicken_sandwich_combo": { price: 15.50, side: true, protein_req: true },
    "chicken_sandwich_combo": { price: 14.50, side: true, protein_req: true },
    "fish_chips_combo": { price: 16.50, side: true },
    "baked_potato_combo": { price: 16.50, protein_req: true, drink_choice: true }
  },
  specialties: {
    "pork_belly_6pc": { price: 11.50, sauce: 1 },
    "flyin_fries": { price: 15.75 },
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
  sauces: ["al pastor", "barbeque", "barbeque chiltepin", "chorizo", "chocolate chiltepin", "cinnamon roll", "citrus chipotle", "garlic parmesan", "green chile", "hot", "lime pepper", "mild", "mango habanero", "pizza", "teriyaki"]
};

/* --- 2. HELPERS & ALIASES --- */
function normalize(text = "") {
  return String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function getCallState(callId) {
  if (!calls.has(callId)) {
    calls.set(callId, {
      language: "en",
      order: [],
      total: 0,
      currentItem: { id: null, upsell_offered: false }
    });
  }
  return calls.get(callId);
}

const t = (state, en, es) => (state.language === "es" ? es : en);

/* --- 3. THE LOGIC ENGINE --- */
app.post("/vapi/tools", async (req, res) => {
  if (VAPI_WEBHOOK_SECRET && req.headers.authorization !== `Bearer ${VAPI_WEBHOOK_SECRET}`) return res.status(401).json({ error: "Unauthorized" });

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
          results.push({ toolCallId: id, result: JSON.stringify({ ok: false, speak: t(state, "What can I add?", "¿Qué te agrego?") }) });
          continue;
        }

        // Logic: Check Upsell
        if ((itemId === "6pc" || itemId === "9pc") && !state.currentItem.upsell_offered) {
          state.currentItem.upsell_offered = true;
          results.push({ toolCallId: id, result: JSON.stringify({ ok: false, is_upsell: true, speak: t(state, "Would you like to make that an 8pc combo with fries and a drink?", "¿Gusta hacerlo combo de 8 con papas y refresco?") }) });
          continue;
        }

        // Add price and check $50 policy
        const price = MENU.combos[itemId]?.price || MENU.wings.prices[parseInt(itemId)] || MENU.specialties[itemId]?.price || MENU.sides[itemId] || 0;
        state.total += price;
        state.order.push(itemId);

        let msg = t(state, `Added ${itemId}. Total: $${state.total.toFixed(2)}.`, `Agregué ${itemId}. Total: $${state.total.toFixed(2)}.`);
        if (state.total >= 50) msg += " " + t(state, "Note: Since we're over $50, I'll need payment by phone.", "Nota: Como pasamos los $50, necesito cobrarte por teléfono.");

        results.push({ toolCallId: id, result: JSON.stringify({ ok: true, speak: msg }) });
      }
    }
    return res.status(200).json(results);
  } catch (err) {
    return res.status(200).json({ results: [{ toolCallId: "err", result: "error" }] });
  }
});

app.listen(PORT, () => console.log(`Master Engine Live on ${PORT}`));
