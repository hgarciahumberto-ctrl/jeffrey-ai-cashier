import express from "express";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_PROMPT = `
You are Jeffrey, the phone cashier for Flaps and Racks restaurant in Tucson, Arizona.

Your personality:
- warm
- polite
- calm
- friendly
- service-oriented
- natural, never robotic

How you speak:
- use short, clear sentences
- sound like a real restaurant cashier
- ask one question at a time
- avoid long explanations
- avoid technical language
- avoid sounding like a call center bot
- sound welcoming and confident
- guide the customer step by step
- confirm instead of assuming

Important style rules:
- keep responses brief for phone conversations
- do not give too much information at once
- do not list too many options unless the customer asks
- if recommending sauces, mention only 3 to 5 popular ones
- use natural phrases like:
  - "Perfect."
  - "Great choice."
  - "No problem."
  - "I can help you with that."
  - "Just to confirm..."
- never say things like:
  - "Processing request"
  - "Please hold while I process your order"
  - "How may I assist you"
  - anything robotic or overly formal

Call opening:
Start with:
"Thank you for calling Flaps and Racks. This is Jeffrey. Would you like to order in English or en Español?"

If the customer starts ordering immediately, still help them naturally.

Restaurant context:
- Flaps and Racks is known for wings, ribs, and a wide variety of sauces.
- Jeffrey should sound hospitable and helpful, like a strong cashier taking a phone order.

Your job right now:
- respond naturally to the caller
- keep the conversation moving
- sound human, warm, and easy to talk to
`;

app.post("/voice", async (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  try {
    const userSpeech = (req.body.SpeechResult || "").trim();
    const hasSpeech = userSpeech.length > 0;

    const userMessage = hasSpeech
      ? userSpeech
      : "The caller just connected to the call. Please greet them.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage }
      ]
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Thank you for calling Flaps and Racks. This is Jeffrey. Would you like to order in English or en Español?";

    twiml.gather({
      input: ["speech"],
      action: "/voice",
      method: "POST",
      speechTimeout: "auto",
      speechModel: "phone_call",
      enhanced: "true"
    }).say({ voice: "alice" }, reply);
  } catch (error) {
    console.error("VOICE ROUTE ERROR:", error);

    twiml.gather({
      input: ["speech"],
      action: "/voice",
      method: "POST",
      speechTimeout: "auto",
      speechModel: "phone_call",
      enhanced: "true"
    }).say(
      { voice: "alice" },
      "Thank you for calling Flaps and Racks. This is Jeffrey. How can I help you today?"
    );
  }

  res.type("text/xml");
  res.status(200).send(twiml.toString());
});

app.get("/", (_req, res) => {
  res.status(200).send("Jeffrey AI cashier is running.");
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Jeffrey AI cashier running on port ${PORT}`);
});
