function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "size-7 text-[11px]" : "size-9 text-sm";
  return (
    <span
      className={`flex ${dims} shrink-0 items-center justify-center rounded-full bg-accent-soft font-medium text-accent-strong`}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
