import express from "express";
import twilio from "twilio";

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// In-memory sessions
const sessions = new Map();

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function resetSession(callId) {
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

function isEnglish(text) {
  const t = normalize(text);
  return t.includes("english") || t.includes("ingles") || t === "englis";
}

function isSpanish(text) {
  const t = normalize(text);
  return t.includes("spanish") || t.includes("espanol");
}

function isNo(text) {
  const t = normalize(text);
  return t === "no" || t === "nope" || t === "nah";
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

function detectWingStyle(text) {
  const t = normalize(text);

  if (
    t.includes("traditional") ||
    t.includes("tradition") ||
    t.includes("tradicional") ||
    t.includes("bone in") ||
    t.includes("bonein")
  ) {
    return "traditional";
  }

  if (t.includes("boneless") || t.includes("bone less")) {
    return "boneless";
  }

  return null;
}

function detectQuantity(text) {
  const t = normalize(text);

  const direct = t.match(/\b(6|8|10|12|16|20|24|30|40|50)\b/);
  if (direct) return Number(direct[1]);

  const phrases = [
    ["six", 6],
    ["eight", 8],
    ["ten", 10],
    ["twelve", 12],
    ["sixteen", 16],
    ["twenty four", 24],
    ["twenty", 20],
    ["thirty", 30],
    ["forty", 40],
    ["fifty", 50],
    ["seis", 6],
    ["ocho", 8],
    ["diez", 10],
    ["doce", 12],
    ["dieciseis", 16],
    ["veinte", 20],
    ["treinta", 30],
    ["cuarenta", 40],
    ["cincuenta", 50]
  ];

  for (const [phrase, value] of phrases) {
    if (t.includes(phrase)) return value;
  }

  return null;
}

function detectSauce(text) {
  const t = normalize(text);

  if (
    t.includes("buffalo mild") ||
    t.includes("mild buffalo") ||
    t.includes("buffalo mile") ||
    t.includes("buffalo my old") ||
    t === "buffalo"
  ) {
    return "buffalo mild";
  }

  if (t.includes("buffalo hot") || t.includes("hot buffalo")) {
    return "buffalo hot";
  }

  if (t.includes("lime pepper")) {
    return "lime pepper";
  }

  if (
    t.includes("garlic parmesan") ||
    t.includes("garlic parm") ||
    t.includes("garlic parma")
  ) {
    return "garlic parmesan";
  }

  if (
    t.includes("bbq") ||
    t.includes("barbecue") ||
    t.includes("bar b q")
  ) {
    return "bbq";
  }

  if (t.includes("plain") || t.includes("no sauce")) {
    return "plain";
  }

  return null;
}

function detectDip(text) {
  const t = normalize(text);

  if (t.includes("ranch")) return "ranch";

  if (
    t.includes("blue cheese") ||
    t.includes("bleu cheese") ||
    t.includes("bluecheese")
  ) {
    return "blue cheese";
  }

  if (
    t === "no" ||
    t.includes("no dip") ||
    t.includes("none") ||
    t.includes("nothing")
  ) {
    return "none";
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
  resetSession(callId);

  speak(
    res,
    "Thank you for calling Flaps and Racks. This is Jeffrey. Would you like English or Spanish today?",
    "/speech",
    callId
  );
});

app.post("/speech", (req, res) => {
  try {
    const callId = req.query.callId || req.body.CallSid || `call-${Date.now()}`;
    const speech = req.body.SpeechResult || "";
    const text = normalize(speech);

    console.log("TWILIO SPEECH RESULT:", speech);
    console.log("TWILIO BODY:", JSON.stringify(req.body, null, 2));

    const session = getSession(callId);

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

      if (session.order.quantity && !session.order.style) {
        return speak(
          res,
          `I heard ${session.order.quantity}. Would you like traditional or boneless wings?`,
          "/speech",
          callId
        );
      }

      if (!session.order.quantity && session.order.style) {
        return speak(
          res,
          `Got it, ${session.order.style} wings. How many would you like?`,
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
      if (isDone(text) || isNo(text)) {
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
      session.order.name = "John";
      session.stage = "done";

      const dipPart = session.order.dip ? ` and ${session.order.dip} on the side` : "";

      return speak(
        res,
        `Perfect, John. I have ${session.order.quantity} ${session.order.style} wings with ${session.order.sauce}${dipPart}. Your order is all set. Thank you for calling Flaps and Racks.`,
        "/speech",
        callId,
        true
      );
    }

    return speak(
      res,
      "Thank you for calling Flaps and Racks.",
      "/speech",
      callId,
      true
    );
  } catch (error) {
    console.error("/speech error:", error);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("We are sorry, an application error has occurred.");
    res.type("text/xml");
    res.send(twiml.toString());
  }
});

app.listen(PORT, () => {
  console.log(`Small working cashier v3 listening on port ${PORT}`);
});
