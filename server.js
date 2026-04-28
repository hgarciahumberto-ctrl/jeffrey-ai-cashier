const express = require('express');
const app = express();
app.use(express.json());

// --- THE COMPLETE MENU SOURCE OF TRUTH ---
const MENU = {
  wings_boneless: {
    "6pc": { price: 9.75, sauces: 1, dips: 1, upsell: "8pc_combo" },
    "9pc": { price: 14.50, sauces: 1, dips: 1, upsell: "8pc_combo" },
    "12pc": { price: 18.50, sauces: 2, dips: 2 },
    "18pc": { price: 27.50, sauces: 3, dips: 3 },
    "24pc": { price: 36.50, sauces: 4, dips: 4 },
    "48pc": { price: 72.00, sauces: 8, dips: 8 }
  },
  combos: { 
    "8pc_wings_boneless_combo": { price: 15.75, sauces: 1, dips: 1, sides: 1 },
    "half_rack_ribs_combo": { price: 19.50, sauces: 1, sides: 1 },
    "flyin_burger_combo": { price: 17.75, sides: 1, protein_req: true },
    "classic_burger_combo": { price: 14.75, sides: 1 },
    "buffalo_chicken_sandwich_combo": { price: 15.50, sides: 1, protein_req: true },
    "chicken_sandwich_combo": { price: 14.50, sides: 1, protein_req: true },
    "fish_chips_combo": { price: 16.50, sides: 1 },
    "baked_potato_combo": { price: 16.50, protein_req: true, water_choice: true }
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
  }
};

let currentTotal = 0;

app.post('/vapi/tools', (req, res) => {
  try {
    const toolCalls = req.body.message?.toolCalls;
    if (!toolCalls || toolCalls.length === 0) {
      return res.status(200).json({ results: [] });
    }

    const results = toolCalls.map(call => {
      const { name, arguments: args, id } = call;

      if (name === "add_item") {
        const itemId = args.item_id;
        const item = MENU.wings_boneless[itemId] || MENU.combos[itemId] || MENU.specialties[itemId] || MENU.sides[itemId];

        if (!item) {
          return { toolCallId: id, result: "Item not found. Please ask for clarification." };
        }

        // --- ENFORCEMENT RULES ---
        if ((itemId === "6pc" || itemId === "9pc") && !args.upsell_checked) {
          return { toolCallId: id, result: "INSTRUCTION: Stop. Offer the 8pc combo with fries and a drink first." };
        }
        if (item.protein_req && !args.protein_style) {
          return { toolCallId: id, result: "INSTRUCTION: Stop. Ask if they want it Grilled or Fried." };
        }
        if (MENU.combos[itemId] && !args.side_choice) {
          return { toolCallId: id, result: "INSTRUCTION: Stop. Ask for the side: Fries, Sweet Potato Fries, Tostones, Yuca, or Potato Salad." };
        }
        if (item.sauces > 0 && !args.sauce) {
          return { toolCallId: id, result: "INSTRUCTION: Stop. Ask which sauce they want for this item." };
        }

        // --- CALCULATION ---
        const itemPrice = item.price || item;
        currentTotal += itemPrice;

        let feedback = `${itemId} added. Current total is $${currentTotal.toFixed(2)}.`;
        if (currentTotal >= 50) {
          feedback += " NOTICE: Total exceeds $50. Phone payment required.";
        }

        return { toolCallId: id, result: feedback };
      }
      
      return { toolCallId: id, result: "Function not recognized." };
    });

    return res.status(200).json(results);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server Error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
