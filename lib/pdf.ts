import { jsPDF } from "jspdf";
import {
  EMPTY,
  PALETTE_BY_KEY,
  PAPERS,
  colorCounts,
  columnLabel,
  type ColorKey,
  type PaperId,
} from "@/lib/config";

export type PdfInput = {
  title: string;
  fact: string;
  rows: string[];
  paper: PaperId;
};

const INK: [number, number, number] = [43, 33, 24];
const MUTED: [number, number, number] = [120, 105, 90];
const LINE: [number, number, number] = [205, 195, 180];
const PT_PER_MM = 2.835;

// Lighter fill saves ink while keeping colours easy to tell apart.
function tint([r, g, b]: [number, number, number], amount = 0.7): [number, number, number] {
  return [r, g, b].map((c) => Math.round(255 - (255 - c) * amount)) as [number, number, number];
}

// Letters inside coloured squares are always white.
const WHITE: [number, number, number] = [255, 255, 255];

export function buildPdf(input: PdfInput): jsPDF {
  const paper = PAPERS[input.paper];
  const W = paper.width, H = paper.height;
  const scale = Math.min(1.25, Math.max(0.75, W / 210)); // font scale relative to A4
  const m = 12 * Math.max(0.8, scale);
  const doc = new jsPDF({ unit: "mm", format: [W, H], orientation: "portrait" });
  doc.setProperties({ title: `Leaf Pixels – ${input.title}`, creator: "Leaf Pixels" });

  drawPatternPage(doc, input, { W, H, m, scale, grid: input.rows.length });
  doc.addPage([W, H], "portrait");
  drawListPage(doc, input, { W, H, m, scale, grid: input.rows.length });
  return doc;
}

type Frame = { W: number; H: number; m: number; scale: number; grid: number };

function header(doc: jsPDF, text: string, sub: string, f: Frame): number {
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22 * f.scale);
  doc.text(text, f.m, f.m + 7 * f.scale);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10 * f.scale);
  doc.setTextColor(...MUTED);
  doc.text(sub, f.m, f.m + 13 * f.scale);
  return f.m + 19 * f.scale;
}

