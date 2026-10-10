import { EMPTY, PALETTE_BY_KEY, columnLabel, type ColorKey } from "@/lib/config";

export default function PatternPreview({ rows, title }: { rows: string[]; title: string }) {
  const grid = rows.length;
  const showLetters = grid <= 16;
  return (
    <div
      role="img"
      aria-label={`${grid} by ${grid} pixel pattern of ${title}`}
      className="grid aspect-square w-full select-none text-[clamp(7px,1.6vw,12px)] font-bold"
      style={{ gridTemplateColumns: `repeat(${grid + 1}, minmax(0, 1fr))` }}
    >
      <span />
      {rows[0].split("").map((_, x) => (
        <span key={`c${x}`} className="flex items-center justify-center text-muted">
          {columnLabel(x)}
        </span>
      ))}
      {rows.map((row, y) => [
        <span key={`r${y}`} className="flex items-center justify-center text-muted">
          {y + 1}
        </span>,
        ...row.split("").map((ch, x) => {
          const color = ch === EMPTY ? null : PALETTE_BY_KEY[ch as ColorKey];
          return (
            <span
              key={`${x}-${y}`}
              className="flex items-center justify-center border-[0.5px] border-line"
              style={color ? { background: color.hex, color: "#fff" } : undefined}
            >
              {showLetters && color ? ch : null}
            </span>
          );
        }),
      ])}
    </div>
  );
}
