import "server-only";
import sharp from "sharp";
import { EMPTY, PALETTE, type ColorKey } from "@/lib/config";

// Each grid cell is sampled from this many source pixels per side.
const SAMPLES_PER_CELL = 8;

// "redmean" distance: cheap and closer to how eyes see colour than plain RGB.
function colorDistance(a: readonly number[], b: readonly number[]): number {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

function nearestIndex(rgb: readonly number[], allowed: readonly number[]): number {
  let best = allowed[0];
  let bestDist = Infinity;
  for (const i of allowed) {
    const d = colorDistance(rgb, PALETTE[i].rgb);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

const BG = -1;
const INDEX = Object.fromEntries(PALETTE.map((p, i) => [p.key, i])) as Record<ColorKey, number>;

/**
 * Sort a pixel into background or one palette colour by its hue and lightness, rather than by
 * plain colour distance. Hue doesn't change when a shape's edge fades into the white background,
 * so soft edges keep their shape's colour instead of becoming a fringe of a different one.
 */
function classify(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const chroma = max - min;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  if (max < 60) return INDEX.K; // very dark
  if (chroma < 40) return lum >= 170 ? BG : INDEX.K; // greys: light = paper/shadow, dark = black

  let hue: number;
  if (max === r) hue = (60 * ((g - b) / chroma) + 360) % 360;
  else if (max === g) hue = 60 * ((b - r) / chroma) + 120;
  else hue = 60 * ((r - g) / chroma) + 240;

  if (hue >= 345 || hue < 12) return INDEX.R;
  if (hue < 45) return lum < 110 ? INDEX.B : INDEX.O; // brown is a dark orange
  if (hue < 70) return lum < 110 ? INDEX.B : INDEX.Y;
  if (hue < 170) return INDEX.G;
  // Blues and purples aren't on the ground in autumn: use the closest palette colour.
  return nearestIndex([r, g, b], PALETTE.map((_, i) => i));
}

/**
 * Find the subject's bounding box from the pixels that aren't background.
 * More robust than sharp's trim(), which gets stuck on faint drop shadows.
 */
async function subjectBox(image: Buffer) {
  const probe = 256;
  const { data, info } = await sharp(image)
    .flatten({ background: "#ffffff" })
    .resize(probe, probe, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rowHits = new Array(info.height).fill(0);
  const colHits = new Array(info.width).fill(0);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      if (classify(data[i], data[i + 1], data[i + 2]) !== BG) { rowHits[y]++; colHits[x]++; }
    }
  }
  // A row/column counts only if a few pixels in it are "ink", which ignores stray specks.
  const first = (hits: number[]) => hits.findIndex((h) => h >= 3);
  const last = (hits: number[]) => hits.length - 1 - [...hits].reverse().findIndex((h) => h >= 3);
  const top = first(rowHits), left = first(colHits);
  if (top === -1 || left === -1) return null;
  const meta = await sharp(image).metadata();
  const sx = meta.width! / info.width, sy = meta.height! / info.height;
  const box = {
    left: Math.floor(left * sx),
    top: Math.floor(top * sy),
    width: Math.ceil((last(colHits) - left + 1) * sx),
    height: Math.ceil((last(rowHits) - top + 1) * sy),
  };
  box.width = Math.min(box.width, meta.width! - box.left);
  box.height = Math.min(box.height, meta.height! - box.top);
  return box;
}

/** Crop the drawing to its subject and sample it at SAMPLES_PER_CELL x grid resolution. */
async function samplePixels(image: Buffer, grid: number) {
  const size = grid * SAMPLES_PER_CELL;
  const box = await subjectBox(image);
  const cropped = sharp(image).flatten({ background: "#ffffff" });
  if (box) cropped.extract(box);
  const { data } = await sharp(await cropped.toBuffer())
    .resize(size, size, { fit: "contain", background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Classify every pixel once: background or palette index.
  const classes = new Int8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    classes[i] = classify(r, g, b);
  }
  return { classes: thickenThinParts(classes, size), size };
}

/** Square min/max filter of radius r over a 0/1 mask (separable: rows, then columns). */
function squareFilter(mask: Uint8Array, size: number, r: number, mode: "min" | "max"): Uint8Array {
  const pick = mode === "min" ? Math.min : Math.max;
  const pass = (src: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(size * size);
    for (let a = 0; a < size; a++) {
      for (let b = 0; b < size; b++) {
        let v = mode === "min" ? 1 : 0;
        for (let k = -r; k <= r; k++) {
          const p = b + k;
          // Outside the image counts as background.
          const s = p < 0 || p >= size ? 0 : horizontal ? src[a * size + p] : src[p * size + a];
          v = pick(v, s);
        }
        out[horizontal ? a * size + b : b * size + a] = v;
      }
    }
    return out;
  };
  return pass(pass(mask, true), false);
}

/**
 * Lines thinner than about half a grid cell (masts, legs, stems, antennae) would lose every
 * cell vote to the white background and vanish. Find them with a morphological opening
 * and grow them to a full cell's width, keeping their own colour.
 */
function thickenThinParts(classes: Int8Array, size: number): Int8Array {
  const ink = new Uint8Array(size * size);
  for (let i = 0; i < ink.length; i++) ink[i] = classes[i] === BG ? 0 : 1;
  const opened = squareFilter(squareFilter(ink, size, 2, "min"), size, 2, "max");

  const out = Int8Array.from(classes);
  const dist = new Int16Array(size * size).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < ink.length; i++) {
    if (ink[i] && !opened[i]) { dist[i] = 0; queue.push(i); }
  }
  // Breadth-first growth (8-neighbour, so distance is in "square" steps), painting only background.
  const reach = Math.ceil(SAMPLES_PER_CELL / 2);
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    if (dist[i] >= reach) continue;
    const x = i % size, y = (i - x) / size;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (dist[n] !== -1 || ink[n]) continue;
        dist[n] = dist[i] + 1;
        out[n] = out[i];
        queue.push(n);
      }
    }
  }
  return out;
}

