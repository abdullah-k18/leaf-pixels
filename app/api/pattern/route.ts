import { GRID_SIZE, MAX_COLORS, SUBJECT_MAX_LENGTH, SUBJECT_PATTERN, type PatternResult } from "@/lib/config";
import { NotDrawableError, drawImage, planSubject } from "@/lib/server/ai";
import { pixelate, thumbnail } from "@/lib/server/pixelate";

export const maxDuration = 60;

// Tiny in-memory rate limit so a public demo can't burn through the free tiers.
// (Per server instance only; good enough for a hackathon deploy.)
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 20;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_REQUESTS;
}

function fail(status: number, error: string, kind: "invalid" | "not-drawable" | "busy" | "server") {
  return Response.json({ error, kind }, { status });
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimited(ip)) return fail(429, "Whoa, lots of patterns! Take a break outside and try again in a few minutes.", "busy");

  let subject: unknown;
  try {
    ({ subject } = await request.json());
  } catch {
    return fail(400, "Bad request.", "invalid");
  }
  if (typeof subject !== "string") return fail(400, "Pick a picture or type something to draw.", "invalid");
  const clean = subject.trim().replace(/\s+/g, " ");
  if (!clean) return fail(400, "Pick a picture or type something to draw.", "invalid");
  if (clean.length > SUBJECT_MAX_LENGTH) return fail(400, "That's a long one! Try just a word or two.", "invalid");
  if (!SUBJECT_PATTERN.test(clean)) return fail(400, "Use letters only, like “owl” or “sunflower”.", "invalid");

  try {
    const plan = await planSubject(clean);
    const image = await drawImage(plan.imagePrompt);
    const result: PatternResult = {
      subject: clean,
      title: plan.title,
      fact: plan.fact,
      rows: await pixelate(image, GRID_SIZE, MAX_COLORS),
      sourceImage: await thumbnail(image),
    };
    return Response.json(result);
  } catch (err) {
    if (err instanceof NotDrawableError) return fail(422, err.message, "not-drawable");
    console.error("[pattern]", err);
    return fail(502, "The drawing robot tripped over a root. Please try again!", "server");
  }
}
