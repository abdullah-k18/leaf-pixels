// Shared between the server (pixelating) and the browser (preview + PDF).

export type ColorKey = "R" | "O" | "Y" | "G" | "B" | "K";

export type PaletteColor = {
  key: ColorKey;
  hex: string;
  rgb: [number, number, number];
  name: string;
};

// Colours you can actually find on the ground in October.
export const PALETTE: PaletteColor[] = [
  { key: "R", hex: "#b22222", rgb: [178, 34, 34], name: "Red" },
  { key: "O", hex: "#e6781e", rgb: [230, 120, 30], name: "Orange" },
  { key: "Y", hex: "#f0c828", rgb: [240, 200, 40], name: "Yellow" },
  { key: "G", hex: "#468c32", rgb: [70, 140, 50], name: "Green" },
  { key: "B", hex: "#784b28", rgb: [120, 75, 40], name: "Brown" },
  { key: "K", hex: "#2d231e", rgb: [45, 35, 30], name: "Black" },
];

export const PALETTE_BY_KEY = Object.fromEntries(PALETTE.map((p) => [p.key, p])) as Record<ColorKey, PaletteColor>;

export const EMPTY = ".";

// Every pattern is a 24x24 grid using up to all 6 palette colours.
export const GRID_SIZE = 24;
export const MAX_COLORS = 6;

export type PaperId = "a5" | "a4" | "a3" | "letter";

export const PAPERS: Record<PaperId, { label: string; width: number; height: number }> = {
  a5: { label: "A5", width: 148, height: 210 },
  a4: { label: "A4", width: 210, height: 297 },
  a3: { label: "A3", width: 297, height: 420 },
  letter: { label: "Letter", width: 215.9, height: 279.4 },
};

// Picture menu, so young kids never have to type.
export const SUBJECTS: { name: string; emoji: string }[] = [
  { name: "fox", emoji: "🦊" },
  { name: "owl", emoji: "🦉" },
  { name: "hedgehog", emoji: "🦔" },
  { name: "squirrel", emoji: "🐿️" },
  { name: "cat", emoji: "🐱" },
  { name: "dog", emoji: "🐶" },
  { name: "rabbit", emoji: "🐰" },
  { name: "bear", emoji: "🐻" },
  { name: "fish", emoji: "🐟" },
  { name: "butterfly", emoji: "🦋" },
  { name: "snail", emoji: "🐌" },
  { name: "bird", emoji: "🐦" },
  { name: "maple leaf", emoji: "🍁" },
  { name: "mushroom", emoji: "🍄" },
  { name: "acorn", emoji: "🌰" },
  { name: "sunflower", emoji: "🌻" },
  { name: "tulip", emoji: "🌷" },
  { name: "tree", emoji: "🌳" },
  { name: "apple", emoji: "🍎" },
  { name: "pumpkin", emoji: "🎃" },
  { name: "sun", emoji: "☀️" },
  { name: "moon", emoji: "🌙" },
  { name: "star", emoji: "⭐" },
  { name: "heart", emoji: "❤️" },
  { name: "house", emoji: "🏠" },
  { name: "rocket", emoji: "🚀" },
  { name: "sailboat", emoji: "⛵" },
  { name: "rainbow", emoji: "🌈" },
];

export const SUBJECT_MAX_LENGTH = 40;

// Letters, spaces, hyphens and apostrophes only: keeps prompts clean and blocks prompt tricks.
export const SUBJECT_PATTERN = /^[\p{L}][\p{L} '\-]*$/u;

export type PatternResult = {
  subject: string;
  title: string;
  fact: string;
  rows: string[]; // GRID_SIZE rows of ColorKey or "."
  sourceImage: string; // small data URL of the original drawing
};

export function colorCounts(rows: string[]): { key: ColorKey; count: number }[] {
  const counts = new Map<ColorKey, number>();
  for (const row of rows) for (const ch of row) if (ch !== EMPTY) counts.set(ch as ColorKey, (counts.get(ch as ColorKey) ?? 0) + 1);
  return PALETTE.filter((p) => counts.has(p.key)).map((p) => ({ key: p.key, count: counts.get(p.key)! }));
}

// Column labels for the grid edges: A..Z then AA, AB...
export function columnLabel(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : "A" + String.fromCharCode(65 + i - 26);
}
