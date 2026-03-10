import express from "express";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();
app.use(express.urlencoded({ extended: false }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post("/voice", async (req, res) => {

  const userSpeech = req.body.SpeechResult || "Hello";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are Jeffrey, a friendly cashier for Flaps and Racks restaurant in Tucson Arizona. Help customers place wing orders."
      },
      {
        role: "user",
        content: userSpeech
      }
    ]
  });

  const reply = completion.choices[0].message.content;

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  twiml.say(reply);

  twiml.gather({
    input: "speech",
    action: "/voice",
    method: "POST"
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Jeffrey AI cashier running on port " + PORT);
});
