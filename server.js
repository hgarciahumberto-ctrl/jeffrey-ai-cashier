const express = require('express');
const app = express();
app.use(express.json());

// --- COMPLETE SOURCE OF TRUTH: MENU & RULES ---
const MENU_DATA = {
    wings_boneless: {
        "6pc": { price: 9.75, sauces: 1, dips: 1, upsell: "8pc_combo" },
        "9pc": { price: 14.50, sauces: 1, dips: 1, upsell: "8pc_combo" },
        "12pc": { price: 18.50, sauces: 2, dips: 2 },
        "18pc": { price: 27.50, sauces: 3, dips: 3 },
        "24pc": { price: 36.50, sauces: 4, dips: 4 },
        "48pc": { price: 72.00, sauces: 8, dips: 8 }
    },
    combos: { // All include Fries + Soft Drink Cup (Auto)
        "8pc_wings_boneless_combo": { price: 15.75, sauces: 1, dips: 1, sides: 1 },
        "half_rack_ribs_combo": { price: 19.50, sauces: 1, sides: 1 },
        "flyin_burger_combo": { price: 17.75, sides: 1, protein_req: true },
        "classic_burger_combo": { price: 14.75, sides: 1 },
        "buffalo_chicken_sandwich_combo": { price: 15.50, sides: 1, protein_req: true },
        "chicken_sandwich_combo": { price: 14.50, sides: 1, protein_req: true },
        "fish_chips_combo": { price: 16.50, sides: 1 },
        "baked_potato_combo": { price: 16.50, protein_req: true, allow_water: true }
    },
    standalone_burgers: {
        "flyin_burger": { price: 13.50, protein_req: true },
        "classic_burger": { price: 10.50 },
        "buffalo_chicken_sandwich": { price: 11.25, protein_req: true },
        "chicken_sandwich": { price: 10.25, protein_req: true }
    },
    specialties: {
        "pork_belly_6pc": { price: 11.50, sauces: 1 },
        "flyin_fries": { price: 15.75 },
        "pork_belly_fries": { price: 15.75 },
        "sampler_platter": { price: 22.50, corn_rib_sauce_req: 1 },
        "house_salad": { price: 10.50 },
        "flyin_salad": { price: 15.50, protein_req: true }
    },
    sides: {
        "regular_fries": 4.50,
        "sweet_potato_fries": 5.75,
        "tostones": 5.75,
        "yuca_fries": 5.75,
        "buffalo_ranch_fries": 8.50,
        "corn_ribs_4pc": 8.50,
        "mac_bites_6pc": 8.50,
        "mozzarella_sticks_6pc": 8.50,
        "onion_rings": 7.50,
        "potato_salad": 4.50
    },
    pricing_rules: {
        "extra_sauce_dip": 0.75,
        "all_flats_drums": 1.50,
        "payment_threshold": 50.00
    }
};

// State stored per call (In production, use a Database/Redis. For Railway testing, this works per session)
let currentOrder = { items: [], total: 0 };

app.post('/vapi/tools', (req, res) => {
    try {
        const toolCalls = req.body.message.toolCalls;
        const responses = [];

        for (const call of toolCalls) {
            const { name, arguments: args, id } = call;

            if (name === "add_to_order") {
                const itemId = args.item_id;
                // Search all menu categories
                const item = MENU_DATA.wings_boneless[itemId] || 
                             MENU_DATA.combos[itemId] || 
                             MENU_DATA.specialties[itemId] || 
                             MENU_DATA.standalone_burgers[itemId] ||
                             MENU_DATA.sides[itemId];

                if (!item) {
                    responses.push({ toolCallId: id, result: "Item not found. Please ask the customer to clarify." });
                    continue;
                }

                // --- LOGIC ENFORCEMENT ---
                let instructions = "";

                // 1. Upsell Logic
                if ((itemId === "6pc" || itemId === "9pc") && !args.upsell_checked) {
                    instructions = "STOP: Ask if they want to make it an 8pc combo with fries and a drink first.";
                } 
                // 2. Protein Style Logic
                else if (item.protein_req && !args.protein_style) {
                    instructions = "STOP: Ask if they want the chicken Grilled or Fried.";
                }
                // 3. Side Logic for Combos
                else if (MENU_DATA.combos[itemId] && !args.side_choice) {
                    instructions = "STOP: Ask which side they want: regular fries, sweet potato fries, tostones, yuca, or potato salad.";
                }
                // 4. Validation Passed -> Add to Order
                else {
                    const price = (typeof item === 'number') ? item : item.price;
                    currentOrder.items.push({ name: itemId, price: price });
                    currentOrder.total += price;
                    
                    instructions = `Item ${itemId} added. Current total is $${currentOrder.total.toFixed(2)}.`;
                    
                    if (currentOrder.total >= MENU_DATA.pricing_rules.payment_threshold) {
                        instructions += " IMPORTANT: Inform them that since the order is over $50, we need payment over the phone.";
                    }
                }

                responses.push({ toolCallId: id, result: instructions });
            }
        }
        res.status(200).json(responses);
    } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Flaps and Racks Engine running on port ${PORT}`));
