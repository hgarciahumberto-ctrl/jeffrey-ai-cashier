import express from "express";
import twilio from "twilio";

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// In-memory sessions
const sessions = new Map();

function blankOrder() {
  return {
    quantity: null,
    style: null,
    sauce: null,
    dip: null,
    name: null
  };
}

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSession(callId) {
  if (!sessions.has(callId)) {
    sessions.set(callId, {
      language: null,
      stage: "language",
      retries: 0,
      order: blankOrder()
    });
  }
  return sessions.get(callId);
}

function resetSession(callId) {
  sessions.set(callId, {
    language: null,
    stage: "language",
    retries: 0,
    order: blankOrder()
  });
}

function bumpRetry(session) {
  session.retries = (session.retries || 0) + 1;
}

function resetRetry(session) {
  session.retries = 0;
}

function isEnglish(text) {
  const t = normalize(text);
  return (
    t.includes("english") ||
    t.includes("ingles") ||
    t === "englis" ||
    t === "english please"
  );
}

function isSpanish(text) {
  const t = normalize(text);
  return (
    t.includes("spanish") ||
    t.includes("espanol") ||
    t.includes("español")
  );
}

function isNo(text) {
  const t = normalize(text);
  return (
    t === "no" ||
    t === "nope" ||
    t === "nah" ||
    t === "negative"
  );
}

function isYes(text) {
  const t = normalize(text);
  return (
    t === "yes" ||
    t === "yeah" ||
    t === "yep" ||
    t === "sure" ||
    t === "correct" ||
    t === "si"
  );
}

function isDone(text) {
  const t = normalize(text);
  return (
    t.includes("thats all") ||
    t.includes("that s all") ||
    t.includes("thats it") ||
    t.includes("that s it") ||
    t.includes("nothing else") ||
    t.includes("i m good") ||
    t.includes("im good") ||
    t.includes("done") ||
    t.includes("no that s all") ||
    t.includes("no thats all") ||
    t.includes("eso es todo") ||
    t.includes("nada mas") ||
    t.includes("nada más")
  );
}

function detectWingStyle(text) {
  const t = normalize(text);

  if (
    t.includes("traditional") ||
    t.includes("tradition") ||
    t.includes("tradicional") ||
    t.includes("bone in") ||
    t.includes("bonein") ||
    t.includes("classic wings")
  ) {
    return "traditional";
  }

  if (
    t.includes("boneless") ||
    t.includes("bone less") ||
    t.includes("boneless wings")
  ) {
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
    ["veinte cuatro", 24],
    ["veinticuatro", 24],
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
    t === "buffalo" ||
    t === "mild"
  ) {
    return "buffalo mild";
  }

  if (
    t.includes("buffalo hot") ||
    t.includes("hot buffalo") ||
    t.includes("hot sauce")
  ) {
    return "buffalo hot";
  }

  if (
    t.includes("lime pepper") ||
    t.includes("lemon pepper lime") ||
    t.includes("line pepper")
  ) {
    return "lime pepper";
  }

  if (
    t.includes("garlic parmesan") ||
    t.includes("garlic parm") ||
    t.includes("garlic parma") ||
    t.includes("garlic parmesan sauce")
  ) {
    return "garlic parmesan";
  }

  if (
    t.includes("bbq") ||
    t.includes("barbecue") ||
    t.includes("bar b q") ||
    t.includes("bar b cue")
  ) {
    return "bbq";
  }

  if (
    t.includes("plain") ||
    t.includes("no sauce") ||
    t.includes("dry")
  ) {
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
    t.includes("bluecheese") ||
    t.includes("blu cheese")
  ) {
    return "blue cheese";
  }

  if (
    t === "no" ||
    t.includes("no dip") ||
    t.includes("none") ||
    t.includes("nothing") ||
    t.includes("no thank you") ||
    t.includes("no dipping sauce")
  ) {
    return "none";
  }

  return null;
}