/**
 * Turn each cell into the most common colour among its pixels (a vote, not an average),
 * so soft edges don't turn into a fringe of in-between colours.
 */
function voteCells(classes: Int8Array, size: number, grid: number): number[][] {
  const cells: number[][] = [];
  for (let gy = 0; gy < grid; gy++) {
    const row: number[] = [];
    for (let gx = 0; gx < grid; gx++) {
      const votes = new Array(PALETTE.length).fill(0);
      let bg = 0;
      for (let y = 0; y < SAMPLES_PER_CELL; y++) {
        for (let x = 0; x < SAMPLES_PER_CELL; x++) {
          const c = classes[(gy * SAMPLES_PER_CELL + y) * size + gx * SAMPLES_PER_CELL + x];
          if (c === BG) bg++;
          else votes[c]++;
        }
      }
      const total = SAMPLES_PER_CELL * SAMPLES_PER_CELL;
      if (bg > total * 0.5) row.push(BG);
      else row.push(votes.indexOf(Math.max(...votes)));
    }
    cells.push(row);
  }
  return cells;
}

/** Keep only the `maxColors` most-used colours; repaint the rest with the closest kept one. */
function limitColors(cells: number[][], maxColors: number): number[][] {
  const usage = new Array(PALETTE.length).fill(0);
  for (const row of cells) for (const c of row) if (c !== BG) usage[c]++;
  const kept = usage
    .map((count, i) => ({ count, i }))
    .filter((u) => u.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors)
    .map((u) => u.i);
  if (kept.length === 0) return cells;
  return cells.map((row) => row.map((c) => (c === BG || kept.includes(c) ? c : nearestIndex(PALETTE[c].rgb, kept))));
}

/** Drop small specks that aren't connected to the main picture (stray leaves, sparkles, etc.). */
function removeSpecks(cells: number[][]): number[][] {
  const h = cells.length, w = cells[0].length;
  const label = cells.map((row) => row.map(() => -1));
  const sizes: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cells[y][x] === BG || label[y][x] !== -1) continue;
      const id = sizes.length;
      let size = 0;
      const stack = [[x, y]];
      label[y][x] = id;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        size++;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (cells[ny][nx] === BG || label[ny][nx] !== -1) continue;
            label[ny][nx] = id;
            stack.push([nx, ny]);
          }
        }
      }
      sizes.push(size);
    }
  }
  if (sizes.length <= 1) return cells;
  const largest = Math.max(...sizes);
  const minKeep = Math.max(4, largest * 0.08);
  return cells.map((row, y) => row.map((c, x) => (c === BG || sizes[label[y][x]] >= minKeep ? c : BG)));
}

function toRows(cells: number[][]): string[] {
  return cells.map((row) => row.map((c) => (c === BG ? EMPTY : (PALETTE[c].key as ColorKey))).join(""));
}

/** Turn a drawing into rows of palette keys ("." = empty square). */
export async function pixelate(image: Buffer, grid: number, maxColors: number): Promise<string[]> {
  const { classes, size } = await samplePixels(image, grid);
  return toRows(removeSpecks(limitColors(voteCells(classes, size, grid), maxColors)));
}

/** Small preview of the original drawing to show next to the pattern. */
export async function thumbnail(image: Buffer): Promise<string> {
  const jpg = await sharp(image).resize(256, 256, { fit: "inside" }).jpeg({ quality: 75 }).toBuffer();
  return `data:image/jpeg;base64,${jpg.toString("base64")}`;
}
