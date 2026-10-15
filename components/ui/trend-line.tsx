/** A single-series trend line — one metric, one hue, labeled at the last
 * point. Two metrics of different scale (GPA vs attendance %) always get
 * two of these side by side, never one chart with two y-axes. */
export function TrendLine({
  title,
  points,
  format,
}: {
  title: string;
  points: { label: string; value: number }[];
  format: (v: number) => string;
}) {
  if (points.length === 0) {
    return (
      <div>
        <p className="text-xs font-medium text-ink-muted">{title}</p>
        <p className="mt-2 text-sm text-ink-faint">No data yet.</p>
      </div>
    );
  }

  const W = 240;
  const H = 72;
  const PAD = 10;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = points.length === 1 ? W / 2 : PAD + (i / (points.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((p.value - min) / range) * (H - PAD * 2);
    return { x, y, ...p };
  });

  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  const trendingDown = points.length >= 2 && points[points.length - 1].value < points[points.length - 2].value;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-ink-muted">{title}</p>
        <span className={`font-mono text-sm font-medium tabular-nums ${trendingDown ? "text-danger" : "text-ink"}`}>
          {format(last.value)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label={`${title} trend: ${points.map((p) => format(p.value)).join(", ")}`}>
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="stroke-border" strokeWidth={1} />
        <path d={path} fill="none" className={trendingDown ? "stroke-danger" : "stroke-accent"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 3 : 2} className={trendingDown ? "fill-danger" : "fill-accent"} />
        ))}
      </svg>
      <div className="mt-0.5 flex justify-between text-[10px] text-ink-faint">
        <span>{points[0].label}</span>
        {points.length > 1 && <span>{points[points.length - 1].label}</span>}
      </div>
    </div>
  );
}
