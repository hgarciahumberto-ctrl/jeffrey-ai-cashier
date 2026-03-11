import express from "express";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Simple in-memory call state store
// Good for prototype testing
const callSessions = new Map();

function getSession(callSid) {
  if (!callSessions.has(callSid)) {
    callSessions.set(callSid, {
      stage: "greeting",
      greeted: false,
      language: null,
      orderTypeConfirmed: false,
      lastUserMessage: "",
      createdAt: Date.now()
    });
  }
  return callSessions.get(callSid);
}

// Optional cleanup for old sessions
setInterval(() => {
  const now = Date.now();
  for (const [callSid, session] of callSessions.entries()) {
    if (now - session.createdAt > 1000 * 60 * 60) {
      callSessions.delete(callSid);
    }
  }
}, 1000 * 60 * 10);

const SYSTEM_PROMPT = `
You are Jeffrey, the phone cashier for Flaps and Racks restaurant in Tucson, Arizona.

You are warm, polite, calm, friendly, and service-oriented.
You sound like a real restaurant cashier, not a robot.

Important speaking rules:
- Speak in short, clear sentences.
- Ask one question at a time.
- Keep the call moving.
- Do not repeat the greeting unless the call truly just started.
- Do not act like every turn is a brand new call.
- If the customer says they want to order, move forward naturally.
- Confirm instead of assuming.
- Sound welcoming and confident.
- Do not use robotic phrases or technical language.

Core call flow:
1. Greet
2. Confirm language if needed
3. Confirm To-Go
4. Ask what the customer wants
5. Capture item details
6. Ask what else they want
7. Offer one upsell
8. Ask about extra sauces or dressings
9. Recap the order
10. Get order name
11. Give pickup time and close

Restaurant rules:
- Default to To-Go
- Never offer delivery unless customer asks
- Wings must be confirmed as bone-in or boneless
- Ask one logical next cashier question only
- Do not recap too early
- Do not upsell too early

If the customer says:
- "I want to place an order"
- "quiero ordenar"
- "I want wings"
- or anything similar

Then do NOT greet again.
Instead, move to the next cashier step.

If the order has not yet been confirmed as To-Go, ask:
"Will this order be To-Go?"

If To-Go has already been confirmed and the customer is ready to order, ask:
"What can I get started for you today?"

If the customer says "wings", ask:
"Would you like traditional bone-in or boneless?"

If the customer asks for help, guide them like a cashier.

You are not just chatting.
You are guiding a phone order step by step.
`;

