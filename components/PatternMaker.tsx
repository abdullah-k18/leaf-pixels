"use client";

import { useEffect, useState } from "react";
import PatternPreview from "@/components/PatternPreview";
import {
  GRID_SIZE,
  PALETTE_BY_KEY,
  PAPERS,
  SUBJECTS,
  SUBJECT_MAX_LENGTH,
  colorCounts,
  type PaperId,
  type PatternResult,
} from "@/lib/config";

const LOADING_STEPS = ["Thinking up your picture…", "Drawing it with the open AI model…", "Turning it into squares…"];

type Status = { state: "idle" } | { state: "loading" } | { state: "error"; message: string };

export default function PatternMaker() {
  const [subject, setSubject] = useState<string>("fox");
  const [custom, setCustom] = useState("");
  const [paper, setPaper] = useState<PaperId>("a4");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [result, setResult] = useState<PatternResult | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

  useEffect(() => {
    if (status.state !== "loading") return;
    const id = setInterval(() => setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 1600);
    return () => clearInterval(id);
  }, [status.state]);

  async function generate(name: string) {
    setLoadingStep(0);
    setStatus({ state: "loading" });
    try {
      const res = await fetch("/api/pattern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ state: "error", message: data.error ?? "Something went wrong. Please try again!" });
        return;
      }
      setResult(data as PatternResult);
      setStatus({ state: "idle" });
      requestAnimationFrame(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth" }));
    } catch {
      setStatus({ state: "error", message: "Couldn't reach the server. Check your internet and try again." });
    }
  }

  async function makePdf() {
    if (!result) return null;
    const { buildPdf } = await import("@/lib/pdf");
    return buildPdf({ title: result.title, fact: result.fact, rows: result.rows, paper });
  }

  async function download() {
    const doc = await makePdf();
    doc?.save(`leaf-pixels-${result!.subject.replace(/\s+/g, "-")}-${paper}.pdf`);
  }

  async function print() {
    const doc = await makePdf();
    if (!doc) return;
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  }

  const chosen = custom.trim() || subject;
  const loading = status.state === "loading";

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-8">
        <Step n={1} title="Pick a picture">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {SUBJECTS.map((s) => {
              const active = !custom.trim() && subject === s.name;
              return (
                <button
                  key={s.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSubject(s.name);
                    setCustom("");
                  }}
                  className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-1 py-2 transition ${
                    active ? "border-rust bg-orange-50" : "border-transparent bg-paper hover:border-line"
                  }`}
                >
                  <span className="text-3xl" aria-hidden>
                    {s.emoji}
                  </span>
                  <span className="text-xs font-semibold capitalize">{s.name}</span>
                </button>
              );
            })}
          </div>
          <label className="mt-4 block text-sm font-semibold text-muted">
            …or type your own (grown-ups can help)
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              maxLength={SUBJECT_MAX_LENGTH}
              placeholder="e.g. turtle, cactus, strawberry"
              className="mt-1 w-full rounded-xl border-2 border-line bg-paper px-4 py-3 text-base text-ink outline-none focus:border-rust"
            />
          </label>
        </Step>

        <Step n={2} title="Paper size" last>
          <PaperPicker value={paper} onChange={setPaper} />
        </Step>

        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => generate(chosen)}
            className="w-full rounded-full bg-rust px-8 py-4 font-display text-xl font-semibold text-white shadow-md transition hover:bg-rust-dark disabled:opacity-70 sm:w-auto"
          >
            {loading ? LOADING_STEPS[loadingStep] : `Make my ${chosen} pattern 🍂`}
          </button>
          {status.state === "error" && (
            <p role="alert" className="rounded-xl bg-orange-50 px-4 py-2 text-center text-rust-dark">
              {status.message}
            </p>
          )}
        </div>
      </section>

      {result && (
        <section id="result" className="scroll-mt-6 rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-3xl font-semibold">{result.title}</h2>
            <p className="text-sm text-muted">
              {GRID_SIZE}×{GRID_SIZE} · 1 square = 1 leaf
            </p>
          </div>

          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="mx-auto w-full max-w-[640px]">
              <PatternPreview rows={result.rows} title={result.title} />
            </div>

            <aside className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-semibold text-muted">
                  Leaf hunt list
                </p>
                <ul className="space-y-1.5">
                  {colorCounts(result.rows).map(({ key, count }) => (
                    <li key={key} className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded" style={{ background: PALETTE_BY_KEY[key].hex }} aria-hidden />
                      <span className="font-bold">{count}</span>
                      <span>{PALETTE_BY_KEY[key].name}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {result.fact && (
                <div className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-4">
                  <p className="font-display font-semibold text-rust-dark">Did you know?</p>
                  <p>{result.fact}</p>
                </div>
              )}

              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- small data URL from the API */}
                <img src={result.sourceImage} alt={`AI drawing of ${result.title}`} className="h-20 w-20 rounded-xl border border-line bg-white object-contain" />
                <p className="text-sm text-muted">The original drawing from the open model, before it was turned into squares.</p>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-muted">Paper</p>
                <PaperPicker value={paper} onChange={setPaper} />
              </div>

              <div className="grid gap-2">
                <button type="button" onClick={download} className="rounded-full bg-moss px-5 py-3 font-display text-lg font-semibold text-white hover:opacity-90">
                  Download PDF
                </button>
                <button type="button" onClick={print} className="rounded-full border-2 border-moss px-5 py-3 font-display text-lg font-semibold text-moss hover:bg-green-50">
                  Print
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => generate(result.subject)}
                  className="rounded-full px-5 py-2 text-sm font-semibold text-muted underline-offset-4 hover:underline disabled:opacity-60"
                >
                  {loading ? LOADING_STEPS[loadingStep] : "Not quite right? Draw it again"}
                </button>
              </div>
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}

function Step({ n, title, children, last }: { n: number; title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={last ? "" : "mb-8"}>
      <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sun text-sm">{n}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function PaperPicker({ value, onChange }: { value: PaperId; onChange: (p: PaperId) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-2" role="radiogroup" aria-label="Paper size">
      {(Object.keys(PAPERS) as PaperId[]).map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={`rounded-full border-2 px-4 py-1.5 font-semibold transition ${
            value === id ? "border-rust bg-rust text-white" : "border-line bg-paper hover:border-muted"
          }`}
        >
          {PAPERS[id].label}
        </button>
      ))}
    </div>
  );
}
