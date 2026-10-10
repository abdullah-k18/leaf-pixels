import PatternMaker from "@/components/PatternMaker";

const STEPS = [
  { emoji: "🦊", title: "Pick a picture", text: "Choose an animal, plant or shape. No typing needed." },
  { emoji: "🖨️", title: "Print your map", text: "Get a square-by-square pattern and a leaf shopping list." },
  { emoji: "🍂", title: "Go outside & build", text: "Collect fallen leaves and lay them out, one per square." },
];

export default function Home() {
  return (
    <div className="dots flex-1">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-6 sm:px-6">
        <div className="flex items-center gap-2">
          <LogoMark />
          <span className="font-display text-2xl font-semibold tracking-tight">Leaf Pixels</span>
        </div>
        <span className="hidden rounded-full border border-line bg-card px-3 py-1 text-sm text-muted sm:inline">
          Powered by open-weight AI
        </span>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <section className="py-10 text-center sm:py-14">
          <h1 className="font-display text-4xl font-semibold leading-tight sm:text-6xl">
            Pixel art you build <span className="text-rust">outside</span>,
            <br className="hidden sm:block" /> one leaf at a time.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            Pick a picture, print the pattern, then head out to collect fallen leaves and turn the lawn into a giant
            mosaic. The screen part takes a minute. The fun part happens outdoors.
          </p>
        </section>

        <ol className="mb-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3 rounded-2xl border border-line bg-card p-4">
              <span className="text-3xl" aria-hidden>
                {step.emoji}
              </span>
              <div>
                <p className="font-display text-lg font-semibold">
                  {i + 1}. {step.title}
                </p>
                <p className="text-sm text-muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <PatternMaker />
      </main>

      <footer className="border-t border-line bg-card/70 px-4 py-6 text-center text-sm text-muted">
        Drawings by <strong>FLUX.1 [schnell]</strong>, ideas and fun facts by <strong>gpt-oss-120b</strong>. Both are
        open-weight models. No accounts, nothing stored.
      </footer>
    </div>
  );
}

function LogoMark() {
  // A tiny 4x4 leaf made of pixels
  const cells = ["..OR", ".ORO", "YOR.", "B..."];
  const colors: Record<string, string> = { O: "#e6781e", R: "#b22222", Y: "#f0c828", B: "#784b28" };
  return (
    <svg width="28" height="28" viewBox="0 0 4 4" aria-hidden className="rounded-md">
      {cells.flatMap((row, y) =>
        [...row].map((c, x) => (c === "." ? null : <rect key={`${x}${y}`} x={x} y={y} width="1" height="1" fill={colors[c]} />)),
      )}
    </svg>
  );
}
