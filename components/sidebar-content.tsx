import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { NavLink } from "@/components/nav-link";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";

export type NavItem = { label: string; href: string; icon: ReactNode };

const ROLE_LABEL: Record<string, string> = {
  APPLICANT: "Applicant",
  VOLUNTEER: "Field Volunteer",
  COMMITTEE: "Selection Committee",
  MENTOR: "Mentor",
  STUDENT: "Student",
  ALUMNI: "Alumni",
  STAFF: "Program Staff",
};

export function SidebarContent({
  role,
  name,
  nav,
  onNavigate,
}: {
  role: string;
  name: string;
  nav: NavItem[];
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-6">
        <BrandMark className="size-8" />
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] font-medium leading-tight text-ink">Maatram</p>
          <p className="truncate text-[11px] leading-tight text-ink-faint">Student Lifecycle</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
          Workspace
        </p>
        {nav.map((item) => (
          <NavLink key={item.href} {...item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="px-2 pb-2">
        <Link
          href="https://www.maatramfoundation.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          <ArrowUpRight className="size-4 shrink-0" aria-hidden />
          Foundation site
        </Link>
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 rounded-md px-1 py-1.5">
          <Avatar name={name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            <p className="truncate text-xs text-ink-faint">{ROLE_LABEL[role] ?? role}</p>
          </div>
          <ThemeToggle />
        </div>
        <div className="mt-1">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
