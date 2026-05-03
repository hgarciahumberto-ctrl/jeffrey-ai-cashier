import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===============================
// MENU (CORE FIX)
// ===============================

const MENU = {
  flyin_salad: {
    name: "Flyin Salad",
    price: 11.30,
    required: ["chickenStyle", "dressing"]
  },
  house_salad: {
    name: "House Salad",
    price: 7.70,
    required: ["dressing"]
  },
  classic_burger_combo: {
    name: "Classic Burger Combo",
    price: 13.55,
    required: ["sideChoice"]
  },
  wings: {
    prices: {6:10.10,9:14.20,12:18.30,18:23.65,24:30.65,48:58.50},
    sauceLimit: {6:1,9:1,12:2,18:3,24:4,48:8}
  },
  boneless: {
    prices: {6:9.05,9:13.35,12:16.45,18:22.65,24:28.85,48:56.85},
    sauceLimit: {6:1,9:1,12:2,18:3,24:4,48:8}
  }
};

// ===============================
// ALIASES (CRITICAL FIX)
// ===============================

const ALIASES = {
  "flyin salad": "flyin_salad",
  "flying salad": "flyin_salad",
  "flain salad": "flyin_salad",
  "ensalada flyin": "flyin_salad",
  "flyin ensalada": "flyin_salad",

  "house salad": "house_salad",
  "ensalada house": "house_salad",

  "classic burger combo": "classic_burger_combo",
  "combo hamburguesa classic": "classic_burger_combo",

  "wings": "wings",
  "alitas": "wings",

  "boneless": "boneless"
};

// ===============================
// HELPERS
// ===============================

const clean = (v="") => v.toLowerCase().trim();

function resolveItem(name){
  const key = clean(name);
  return ALIASES[key] || key;
}

// ===============================
// VALIDATOR
// ===============================

function validateOrder(item){
  const itemId = resolveItem(item.itemId || item.type || "");
  const data = MENU[itemId];

  if(!data){
    return {
      ok:false,
      speak:"I do not have that item."
    };
  }

  // Missing slots
  if(data.required){
    for(const slot of data.required){
      if(!item[slot]){
        return {
          ok:false,
          speak: getMissingQuestion(slot)
        };
      }
    }
  }

  // Wings logic
  if(itemId === "wings" || itemId === "boneless"){
    const qty = item.quantity;
    const sauces = item.sauces || [];

    if(!data.prices[qty]){
      return {ok:false,speak:"Invalid quantity."};
    }

    if(sauces.length > data.sauceLimit[qty]){
      return {
        ok:false,
        speak:`That order includes up to ${data.sauceLimit[qty]} sauces.`
      };
    }
  }

  return {
    ok:true,
    speak:"Perfect.",
    item:{
      ...item,
      itemId,
      price: calculatePrice(itemId,item)
    }
  };
}

// ===============================
// QUESTIONS
// ===============================

function getMissingQuestion(slot){
  const map = {
    chickenStyle:"Would you like grilled or fried chicken?",
    dressing:"What dressing would you like?",
    sideChoice:"What side would you like: fries, sweet potato fries, or potato salad?"
  };
  return map[slot] || "Can you confirm that?";
}

// ===============================
// PRICE
// ===============================

function calculatePrice(itemId,item){
  const data = MENU[itemId];

  if(data.price) return data.price;

  if(data.prices){
    return data.prices[item.quantity] || 0;
  }

  return 0;
}

// ===============================
// VAPI HANDLER (FIXED)
// ===============================

app.post("/order",(req,res)=>{
  try{
    const toolCalls = req.body?.message?.toolCalls || [];

    if(toolCalls.length){
      return res.json({
        results: toolCalls.map(tc=>{
          const args = JSON.parse(tc.function.arguments || "{}");
          const result = validateOrder(args);

          return {
            toolCallId: tc.id,
            result: result.speak   // 🔥 VAPI SAFE
          };
        })
      });
    }

    const result = validateOrder(req.body);

    return res.json({
      success: result.ok,
      speak: result.speak,
      result: result.speak,
      item: result.item || null
    });

  }catch(e){
    return res.json({
      success:false,
      speak:"Server error",
      result:"Server error"
    });
  }
});

// ===============================

app.get("/health",(req,res)=>{
  res.json({ok:true});
});

app.listen(PORT,()=>{
  console.log("Server running on",PORT);
});
