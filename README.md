# Leaf Pixels 🍁

Pixel art you build **outside**, one leaf at a time.

Pick a picture (a fox, an owl, a pumpkin…), print the pattern, then go outside, collect fallen leaves and lay them on the ground, one leaf per square, until the picture appears. The screen part takes a minute; the rest happens outdoors.

Built for the [Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05).

## How it works

1. **gpt-oss-120b** (open-weight, Apache 2.0), served by [Groq](https://groq.com), checks that the subject is kid-friendly and drawable, writes an image prompt, and comes up with a fun fact.
2. **FLUX.1 [schnell]** (open-weight, Apache 2.0), served by [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/), draws a simple flat icon.
3. The server turns the drawing into a 24×24 grid in a fixed autumn palette (red, orange, yellow, green, brown, black). Each square gets the colour most of its pixels have, thin parts like stems and legs are thickened so they don't vanish, and stray specks are removed.
4. The browser builds a printable PDF (A5, A4, A3 or Letter): page 1 is the pattern with A1-style coordinates, page 2 has the colours, build steps, the fun fact and a space for a photo.

No accounts, no tracking, nothing stored.

## Run it locally

Requires Node.js 20+.

```bash
npm install
```

Create a `.env` file:

```
GROQ_API_KEY=gsk_...
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...   # token made from the "Workers AI" template
```

Optional: `GROQ_MODEL` and `GROQ_BASE_URL` point the text step at any other OpenAI-compatible host of an open model (Ollama, vLLM, OpenRouter…).

```bash
npm run dev
```

Open http://localhost:3000.

## Project layout

| Path | What it does |
| --- | --- |
| `app/page.tsx` | Landing page |
| `components/PatternMaker.tsx` | Subject picker, paper size, result view, PDF buttons |
| `app/api/pattern/route.ts` | API: validates input, rate-limits, runs the pipeline |
| `lib/server/ai.ts` | Groq (gpt-oss-120b) and Cloudflare (FLUX.1 schnell) calls |
| `lib/server/pixelate.ts` | Drawing → 24×24 palette grid |
| `lib/pdf.ts` | Printable two-page PDF (jsPDF) |
| `lib/config.ts` | Palette, paper sizes, subject list |
