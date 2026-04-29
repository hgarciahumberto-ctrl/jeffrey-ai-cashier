import express from "express";
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

const calls = new Map();

/* -------------------------------------------------------------------------- */
/* 1. MASTER MENU & RULES (THE SOURCE OF TRUTH)                              */
/* -------------------------------------------------------------------------- */

const MASTER_MENU = {
  // TRADITIONAL WINGS & BONELESS
  wings: {
    prices: { 6: 9.75, 9: 14.50, 12: 18.50, 18: 27.50, 24: 36.50, 48: 72.00 },
    getRequiredSauces: (q) => (q >= 12 ? Math.floor(q / 6) : 1),
    getRequiredDips: (q) => (q >= 12 ? Math.floor(q / 6) : 1),
    upsell_to: "8pc_wings_combo"
  },
  // COMBOS (INCLUDES FRIES + AUTO-DRINK)
  combos: {
    "8pc_wings_combo": { price: 15.75, sauces: 1, dips: 1, side: true, drink: "auto" },
    "8pc_boneless_combo": { price: 15.75, sauces: 1, dips: 1, side: true, drink: "auto" },
    "half_rack_combo": { price: 19.50, sauces: 1, side: true },
    "flyin_burger_combo": { price: 17.75, protein: ["grilled", "fried"], side: true },
    "classic_burger_combo": { price: 14.75, side: true },
    "buffalo_chicken_sandwich_combo": { price: 15.50, protein: ["grilled", "fried"], side: true },
    "chicken_sandwich_combo": { price: 14.50, protein: ["grilled", "fried"], side: true },
    "fish_chips_combo": { price: 16.50, side: true },
    "baked_potato_combo": { price: 16.50, protein: ["grilled", "fried", "steak", "pork belly"], drink: "choice" }
  },
  // SPECIALTIES & SIDES
  specialties: {
    "pork_belly_6pc": { price: 11.50, sauces: 1 },
    "flyin_fries": { price: 15.75, components: ["boneless", "ranch", "chipotle ranch", "buffalo drizzle"] },
    "pork_belly_fries": { price: 15.75, components: ["pork belly", "ranch", "green chile", "onion", "cilantro"] },
    "sampler_platter": { price: 22.50, corn_rib_sauce: 1 }
  },
  sides_standalone: {
    "regular_fries": 4.50, "sweet_potato_fries": 5.75, "tostones": 5.75, "yuca_fries": 5.75,
    "buffalo_ranch_fries": 8.50, "corn_ribs": 8.50, "mac_bites": 8.50, "mozzarella_sticks": 8.50
  }
};

/* -------------------------------------------------------------------------- */
/* 2. ALIAS & NORMALIZATION ENGINE (SPANGLISH SUPPORT)                       */
/* -------------------------------------------------------------------------- */

const ALIASES = {
  // Sauces / Accents
  "lemon pepper": "lime pepper", "laim pepper": "lime pepper", "barbacua": "barbeque", "barbeque chiltepin": "barbeque chiltepin",
  // Items
  "alitas": "wings", "tradicionales": "wings", "boneles": "boneless", "hamburguesa": "classic_burger_combo",
  "papas": "regular_fries", "papas de camote": "sweet_potato_fries", "medio rack": "half_rack_combo", "media raca": "half_rack_combo",
  "flain frais": "flyin_fries", "papas flain": "flyin_fries", "pork beli": "pork_belly_6pc"
  // [The 1500-line version would continue this for all 400+ variations]
};

function normalize(text = "") {
  return String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
}

/* -------------------------------------------------------------------------- */
/* 3. STATE MACHINE HELPER                                                   */
/* -------------------------------------------------------------------------- */

function blankItem() {
  return { 
    id: null, 
    qty: null, 
    sauces: [], 
    dips: [], 
    side: null, 
    protein: null, 
    is_upsell_pitched: false,
    status: "PENDING" // PENDING | VALIDATED | ADDED
  };
}

function getCallState(callId) {
  if (!calls.has(callId)) {
    calls.set(callId, {
      language: "en",
      order: [],
      total: 0,
      currentItem: blankItem(),
      threshold_notified: false
    });
  }
  return calls.get(callId);
}
/* -------------------------------------------------------------------------- */
/* 4. VALIDATION ENGINE (SLOT-FILLING LOGIC)                                  */
/* -------------------------------------------------------------------------- */

