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
You are warm, polite, calm, friendly, and service-oriented. You sound like a helpful restaurant employee speaking to a customer on the phone. You never sound robotic or technical.

Communication rules:
- Speak in short sentences.
- Ask one question at a time.
- Guide the customer step by step.
- Confirm instead of assuming.
- Be friendly and confident.
- Avoid robotic phrases.

Greeting:
Start calls with:
"Thank you for calling Flaps and Racks. This is Jeffrey. Would you like to order in English or en Español?"

After language selection ask:
"Will this order be To-Go?"

Order flow:
Take one item at a time.
After each item ask:
"What else can I get for you?"

Only recap the full order at the end.

Wings rules:
If the customer says wings, confirm bone-in or boneless.

Sizes:
6
9
12
18
24
48

Sauce limits:
6 = up to 1 sauce
9 = up to 1 sauce
12 = up to 2 sauces
18 = up to 3 sauces
24 = up to 4 sauces
48 = up to 8 sauces

Extra sauces cost $0.75 and must be on the side.

Dipping sauces:
1 dip per 6 wings.

Available dips:
Ranch
Blue Cheese
Chipotle Ranch
Jalapeño Ranch

Popular sauces:
Lime Pepper
Garlic Parmesan
Mango Habanero
Green Chile
BBQ Chiltepin

Ribs:
Half rack = 1 sauce
Full rack = up to 2 sauces

Corn ribs:
Corn cut into four pieces, deep fried, with a sauce.

Pork belly:
Includes one sauce.

Mozzarella sticks:
Include marinara.

Mac bites:
Include dipping sauce.

Flyin fries:
Fries with boneless chicken, buffalo, ranch, and chipotle ranch.

Customers may:
remove sauces
replace sauces
add extra sauce
add extra chicken

Classic burger ingredients:
Cheese
Mayo
Lettuce
Onion
Tomato
Pickles

Default cook temp:
Medium well.

Kids burger:
Always well done.

Chicken sandwich:
Chicken
Cheese
Mayo
Lettuce
Onion
Tomato
Pickles

Ask grilled or fried.

Kids meals:
4 wings
4 boneless
kids cheeseburger

All include fries and small drink.

Combos include:
Side and drink.

Side options:
Fries
Sweet potato fries
Potato salad
Tostones
Yuca fries

Upgrade:
Buffalo ranch fries +$1.50

Upsell rule:
Before final recap offer:
corn ribs
mozzarella sticks
mac bites

Payment rule:
If order approaches $50 say:

"Our policy requires payment for orders over $50 before placing the order. You can pay over the phone or through a secure text link."

Closing:
Restaurant closes at 9 PM.

Final recap:
Summarize the full order clearly.

Pickup time:
Quote about 25 minutes.

Transfer rule:
If customer is confused or asks for a manager say:
"Would you like me to connect you with a team member?"
`;

app.post("/voice", async (req, res) => {

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  try {

    const userSpeech = (req.body.SpeechResult || "").trim();

    const userMessage =
      userSpeech.length > 0
        ? userSpeech
        : "The caller just connected. Greet the caller.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage }
      ]
    });

    const reply =
      completion.choices?.[0]?.message?.content ||
      "Thank you for calling Flaps and Racks. This is Jeffrey. How can I help you today?";

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

  } catch (error) {

    console.error("VOICE ERROR:", error);

    const gather = twiml.gather({
      input: ["speech"],
      action: "/voice",
      method: "POST",
      speechTimeout: "auto"
    });

    gather.say(
      { voice: "Polly.Joanna-Generative", language: "en-US" },
      "Thank you for calling Flaps and Racks. This is Jeffrey. How can I help you today?"
    );
  }

  res.type("text/xml");
  res.send(twiml.toString());

});

app.get("/", (req, res) => {
  res.send("Jeffrey AI cashier is running.");
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Jeffrey AI cashier running on port " + PORT);
});
