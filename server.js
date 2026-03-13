import express from "express";
import twilio from "twilio";

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

app.get("/", (_req, res) => {
  res.json({ ok: true, route: "/" });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, route: "/health" });
});

app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: "/speech",
    method: "POST",
    speechTimeout: "auto"
  });

  gather.say(
    "Thank you for calling Flaps and Racks. This is Jeffrey. Please say hello after the beep."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/speech", (req, res) => {
  const speech = req.body.SpeechResult || "";

  console.log("TWILIO SPEECH RESULT:", speech);
  console.log("TWILIO BODY:", JSON.stringify(req.body, null, 2));

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(`I heard: ${speech || "nothing"}`);
  twiml.hangup();

  res.type("text/xml");
  res.send(twiml.toString());
});

app.listen(PORT, () => {
  console.log(`Diagnostic server listening on port ${PORT}`);
});