function drawPatternPage(doc: jsPDF, input: PdfInput, f: Frame) {
  const top = header(
    doc,
    input.title,
    `Leaf Pixels  ·  ${f.grid}×${f.grid}  ·  1 square = 1 leaf`,
    f,
  );

  // Legend at the bottom: one chip per colour used.
  const used = colorCounts(input.rows);
  const legendRowH = 7 * f.scale;
  const chipW = (f.W - 2 * f.m) / Math.min(3, Math.max(1, used.length));
  const legendRows = Math.ceil(used.length / 3);
  const legendTop = f.H - f.m - legendRows * legendRowH;

  // Grid: one extra row/column for the coordinate labels.
  const availW = f.W - 2 * f.m;
  const availH = legendTop - 4 - top;
  const cell = Math.min(availW, availH) / (f.grid + 1);
  const gridSize = cell * (f.grid + 1);
  const ox = f.m + (availW - gridSize) / 2 + cell; // top-left of the first cell
  const oy = top + (availH - gridSize) / 2 + cell;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(Math.min(11, cell * PT_PER_MM * 0.45));
  doc.setTextColor(...MUTED);
  for (let i = 0; i < f.grid; i++) {
    doc.text(columnLabel(i), ox + i * cell + cell / 2, oy - cell / 2, { align: "center", baseline: "middle" });
    doc.text(String(i + 1), ox - cell / 2, oy + i * cell + cell / 2, { align: "center", baseline: "middle" });
  }

  doc.setLineWidth(0.15);
  doc.setDrawColor(...LINE);
  doc.setFontSize(Math.min(14, cell * PT_PER_MM * 0.5));
  input.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const cx = ox + x * cell, cy = oy + y * cell;
      if (ch === EMPTY) {
        doc.rect(cx, cy, cell, cell, "S");
        return;
      }
      const color = PALETTE_BY_KEY[ch as ColorKey];
      const fill = tint(color.rgb);
      doc.setFillColor(...fill);
      doc.rect(cx, cy, cell, cell, "FD");
      doc.setTextColor(...WHITE);
      doc.text(ch, cx + cell / 2, cy + cell / 2, { align: "center", baseline: "middle" });
    });
  });
  // Thicker border every 4 squares makes counting easier.
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.4);
  for (let i = 0; i <= f.grid; i += 4) {
    doc.line(ox + i * cell, oy, ox + i * cell, oy + f.grid * cell);
    doc.line(ox, oy + i * cell, ox + f.grid * cell, oy + i * cell);
  }
  doc.rect(ox, oy, f.grid * cell, f.grid * cell, "S");

  // Legend
  doc.setFontSize(10 * f.scale);
  used.forEach(({ key }, i) => {
    const lx = f.m + (i % 3) * chipW;
    const ly = legendTop + Math.floor(i / 3) * legendRowH;
    const s = 5 * f.scale;
    const fill = tint(PALETTE_BY_KEY[key].rgb);
    doc.setFillColor(...fill);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.rect(lx, ly, s, s, "FD");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text(key, lx + s / 2, ly + s / 2, { align: "center", baseline: "middle" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(PALETTE_BY_KEY[key].name, lx + s + 2, ly + s / 2, { baseline: "middle" });
  });
}

function drawListPage(doc: jsPDF, input: PdfInput, f: Frame) {
  const s = f.scale;
  const width = f.W - 2 * f.m;
  let y = header(
    doc,
    "Your leaf hunt",
    "Only pick up leaves that have already fallen.",
    f,
  );

  // Collecting list
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13 * s);
  doc.setTextColor(...INK);
  doc.text("Colours", f.m, y + 4 * s);
  y += 9 * s;
  for (const { key } of colorCounts(input.rows)) {
    const box = 6 * s;
    doc.setFillColor(...tint(PALETTE_BY_KEY[key].rgb));
    doc.rect(f.m, y, box, box, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10 * s);
    doc.setTextColor(...WHITE);
    doc.text(key, f.m + box / 2, y + box / 2, { align: "center", baseline: "middle" });
    doc.setTextColor(...INK);
    doc.setFontSize(12 * s);
    doc.text(PALETTE_BY_KEY[key].name, f.m + box + 4, y + box / 2, { baseline: "middle" });
    y += box + 3 * s;
  }

  // How to build it
  y += 4 * s;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13 * s);
  doc.text("How to build it", f.m, y);
  y += 6 * s;
  const steps = [
    "Go on a leaf hunt and collect leaves in each of these colours.",
    "Find a flat patch of grass or path. Lay a long stick down as your top edge.",
    "Start at square A1. Put one leaf for each coloured square and leave a gap for each blank one.",
    "Build row 1 from left to right, then row 2 under it, and keep going.",
    "Stand back (or climb something safe!) and look at your picture appear.",
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11 * s);
  steps.forEach((step, i) => {
    const lines = doc.splitTextToSize(step, width - 8 * s) as string[];
    doc.setFont("helvetica", "bold");
    doc.text(`${i + 1}.`, f.m, y);
    doc.setFont("helvetica", "normal");
    doc.text(lines, f.m + 7 * s, y);
    y += lines.length * 5 * s + 2 * s;
  });

  // Fun fact
  if (input.fact) {
    y += 3 * s;
    const lines = doc.splitTextToSize(input.fact, width - 10 * s) as string[];
    const boxH = 12 * s + lines.length * 5 * s;
    doc.setFillColor(253, 243, 224);
    doc.setDrawColor(230, 120, 30);
    doc.setLineWidth(0.5);
    doc.roundedRect(f.m, y, width, boxH, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11 * s);
    doc.setTextColor(178, 80, 20);
    doc.text(`Did you know? (${input.title})`, f.m + 5 * s, y + 7 * s);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(lines, f.m + 5 * s, y + 13 * s);
    y += boxH + 5 * s;
  }

  // Photo box with whatever space is left
  const footerY = f.H - f.m;
  const photoH = footerY - 8 * s - y;
  if (photoH > 25) {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([2, 2], 0);
    doc.roundedRect(f.m, y, width, photoH, 3, 3, "S");
    doc.setLineDashPattern([], 0);
    doc.setFontSize(11 * s);
    doc.setTextColor(...MUTED);
    doc.text("Stick or draw a picture of your finished mosaic here!", f.W / 2, y + photoH / 2, { align: "center", baseline: "middle" });
  }

  doc.setFontSize(8 * s);
  doc.setTextColor(...MUTED);
  doc.text(
    "Made with Leaf Pixels using open-weight AI: gpt-oss-120b (ideas) + FLUX.1 schnell (drawing).",
    f.W / 2,
    footerY,
    { align: "center" },
  );
}
