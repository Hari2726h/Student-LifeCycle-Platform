import { SidebarContent, type NavItem } from "@/components/sidebar-content";
import { MobileNav } from "@/components/mobile-nav";

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
    <div className="min-h-screen bg-bg lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarContent role={role} name={name} nav={nav} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <MobileNav role={role} name={name} nav={nav} />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
