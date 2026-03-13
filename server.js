import express from "express";
import twilio from "twilio";

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Simple in-memory call sessions
const sessions = new Map();

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

function getSession(callId) {
  if (!sessions.has(callId)) {
    sessions.set(callId, {
      language: null,
      stage: "language",
      order: {
        quantity: null,
        style: null,
        sauce: null,
        dip: null,
        name: null
      }
    });
  }
  return sessions.get(callId);
}

function isEnglish(text) {
  const t = normalize(text);
  return t.includes("english") || t.includes("ingles");
}

function isSpanish(text) {
  const t = normalize(text);
  return t.includes("spanish") || t.includes("espanol") || t.includes("español");
}

function detectWingStyle(text) {
  const t = normalize(text);
  if (t.includes("traditional") || t.includes("bone in")) return "traditional";
  if (t.includes("boneless")) return "boneless";
  return null;
}

function detectQuantity(text) {
  const t = normalize(text);

  const match = t.match(/\b(6|8|10|12|16|20|24|30|40|50)\b/);
  if (match) return Number(match[1]);

  if (t.includes("six")) return 6;
  if (t.includes("eight")) return 8;
  if (t.includes("ten")) return 10;
  if (t.includes("twelve")) return 12;
  if (t.includes("sixteen")) return 16;
  if (t.includes("twenty")) return 20;
  if (t.includes("thirty")) return 30;
  if (t.includes("forty")) return 40;
  if (t.includes("fifty")) return 50;

  return null;
}

function detectSauce(text) {
  const t = normalize(text);

  if (t.includes("buffalo mild")) return "buffalo mild";
  if (t.includes("mild buffalo")) return "buffalo mild";
  if (t.includes("buffalo")) return "buffalo mild";
  if (t.includes("buffalo hot")) return "buffalo hot";
  if (t.includes("lime pepper")) return "lime pepper";
  if (t.includes("garlic parmesan") || t.includes("garlic parm")) return "garlic parmesan";
  if (t.includes("bbq") || t.includes("barbecue")) return "bbq";
  if (t.includes("plain") || t.includes("no sauce")) return "plain";

  return null;
}

function detectDip(text) {
  const t = normalize(text);

  if (t.includes("ranch")) return "ranch";
  if (t.includes("blue cheese") || t.includes("bleu cheese")) return "blue cheese";
  if (t === "no" || t.includes("no dip") || t.includes("none")) return "none";

  return null;
}

function isDone(text) {
  const t = normalize(text);
  return (
    t.includes("thats all") ||
    t.includes("thats it") ||
    t.includes("nothing else") ||
    t.includes("im good") ||
    t.includes("done") ||
    t.includes("eso es todo") ||
    t.includes("nada mas")
  );
}

