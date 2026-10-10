import "server-only";

// Both models are open-weight:
//   - gpt-oss-120b (Apache 2.0) on Groq checks the subject and writes the prompt + fun fact
//   - FLUX.1 [schnell] (Apache 2.0) on Cloudflare Workers AI draws the picture
// Groq's API is OpenAI-compatible, so GROQ_BASE_URL/GROQ_MODEL can point at any other
// host of an open model (Ollama, vLLM, OpenRouter...) without code changes.

const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const FLUX_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export class NotDrawableError extends Error {}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export type Plan = { title: string; fact: string; imagePrompt: string };

const SYSTEM_PROMPT = `You help children make pixel-art mosaics outdoors from fallen leaves.
The user gives a subject. Decide if it is suitable for young children AND can be drawn as one simple, recognisable icon
(animals, plants, flowers, food, weather, everyday objects, vehicles, simple shapes are fine).
Not allowed: real people or names, brands or characters, text or letters, abstract ideas, anything scary, violent, rude or adult.

Reply with JSON only, in this shape:
{"ok": boolean, "reason": string, "title": string, "fact": string, "image_prompt": string}

- reason: if ok is false, one short friendly sentence for a child explaining why, suggesting something else to try.
- title: the subject in 1-3 words, Title Case.
- fact: one true, simple, cheerful fact about the subject for a 6-year-old (max 20 words). If the subject is an object, a fun fact about it.
- image_prompt: describe ONLY the subject as a single centered flat 2D silhouette-style icon, chunky simple shapes,
  side or front view, filling most of the frame. The whole shape must be filled with solid colour: no white or cream
  areas inside it, no line art, no outlines. Every part must be chunky and thick: thick masts, stems, legs and
  handles, and no thin lines, strings, whiskers or antennae. Use 2 to 4 solid colours chosen from red, orange, yellow, green, brown
  and black, in big blocks. No other objects (no branches, ground, leaves, sparkles, frames or decorations), no text,
  no shading, no shadow, no gradients, plain pure white background.`;

export async function planSubject(subject: string): Promise<Plan> {
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("GROQ_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.4,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: subject },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const raw = JSON.parse(data.choices[0].message.content) as {
    ok?: boolean; reason?: string; title?: string; fact?: string; image_prompt?: string;
  };
  if (!raw.ok || !raw.image_prompt) {
    throw new NotDrawableError(raw.reason || "Hmm, that one is tricky to draw. Try an animal, a plant or a shape!");
  }
  return {
    title: (raw.title || subject).slice(0, 40),
    fact: (raw.fact || "").slice(0, 200),
    imagePrompt: raw.image_prompt.slice(0, 1500),
  };
}

export async function drawImage(prompt: string): Promise<Buffer> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env("CLOUDFLARE_ACCOUNT_ID")}/ai/run/${FLUX_MODEL}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("CLOUDFLARE_API_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, steps: 4 }),
  });
  if (!res.ok) throw new Error(`Cloudflare ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (!data?.result?.image) throw new Error("Cloudflare returned no image");
  return Buffer.from(data.result.image, "base64");
}