app.post("/voice", async (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const callSid = req.body.CallSid || "unknown-call";
  const userSpeech = (req.body.SpeechResult || "").trim();
  const session = getSession(callSid);

  try {
    let reply = "";

    // First turn: greet once
    if (!session.greeted && !userSpeech) {
      reply =
        "Thank you for calling Flaps and Racks. This is Jeffrey. Would you like to order in English or en Español?";
      session.greeted = true;
      session.stage = "language";
    } else {
      session.lastUserMessage = userSpeech;

      const lower = userSpeech.toLowerCase();

      // Lightweight rule-based stage control before AI
      if (
        session.stage === "language" ||
        session.stage === "greeting"
      ) {
        if (
          lower.includes("english") ||
          lower.includes("inglés") ||
          lower.includes("ingles")
        ) {
          session.language = "english";
          session.stage = "order_type";
          reply = "Perfect. Will this order be To-Go?";
        } else if (
          lower.includes("español") ||
          lower.includes("espanol") ||
          lower.includes("spanish")
        ) {
          session.language = "spanish";
          session.stage = "order_type";
          reply = "Perfecto. ¿Este pedido será para llevar?";
        } else if (
          lower.includes("order") ||
          lower.includes("orden") ||
          lower.includes("place an order") ||
          lower.includes("quiero ordenar") ||
          lower.includes("quiero hacer una orden") ||
          lower.includes("i want wings") ||
          lower.includes("wings") ||
          lower.includes("boneless") ||
          lower.includes("burger") ||
          lower.includes("combo")
        ) {
          session.stage = "order_type";
          reply = "Perfect. Will this order be To-Go?";
        }
      }

      if (!reply && session.stage === "order_type") {
        if (
          lower.includes("yes") ||
          lower.includes("to go") ||
          lower.includes("togo") ||
          lower.includes("pick up") ||
          lower.includes("pickup") ||
          lower.includes("para llevar") ||
          lower.includes("sí") ||
          lower.includes("si")
        ) {
          session.orderTypeConfirmed = true;
          session.stage = "item_capture";
          reply =
            session.language === "spanish"
              ? "Perfecto. ¿Qué le preparo hoy?"
              : "Great. What can I get started for you today?";
        } else if (
          lower.includes("dine in") ||
          lower.includes("comer aquí") ||
          lower.includes("aquí")
        ) {
          session.orderTypeConfirmed = true;
          session.stage = "item_capture";
          reply =
            session.language === "spanish"
              ? "Perfecto. ¿Qué le preparo hoy?"
              : "Great. What can I get started for you today?";
        } else if (userSpeech) {
          // If customer continues ordering instead of answering directly, move on
          session.orderTypeConfirmed = true;
          session.stage = "item_capture";
        }
      }

      if (!reply && session.stage === "item_capture") {
        if (
          lower.includes("wings") ||
          lower.includes("wing")
        ) {
          reply =
            session.language === "spanish"
              ? "¿Las quiere tradicionales con hueso o boneless?"
              : "Would you like traditional bone-in or boneless?";
          session.stage = "item_detail";
        } else if (userSpeech) {
          // Use AI once session has moved beyond greeting/order-type
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.5,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "system",
                content: `Current call stage: ${session.stage}. Language: ${session.language || "unknown"}. To-Go confirmed: ${session.orderTypeConfirmed}. The customer has already been greeted: ${session.greeted}.`
              },
              { role: "user", content: userSpeech }
            ]
          });

          reply =
            completion.choices?.[0]?.message?.content?.trim() ||
            "What can I get started for you today?";
        }
      }

      if (!reply && session.stage === "item_detail") {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.5,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "system",
              content: `Current call stage: ${session.stage}. Language: ${session.language || "unknown"}. To-Go confirmed: ${session.orderTypeConfirmed}. The customer has already been greeted: ${session.greeted}.`
            },
            { role: "user", content: userSpeech || "Continue helping the customer with the current item." }
          ]
        });

        reply =
          completion.choices?.[0]?.message?.content?.trim() ||
          "What else can I get for you?";
      }

      if (!reply) {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.5,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "system",
              content: `Current call stage: ${session.stage}. Language: ${session.language || "unknown"}. To-Go confirmed: ${session.orderTypeConfirmed}. The customer has already been greeted: ${session.greeted}.`
            },
            {
              role: "user",
              content:
                userSpeech || "Continue the phone order naturally without repeating the greeting."
            }
          ]
        });

        reply =
          completion.choices?.[0]?.message?.content?.trim() ||
          "How can I help you today?";
      }
    }

    const gather = twiml.gather({
      input: ["speech"],
      action: "/voice",
      method: "POST",
      speechTimeout: "auto",
      enhanced: true
    });

    gather.say(
      { voice: "Polly.Joanna-Generative", language: "en-US" },
      reply
    );

    res.type("text/xml");
    res.status(200).send(twiml.toString());
  } catch (error) {
    console.error("VOICE ERROR:", error);

    const gather = twiml.gather({
      input: ["speech"],
      action: "/voice",
      method: "POST",
      speechTimeout: "auto",
      enhanced: true
    });

    gather.say(
      { voice: "Polly.Joanna-Generative", language: "en-US" },
      "Thank you for calling Flaps and Racks. This is Jeffrey. How can I help you today?"
    );

    res.type("text/xml");
    res.status(200).send(twiml.toString());
  }
});

app.get("/", (_req, res) => {
  res.send("Jeffrey AI cashier is running.");
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Jeffrey AI cashier running on port " + PORT);
});
