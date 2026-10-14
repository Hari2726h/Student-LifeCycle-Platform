"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { SidebarContent, type NavItem } from "@/components/sidebar-content";

export function MobileNav({ role, name, nav }: { role: string; name: string; nav: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes — adjusted during render
  // (React's recommended pattern) rather than in an effect, since this is
  // derived from a prop change, not a subscription to an external system.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
      <div className="flex items-center gap-2">
        <BrandMark className="size-7" />
        <span className="font-display text-sm font-medium text-ink">Maatram</span>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        className="flex size-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-ink/40 animate-fade-up"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 w-72 max-w-[82vw] border-r border-border bg-surface shadow-lg"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation menu"
              className="absolute right-3 top-4 flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
            <SidebarContent role={role} name={name} nav={nav} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
