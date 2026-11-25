import { GraduationCap, UserRound } from "lucide-react";
import type { NavItem } from "@/components/sidebar-content";

export function getPortalNav(): NavItem[] {
  return [
    { label: "Overview", href: "/portal", icon: <GraduationCap /> },
    { label: "My profile", href: "/portal/profile", icon: <UserRound /> },
  ];
}