function detectLikelyName(text) {
  const original = String(text || "").trim();
  const t = normalize(original);

  if (!t) return null;

  const blockedPhrases = [
    "no",
    "nope",
    "nah",
    "thats all",
    "that s all",
    "done",
    "ranch",
    "blue cheese",
    "buffalo mild",
    "buffalo hot",
    "bbq",
    "lime pepper",
    "garlic parmesan",
    "traditional",
    "boneless",
    "yes",
    "yeah",
    "yep"
  ];

  if (blockedPhrases.includes(t)) return null;

  let cleaned = original
    .replace(/^(my name is|name is|this is|its|it is|for|order for)\s+/i, "")
    .replace(/[^a-zA-Z\s'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  const parts = cleaned.split(" ").filter(Boolean);

  if (parts.length >= 1 && parts.length <= 3) {
    return parts
      .map(
        (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      )
      .join(" ");
  }

  return null;
}

function extractOrderFromSpeech(text) {
  return {
    quantity: detectQuantity(text),
    style: detectWingStyle(text),
    sauce: detectSauce(text),
    dip: detectDip(text)
  };
}

function updateOrderFromSpeech(order, text) {
  const found = extractOrderFromSpeech(text);

  if (found.quantity && !order.quantity) order.quantity = found.quantity;
  if (found.style && !order.style) order.style = found.style;
  if (found.sauce && !order.sauce) order.sauce = found.sauce;
  if (found.dip && !order.dip && found.dip !== "none") order.dip = found.dip;

  return found;
}

function buildOrderSummary(order) {
  const parts = [];

  if (order.quantity && order.style) {
    parts.push(`${order.quantity} ${order.style} wings`);
  } else if (order.quantity) {
    parts.push(`${order.quantity} wings`);
  } else if (order.style) {
    parts.push(`${order.style} wings`);
  } else {
    parts.push("your wing order");
  }

  if (order.sauce) {
    parts.push(`with ${order.sauce}`);
  }

  if (order.dip) {
    parts.push(`and ${order.dip} on the side`);
  }

  return parts.join(" ");
}

// Fast, compact prompts
function line(key, data = {}) {
  const lines = {
    welcome: "Thanks for calling Flaps and Racks. Jeffrey here. English or Spanish?",
    spanishDemo: "Perfecto. This demo continues in English. What can I get started for you?",
    askOrder: "What can I get started for you?",
    askOrderExample: "You can say 12 traditional wings or 12 boneless buffalo mild.",
    askStyle: `Got it. ${data.quantity} wings. Traditional or boneless?`,
    askQty: `Got it. ${data.style} wings. How many?`,
    askSauce: "What sauce would you like?",
    askSauceShort: "Sauce?",
    askDip: "Any dip? Ranch, blue cheese, or no dip?",
    askAnythingElse: "Anything else?",
    askName: "Name for the order? Please say just the name.",
    retryName: "Sorry, just the name for the order.",
    demoFinish: "For this demo I will finish the order here. Name for the order?",
    closeNamed: `Perfect, ${data.name}. I have ${data.summary}. You are all set. Thanks for calling Flaps and Racks.`,
    closeGuest: `Perfect. I have ${data.summary}. You are all set. Thanks for calling Flaps and Racks.`,
    fallbackLanguage: "English or Spanish?",
    fallbackDip: "Ranch, blue cheese, or no dip?",
    fallbackAnythingElse: "Anything else?",
    goodbye: "Thanks for calling Flaps and Racks."
  };

  return lines[key];
}

function speak(res, message, action, callId, endCall = false) {
  const twiml = new twilio.twiml.VoiceResponse();

  if (endCall) {
    twiml.say({ voice: "woman" }, message);
    twiml.hangup();
    res.type("text/xml");
    res.send(twiml.toString());
    return;
  }

  const gather = twiml.gather({
    input: "speech",
    action: `${action}?callId=${encodeURIComponent(callId)}`,
    method: "POST",
    speechTimeout: "auto",
    timeout: 5,
    actionOnEmptyResult: true
  });

  gather.say({ voice: "woman" }, message);

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

  return speak(res, line("welcome"), "/speech", callId);
});

app.post("/speech", (req, res) => {
  try {
    const callId = req.query.callId || req.body.CallSid || `call-${Date.now()}`;
    const speech = req.body.SpeechResult || "";
    const text = normalize(speech);

    console.log("TWILIO SPEECH RESULT:", speech);
    console.log("TWILIO NORMALIZED:", text);
    console.log("TWILIO BODY:", JSON.stringify(req.body, null, 2));

    const session = getSession(callId);
    const order = session.order;

    updateOrderFromSpeech(order, speech);

    if (session.stage === "language") {
      if (isSpanish(text)) {
        session.language = "spanish";
        session.stage = "wings";
        resetRetry(session);
        return speak(res, line("spanishDemo"), "/speech", callId);
      }

      if (isEnglish(text) || !speech) {
        session.language = "english";
        session.stage = "wings";
        resetRetry(session);
        return speak(res, line("askOrder"), "/speech", callId);
      }

      bumpRetry(session);
      return speak(res, line("fallbackLanguage"), "/speech", callId);
    }

    if (session.stage === "wings") {
      if (order.quantity && order.style && order.sauce) {
        session.stage = "dip";
        resetRetry(session);
        return speak(res, line("askDip"), "/speech", callId);
      }

      if (order.quantity && order.style) {
        session.stage = "sauce";
        resetRetry(session);
        return speak(res, line("askSauceShort"), "/speech", callId);
      }

      if (order.quantity && !order.style) {
        resetRetry(session);
        return speak(
          res,
          line("askStyle", { quantity: order.quantity }),
          "/speech",
          callId
        );
      }

      if (!order.quantity && order.style) {
        resetRetry(session);
        return speak(
          res,
          line("askQty", { style: order.style }),
          "/speech",
          callId
        );
      }

      bumpRetry(session);

      if (session.retries >= 2) {
        return speak(res, line("askOrderExample"), "/speech", callId);
      }

      return speak(res, line("askOrder"), "/speech", callId);
    }

    if (session.stage === "sauce") {
      const sauce = detectSauce(speech);

      if (sauce) {
        order.sauce = sauce;
        session.stage = "dip";
        resetRetry(session);
        return speak(res, line("askDip"), "/speech", callId);
      }

      if (order.quantity && order.style && order.sauce) {
        session.stage = "dip";
        resetRetry(session);
        return speak(res, line("askDip"), "/speech", callId);
      }

      bumpRetry(session);

      if (session.retries >= 2) {
        return speak(res, line("askSauce"), "/speech", callId);
      }

      return speak(res, line("askSauceShort"), "/speech", callId);
    }

    if (session.stage === "dip") {
      const dip = detectDip(speech);

      if (dip) {
        order.dip = dip === "none" ? null : dip;
        session.stage = "anything_else";
        resetRetry(session);
        return speak(res, line("askAnythingElse"), "/speech", callId);
      }

      if (isDone(text) || isNo(text)) {
        order.dip = null;
        session.stage = "anything_else";
        resetRetry(session);
        return speak(res, line("askAnythingElse"), "/speech", callId);
      }

      bumpRetry(session);
      return speak(res, line("fallbackDip"), "/speech", callId);
    }

    if (session.stage === "anything_else") {
      if (isDone(text) || isNo(text)) {
        session.stage = "name";
        resetRetry(session);
        return speak(res, line("askName"), "/speech", callId);
      }

      if (isYes(text) || text.length > 0) {
        session.stage = "name";
        resetRetry(session);
        return speak(res, line("demoFinish"), "/speech", callId);
      }

      bumpRetry(session);
      return speak(res, line("fallbackAnythingElse"), "/speech", callId);
    }

    if (session.stage === "name") {
      let name = detectLikelyName(speech);

      if (!name) {
        const raw = String(speech || "").trim();
        const rawWordCount = raw.split(/\s+/).filter(Boolean).length;

        if (raw && rawWordCount >= 1 && rawWordCount <= 2) {
          name = raw
            .replace(/[^a-zA-Z\s'-]/g, "")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map(
              (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
            )
            .join(" ");
        }
      }

      if (name) {
        order.name = name;
        session.stage = "done";
        resetRetry(session);

        const summary = buildOrderSummary(order);

        return speak(
          res,
          line("closeNamed", { name: order.name, summary }),
          "/speech",
          callId,
          true
        );
      }

      bumpRetry(session);

      if (session.retries >= 2) {
        order.name = "Guest";
        session.stage = "done";
        resetRetry(session);

        const summary = buildOrderSummary(order);

        return speak(
          res,
          line("closeGuest", { summary }),
          "/speech",
          callId,
          true
        );
      }

      return speak(res, line("retryName"), "/speech", callId);
    }

    return speak(res, line("goodbye"), "/speech", callId, true);
  } catch (error) {
    console.error("/speech error:", error);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({ voice: "woman" }, "We are sorry, an application error has occurred.");
    res.type("text/xml");
    res.send(twiml.toString());
  }
});

app.listen(PORT, () => {
  console.log(`AI Cashier 1.3.1 Speed Pass listening on port ${PORT}`);
});