function detectName(text) {
  const raw = String(text || "").trim();
  const t = normalize(raw);

  if (!raw) return null;
  if (t.includes("buffalo") || t.includes("ranch") || t.includes("traditional")) return null;
  if (t.includes("thats all") || t.includes("nothing else")) return null;

  const patterns = [
    /my name is ([a-zA-Z\s'-]+)/i,
    /name is ([a-zA-Z\s'-]+)/i,
    /its ([a-zA-Z\s'-]+)/i,
    /it's ([a-zA-Z\s'-]+)/i,
    /^([a-zA-Z][a-zA-Z\s'-]{1,30})$/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function speak(res, message, action, callId, endCall = false) {
  const twiml = new twilio.twiml.VoiceResponse();

  if (endCall) {
    twiml.say(message);
    twiml.hangup();
    res.type("text/xml");
    res.send(twiml.toString());
    return;
  }

  const gather = twiml.gather({
    input: "speech",
    action: `${action}?callId=${encodeURIComponent(callId)}`,
    method: "POST",
    speechTimeout: "auto"
  });

  gather.say(message);

  res.type("text/xml");
  res.send(twiml.toString());
}

app.get("/", (_req, res) => {
  res.json({ ok: true, route: "/" });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, route: "/health" });
});

app.get("/voice", (_req, res) => {
  res.send("Voice route is live. Twilio must call this route with POST.");
});

app.post("/voice", (req, res) => {
  const callId = req.body.CallSid || `call-${Date.now()}`;

  sessions.set(callId, {
    language: null,
    stage: "language",
    order: {
      quantity: null,
      style: null,
      sauce: null,
      dip: null,
      name: null
    }
  });

  speak(
    res,
    "Thank you for calling Flaps and Racks. This is Jeffrey. Would you like English or Spanish today?",
    "/speech",
    callId
  );
});

app.post("/speech", (req, res) => {
  const callId = req.query.callId || req.body.CallSid || `call-${Date.now()}`;
  const speech = req.body.SpeechResult || "";

  console.log("TWILIO SPEECH RESULT:", speech);
  console.log("TWILIO BODY:", JSON.stringify(req.body, null, 2));

  const session = getSession(callId);
  const text = normalize(speech);

  if (session.stage === "language") {
    if (isEnglish(text) || !speech) {
      session.language = "english";
      session.stage = "wings";
      return speak(
        res,
        "Perfect. What can I get started for you today?",
        "/speech",
        callId
      );
    }

    if (isSpanish(text)) {
      session.language = "spanish";
      session.stage = "wings";
      return speak(
        res,
        "Perfecto. Que le puedo preparar hoy?",
        "/speech",
        callId
      );
    }

    return speak(
      res,
      "Would you like English or Spanish today?",
      "/speech",
      callId
    );
  }

  if (session.stage === "wings") {
    const qty = detectQuantity(text);
    const style = detectWingStyle(text);

    if (qty) session.order.quantity = qty;
    if (style) session.order.style = style;

    if (session.order.quantity && session.order.style) {
      session.stage = "sauce";
      return speak(
        res,
        `Got it. ${session.order.quantity} ${session.order.style} wings. What sauce would you like on those?`,
        "/speech",
        callId
      );
    }

    return speak(
      res,
      "Please tell me the wing order, for example 12 traditional wings or 12 boneless wings.",
      "/speech",
      callId
    );
  }

  if (session.stage === "sauce") {
    const sauce = detectSauce(text);

    if (sauce) {
      session.order.sauce = sauce;
      session.stage = "dip";
      return speak(
        res,
        `Perfect. ${sauce}. Any dipping sauce like ranch or blue cheese?`,
        "/speech",
        callId
      );
    }

    return speak(
      res,
      "What sauce would you like on those? You can say buffalo mild, lime pepper, garlic parmesan, or barbecue.",
      "/speech",
      callId
    );
  }

  if (session.stage === "dip") {
    const dip = detectDip(text);

    if (dip) {
      session.order.dip = dip === "none" ? null : dip;
      session.stage = "anything_else";
      return speak(
        res,
        "Got it. Anything else for you today?",
        "/speech",
        callId
      );
    }

    return speak(
      res,
      "Would you like ranch, blue cheese, or no dip?",
      "/speech",
      callId
    );
  }

  if (session.stage === "anything_else") {
    if (isDone(text) || text === "no" || text === "nope") {
      session.stage = "name";
      return speak(
        res,
        "Perfect. Can I get a name for the order?",
        "/speech",
        callId
      );
    }

    return speak(
      res,
      "For this demo, lets finish this order. Can I get a name for the order?",
      "/speech",
      callId
    );
  }

  if (session.stage === "name") {
    const name = detectName(speech);

    if (name) {
      session.order.name = name;
      session.stage = "done";

      const dipPart = session.order.dip ? ` with ${session.order.dip}` : "";
      return speak(
        res,
        `Perfect, ${name}. I have ${session.order.quantity} ${session.order.style} wings with ${session.order.sauce}${dipPart}. Your order is all set. Thank you for calling Flaps and Racks.`,
        "/speech",
        callId,
        true
      );
    }

    return speak(
      res,
      "Can I get a name for the order?",
      "/speech",
      callId
    );
  }

  return speak(
    res,
    "Thank you for calling Flaps and Racks.",
    "/speech",
    callId,
    true
  );
});

app.listen(PORT, () => {
  console.log(`Small working cashier listening on port ${PORT}`);
});
