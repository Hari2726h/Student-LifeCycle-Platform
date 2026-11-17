import { AppShell } from "@/components/app-shell";
import { getVolunteerNav } from "@/lib/volunteer-nav";

export function VolunteerShell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <AppShell role="VOLUNTEER" name={name} nav={getVolunteerNav()}>
      {children}
    </AppShell>
  );
}