function validateItem(state, parameters) {
  const itemId = ALIASES[normalize(parameters.item_id)] || normalize(parameters.item_id);
  const current = state.currentItem;
  
  // Find item config in MASTER_MENU
  let config = MASTER_MENU.combos[itemId] || MASTER_MENU.specialties[itemId];
  let isWings = false;

  if (!config && (itemId.includes("wing") || itemId.includes("boneless"))) {
    isWings = true;
    config = MASTER_MENU.wings;
    current.qty = parseInt(itemId) || 6;
  }

  if (!config) return { ok: false, speak: t(state, "I couldn't find that item. Can you repeat it?", "No encontré ese item. ¿Me lo repites?") };

  // A. UPSELL LOGIC (Phase 1)
  if (isWings && (current.qty === 6 || current.qty === 9) && !current.is_upsell_pitched) {
    current.is_upsell_pitched = true;
    return { ok: false, speak: t(state, "Would you like to make that an 8-piece combo with fries and a drink?", "¿Gusta hacerlo combo de 8 piezas con papas y refresco?") };
  }

  // B. PROTEIN VALIDATION (For Burgers/Sandwiches/Salads)
  if (config.protein && !parameters.protein_style) {
    return { ok: false, speak: t(state, "Would you like the chicken grilled or fried?", "¿Gusta el pollo asado o frito?") };
  }

  // C. SAUCE VALIDATION (Recursive Slot Filling)
  const reqSauces = isWings ? config.getRequiredSauces(current.qty) : (config.sauces || 0);
  const providedSauces = parameters.sauce ? (Array.isArray(parameters.sauce) ? parameters.sauce : [parameters.sauce]) : [];
  
  if (providedSauces.length < reqSauces) {
    return { ok: false, speak: t(state, `Which sauce would you like for the ${itemId}?`, `¿Qué salsa gusta para las ${itemId}?`) };
  }

  // D. SIDE VALIDATION (For Combos)
  if (config.side && !parameters.side_choice) {
    return { ok: false, speak: t(state, "Which side? Fries, sweet potato fries, tostones, yuca, or potato salad?", "¿Qué acompañamiento? Papas, papas de camote, tostones, yuca o ensalada de papa.") };
  }

  // E. DRINK VALIDATION (Baked Potato Specific)
  if (config.drink === "choice" && !parameters.drink_choice) {
    return { ok: false, speak: t(state, "Would you like a soft drink or bottled water?", "¿Gusta refresco o agua embotellada?") };
  }

  // ALL SLOTS FILLED -> CALCULATE PRICE
  const price = isWings ? config.prices[current.qty] : config.price;
  return { ok: true, itemId, price };
}

/* -------------------------------------------------------------------------- */
/* 5. VAPI WEBHOOK HANDLER (THE "BRAIN")                                      */
/* -------------------------------------------------------------------------- */

app.post("/vapi/tools", async (req, res) => {
  try {
    const message = req.body?.message;
    if (!message || message.type !== "tool-calls") return res.status(200).json({ results: [] });

    const callId = message.call?.id || "default";
    const state = getCallState(callId);
    const results = [];

    for (const toolCall of message.toolCallList || []) {
      const { name, parameters, id: toolCallId } = toolCall;
      const args = parameters || {};

      // Language Sync
      if (args.transcript) {
        const input = normalize(args.transcript);
        if (["hola", "espanol", "quiero", "alitas"].some(w => input.includes(w))) state.language = "es";
      }

      switch (name) {
        case "add_item": {
          const validation = validateItem(state, args);

          if (!validation.ok) {
            results.push({ toolCallId, result: JSON.stringify({ ok: false, speak: validation.speak }) });
          } else {
            // Commit to order
            state.order.push({ id: validation.itemId, price: validation.price });
            state.total += validation.price;
            state.currentItem = blankItem(); // Clear slots for next item

            let feedback = t(state, `Added ${validation.itemId}. Total: $${state.total.toFixed(2)}.`, `Agregué ${validation.itemId}. Total: $${state.total.toFixed(2)}.`);
            
            // Threshold Check
            if (state.total >= 50 && !state.threshold_notified) {
              state.threshold_notified = true;
              feedback += " " + t(state, "Note: Orders over $50 require phone payment.", "Nota: Pedidos de más de $50 requieren pago por teléfono.");
            }

            results.push({ toolCallId, result: JSON.stringify({ ok: true, speak: feedback }) });
          }
          break;
        }

        case "finalize_order": {
          const summary = state.order.map(i => i.id).join(", ");
          const finalMsg = t(state, 
            `Your order of ${summary} comes to $${state.total.toFixed(2)}. Can I get a name for the order?`, 
            `Tu orden de ${summary} es un total de $${state.total.toFixed(2)}. ¿A qué nombre queda la orden?`
          );
          results.push({ toolCallId, result: JSON.stringify({ ok: true, speak: finalMsg }) });
          break;
        }
      }
    }
    return res.status(200).json({ results });
  } catch (error) {
    console.error("VAPI ERROR:", error);
    return res.status(200).json({ results: [{ toolCallId: "err", result: JSON.stringify({ ok: false, speak: "I'm sorry, I had a technical glitch." }) }] });
  }
});

app.listen(PORT, () => console.log(`Flaps & Racks Industrial Engine Live on ${PORT}`));
