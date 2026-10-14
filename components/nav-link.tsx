"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({
  href,
  label,
  icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-accent-soft text-accent-strong" : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full transition-opacity ${
          active ? "bg-accent opacity-100" : "opacity-0"
        }`}
      />
      <span className="shrink-0 [&>svg]:size-4" aria-hidden>
        {icon}
      </span>
      {label}
    </Link>
  );
}
