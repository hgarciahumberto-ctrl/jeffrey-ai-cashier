import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";

const { twiml: { VoiceResponse } } = twilio;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ------------------------
// Sessions
// ------------------------
const sessions = new Map();

function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, {
      stage: "language",
      order: {
        quantity: null,
        style: null,
        sauce: null,
        dip: null,
        dipQty: null,
        side: null,
        name: null
      }
    });
  }
  return sessions.get(callSid);
}

// ------------------------
// Menu Data
// ------------------------
const VALID_WING_COUNTS = [6, 9, 12, 18, 24, 48];

const SAUCES = [
  "mild",
  "hot",
  "lime pepper",
  "garlic parmesan",
  "mango habanero",
  "teriyaki",
  "barbeque",
  "green chile"
];

// ------------------------
// Helpers
// ------------------------
function normalize(text = "") {
  return text.toLowerCase().trim();
}

function speak(res, message, hangup = false) {
  const vr = new VoiceResponse();

  if (hangup) {
    vr.say({ voice: "Polly.Matthew" }, message);
    vr.hangup();
  } else {
    const gather = vr.gather({
      input: "speech",
      action: "/speech",
      method: "POST",
      speechTimeout: "auto"
    });

    gather.say({ voice: "Polly.Matthew" }, message);
  }

  res.type("text/xml").send(vr.toString());
}

function extractNumber(text) {
  const match = text.match(/\d+/);
  if (!match) return null;
  const num = parseInt(match[0]);
  return VALID_WING_COUNTS.includes(num) ? num : null;
}

function extractStyle(text) {
  if (text.includes("boneless")) return "boneless";
  if (text.includes("traditional") || text.includes("bone")) return "traditional";
  return null;
}

function extractSauce(text) {
  return SAUCES.find(s => text.includes(s));
}

function extractDip(text) {
  if (text.includes("ranch")) return "ranch";
  if (text.includes("blue cheese")) return "blue cheese";
  return null;
}

function extractDipQty(text) {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0]) : 1;
}

function extractSide(text) {
  if (text.includes("fries")) return "fries";
  if (text.includes("corn ribs")) return "corn ribs";
  if (text.includes("mac")) return "mac bites";
  if (text.includes("mozz")) return "mozzarella sticks";
  return null;
}

// ✅ FIXED NAME DETECTION
function extractName(text) {
  const cleaned = text
    .replace(/[.,!?]/g, "")
    .trim();

  const patterns = [
    /my name is (.+)/i,
    /it's (.+)/i,
    /this is (.+)/i
  ];

  for (const p of patterns) {
    const m = cleaned.match(p);
    if (m) return formatName(m[1]);
  }

  // Accept simple names like "Humberto"
  if (/^[a-zA-Z\s]{2,30}$/.test(cleaned)) {
    return formatName(cleaned);
  }

  return null;
}

function formatName(name) {
  return name
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ------------------------
// ROUTES
// ------------------------
app.post("/voice", (req, res) => {
  const session = getSession(req.body.CallSid);
  session.stage = "language";

  speak(res, "Thank you for calling Flaps and Racks. English or Spanish?");
});

app.post("/speech", (req, res) => {
  const session = getSession(req.body.CallSid);
  const speech = normalize(req.body.SpeechResult || "");

  console.log("Stage:", session.stage, "Speech:", speech);

  // ------------------------
  // LANGUAGE
  // ------------------------
  if (session.stage === "language") {
    session.stage = "order";
    return speak(res, "What can I get started for you?");
  }

  // ------------------------
  // ORDER
  // ------------------------
  if (session.stage === "order") {
    session.order.quantity = extractNumber(speech) || session.order.quantity;
    session.order.style = extractStyle(speech) || session.order.style;
    session.order.sauce = extractSauce(speech) || session.order.sauce;

    if (!session.order.quantity) {
      return speak(res, "How many wings would you like?");
    }

    if (!session.order.style) {
      return speak(res, "Traditional or boneless?");
    }

    if (!session.order.sauce) {
      return speak(res, "What sauce would you like? Mild, lime pepper, or garlic parmesan are popular.");
    }

    session.stage = "dip";

    return speak(
      res,
      `Got it. ${session.order.quantity} ${session.order.style} wings with ${session.order.sauce}. Would you like any dipping sauce?`
    );
  }

  // ------------------------
  // DIP
  // ------------------------
  if (session.stage === "dip") {
    const dip = extractDip(speech);

    if (!dip && (speech.includes("no") || speech.includes("that's all"))) {
      session.stage = "side";
      return speak(res, "Would you like to add fries, corn ribs, or mac bites?");
    }

    if (dip) {
      session.order.dip = dip;
      session.order.dipQty = extractDipQty(speech);
      session.stage = "dip_confirm";

      return speak(
        res,
        `Perfect, you have ${session.order.dipQty} ${dip}${session.order.dipQty > 1 ? "es" : ""}. Would you like any additional dipping sauce?`
      );
    }

    return speak(res, "Sorry, I missed that. Would you like ranch or blue cheese?");
  }

  // ------------------------
  // DIP CONFIRM
  // ------------------------
  if (session.stage === "dip_confirm") {
    if (speech.includes("no") || speech.includes("that's all")) {
      session.stage = "side";
      return speak(res, "Would you like to add fries, corn ribs, or mac bites?");
    }

    if (extractDip(speech)) {
      session.order.dipQty += extractDipQty(speech);

      return speak(
        res,
        `Got it, you now have ${session.order.dipQty} ranches. Any additional dipping sauce?`
      );
    }

    session.stage = "side";
    return speak(res, "Would you like to add fries, corn ribs, or mac bites?");
  }

  // ------------------------
  // SIDE
  // ------------------------
  if (session.stage === "side") {
    if (speech.includes("no") || speech.includes("that's all")) {
      session.stage = "name";
      return speak(res, "What name is the order under?");
    }

    const side = extractSide(speech);

    if (side) {
      session.order.side = side;
      session.stage = "name";

      return speak(res, `Got it, adding ${side}. What name is the order under?`);
    }

    return speak(res, "Sorry, I missed that. Fries, corn ribs, or mac bites?");
  }

  // ------------------------
  // NAME
  // ------------------------
  if (session.stage === "name") {
    const name = extractName(speech);

    if (!name) {
      return speak(res, "Sorry, I didn't catch the name. Can you repeat it?");
    }

    session.order.name = name;

    return speak(
      res,
      `Perfect ${name}. Your order is ready. Thank you for calling Flaps and Racks.`,
      true
    );
  }

  return speak(res, "Let's start again. What can I get you?");
});

// ------------------------
app.get("/", (req, res) => {
  res.send("Jeffrey AI Cashier running clean.");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
