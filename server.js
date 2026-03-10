import express from "express";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post("/voice", async (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  try {

    const userSpeech = req.body.SpeechResult || "Hello";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Jeffrey, a friendly cashier for Flaps and Racks restaurant in Tucson Arizona. Help callers place orders for wings, ribs, burgers and sides."
        },
        {
          role: "user",
          content: userSpeech
        }
      ]
    });

    const reply =
      completion.choices?.[0]?.message?.content ||
      "Welcome to Flaps and Racks. How may I help you today?";

    twiml.say({ voice: "alice" }, reply);

  } catch (error) {

    console.log("OpenAI error:", error.message);

    twiml.say(
      { voice: "alice" },
      "Hello, thank you for calling Flaps and Racks. How may I help you today?"
    );

  }

  twiml.gather({
    input: ["speech"],
    action: "/voice",
    method: "POST",
    speechTimeout: "auto"
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.get("/", (req, res) => {
  res.send("Jeffrey AI cashier is running");
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Jeffrey AI cashier running on port ${PORT}`);
});
