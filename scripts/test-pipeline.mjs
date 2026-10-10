// Quick quality check: subject -> Groq (open LLM) -> FLUX.1 schnell (Cloudflare) -> pixel grid.
// Usage: node scripts/test-pipeline.mjs [subject ...]   (defaults to a list of sample subjects)
// Prints each grid in the terminal and writes source images + previews to ./out/
import fs from "node:fs";
import sharp from "sharp";

// --- env -------------------------------------------------------------------
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { GROQ_API_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = process.env;
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const missing = ["GROQ_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(", ")}`);
  process.exit(1);
}

const GRID = Number(process.env.GRID || 24);

// Fall-leaf palette: what you can actually find on the ground in October.
const PALETTE = [
  { key: "R", name: "red leaves", rgb: [178, 34, 34] },
  { key: "O", name: "orange leaves", rgb: [230, 120, 30] },
  { key: "Y", name: "yellow leaves", rgb: [240, 200, 40] },
  { key: "G", name: "green leaves / grass", rgb: [70, 140, 50] },
  { key: "B", name: "brown leaves", rgb: [120, 75, 40] },
  { key: "K", name: "bark / dark twigs", rgb: [45, 35, 30] },
];

// --- step 1: Groq checks the subject and writes the image prompt ------------
async function planWithGroq(subject) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You help make simple pixel-art mosaics that people build outdoors from fallen leaves. " +
            "Given a subject, decide if it can be drawn as a simple recognisable silhouette-style icon " +
            "(animals, plants, flowers, everyday objects, basic shapes are fine; abstract concepts, people's names, " +
            "brands, text, violent or sexual content are not). Reply with JSON only: " +
            '{"ok": boolean, "reason": string, "title": string, ' +
            '"image_prompt": string}. image_prompt must describe a single centered flat 2D icon of the subject, ' +
            "side or front view, bold simple shapes, 3 to 5 solid warm autumn colors (red, orange, yellow, brown, green), " +
            "thick shapes, no outlines thinner than the shape, no text, no shading, no gradients, plain pure white background.",
        },
        { role: "user", content: subject },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// --- step 2: FLUX.1 [schnell] on Cloudflare Workers AI draws it -------------
async function drawWithFlux(prompt) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, steps: 4 }),
  });
  if (!res.ok) throw new Error(`Cloudflare ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Buffer.from(data.result.image, "base64");
}

// --- step 3: shrink to a grid and snap to the palette ------------------------
function nearestColor([r, g, b]) {
  let best = null;
  let bestDist = Infinity;
  for (const p of PALETTE) {
    // "redmean" distance: cheap and closer to how eyes see colour than plain RGB
    const rm = (r + p.rgb[0]) / 2;
    const dr = r - p.rgb[0], dg = g - p.rgb[1], db = b - p.rgb[2];
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

function isBackground([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return min > 215 && max - min < 30; // near-white, low saturation
}

async function toGrid(imageBuf) {
  const { data } = await sharp(imageBuf)
    .flatten({ background: "#ffffff" })
    .trim({ background: "#ffffff", threshold: 30 }) // crop to the subject so it fills the grid
    .resize(GRID, GRID, { fit: "contain", background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rows = [];
  for (let y = 0; y < GRID; y++) {
    let row = "";
    for (let x = 0; x < GRID; x++) {
      const i = (y * GRID + x) * 3;
      const px = [data[i], data[i + 1], data[i + 2]];
      row += isBackground(px) ? "." : nearestColor(px).key;
    }
    rows.push(row);
  }
  return rows;
}

// --- output -------------------------------------------------------------------
function printGrid(rows) {
  const byKey = Object.fromEntries(PALETTE.map((p) => [p.key, p]));
  for (const row of rows) {
    let line = "";
    for (const ch of row) {
      if (ch === ".") line += "\x1b[48;2;250;250;245m  \x1b[0m";
      else { const [r, g, b] = byKey[ch].rgb; line += `\x1b[48;2;${r};${g};${b}m  \x1b[0m`; }
    }
    console.log(line);
  }
}

async function savePreview(rows, file) {
  const cell = 16;
  const byKey = Object.fromEntries(PALETTE.map((p) => [p.key, p]));
  const raw = Buffer.alloc(GRID * cell * GRID * cell * 3);
  for (let y = 0; y < GRID * cell; y++) {
    for (let x = 0; x < GRID * cell; x++) {
      const ch = rows[Math.floor(y / cell)][Math.floor(x / cell)];
      const gridLine = x % cell === 0 || y % cell === 0;
      const rgb = gridLine ? [200, 200, 200] : ch === "." ? [255, 255, 255] : byKey[ch].rgb;
      raw.set(rgb, (y * GRID * cell + x) * 3);
    }
  }
  await sharp(raw, { raw: { width: GRID * cell, height: GRID * cell, channels: 3 } }).png().toFile(file);
}

const subjects = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["fox", "maple leaf", "mushroom", "owl", "pumpkin", "sunflower", "heart", "acorn", "cat", "my tax return"];

fs.mkdirSync(new URL("../out/", import.meta.url), { recursive: true });

for (const subject of subjects) {
  console.log(`\n=== ${subject} ===`);
  try {
    const t0 = Date.now();
    const plan = await planWithGroq(subject);
    const t1 = Date.now();
    if (!plan.ok) {
      console.log(`rejected by LLM (${t1 - t0} ms): ${plan.reason}`);
      continue;
    }
    console.log(`title: ${plan.title}  (Groq ${t1 - t0} ms)`);
    console.log(`prompt: ${plan.image_prompt}`);
    const img = await drawWithFlux(plan.image_prompt);
    const t2 = Date.now();
    const rows = await toGrid(img);
    console.log(`FLUX ${t2 - t1} ms`);
    printGrid(rows);
    const slug = subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    fs.writeFileSync(new URL(`../out/${slug}-source.jpg`, import.meta.url), img);
    await savePreview(rows, new URL(`../out/${slug}-grid.png`, import.meta.url).pathname);
  } catch (err) {
    console.log(`error: ${err.message}`);
  }
}
console.log("\nSource images and grid previews saved in ./out/");
