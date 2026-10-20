import { ListChecks, CalendarPlus, Bell, History } from "lucide-react";
import type { NavItem } from "@/components/sidebar-content";
import { getUnreadNotificationCount } from "@/lib/notifications";

/** The /staff/* shell's nav differs per role — committee gets interview
 * slots, staff gets a live notifications badge — so every page that renders
 * AppShell for this role group builds it from here instead of repeating
 * the branch five times. */
export async function getStaffNav(role: string, userId: string): Promise<NavItem[]> {
  const nav: NavItem[] = [{ label: "Pipeline", href: "/staff", icon: <ListChecks /> }];

  if (role === "COMMITTEE") {
    nav.push({ label: "Interview slots", href: "/staff/interview-slots", icon: <CalendarPlus /> });
  }
  if (role === "STAFF") {
    const unread = await getUnreadNotificationCount(userId);
    nav.push({ label: "Notifications", href: "/staff/notifications", icon: <Bell />, badge: unread });
    nav.push({ label: "Events", href: "/staff/events", icon: <History /> });
  }

  return nav;
}
