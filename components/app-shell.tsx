import { SignOutButton } from "@/components/sign-out-button";

type NavItem = { label: string; href: string };

const ROLE_LABEL: Record<string, string> = {
  APPLICANT: "Applicant",
  VOLUNTEER: "Field Volunteer",
  COMMITTEE: "Selection Committee",
  MENTOR: "Mentor",
  STUDENT: "Student",
  ALUMNI: "Alumni",
  STAFF: "Program Staff",
};

export function AppShell({
  role,
  name,
  nav,
  children,
}: {
  role: string;
  name: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Maatram Foundation
            </p>
            <h1 className="text-lg font-semibold">Student Lifecycle Platform</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{name}</p>
              <p className="text-xs text-neutral-500">{ROLE_LABEL[role] ?? role}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
        {nav.length > 0 && (
          <nav className="w-48 shrink-0">
            <ul className="space-y-1">
              {nav.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="block rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
