/** Abstract ascending-path mark — the lifecycle moving from application to alumni. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <path
        d="M8 21.5L13 15.5L17.5 19L24 10.5"
        stroke="currentColor"
        className="text-accent-contrast"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="10.5" r="2" className="fill-gold" />
    </svg>
  );
}
