/** A sequential stat strip — for counts that represent stages of a real
 * pipeline, ordered the way the pipeline actually flows (not alphabetically,
 * not as identical boxed cards). */
export function StatStrip({
  items,
  emphasis = "default",
}: {
  items: { label: string; value: number }[];
  emphasis?: "default" | "muted";
}) {
  return (
    <div className="flex gap-0 overflow-x-auto rounded-lg border border-border bg-surface">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`flex min-w-[6.5rem] flex-1 flex-col gap-0.5 px-4 py-3 ${
            i > 0 ? "border-l border-border" : ""
          }`}
        >
          <span
            className={`font-mono text-xl font-medium tabular-nums ${
              emphasis === "muted" ? "text-ink-muted" : "text-ink"
            }`}
          >
            {item.value}
          </span>
          <span className="whitespace-nowrap text-xs text-ink-faint">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
