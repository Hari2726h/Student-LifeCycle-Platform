import {
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  History,
  Home,
  Phone,
  School,
  UserRound,
  Wallet,
  Gift,
} from "lucide-react";
import type { NavItem } from "@/components/sidebar-content";

export function getVolunteerNav(): NavItem[] {
  return [
    { label: "Overview", href: "/volunteer", icon: <Home /> },
    { label: "My activities", href: "/volunteer/activities", icon: <ClipboardList /> },
    { label: "Physical verification", href: "/volunteer/physical-verifications", icon: <ClipboardCheck /> },
    { label: "Call verification", href: "/volunteer/call-verifications", icon: <Phone /> },
    { label: "Tutoring", href: "/volunteer/tutoring", icon: <GraduationCap /> },
    { label: "School visits", href: "/volunteer/school-visits", icon: <School /> },
    { label: "Santa programme", href: "/volunteer/santa", icon: <Gift /> },
    { label: "Expenses", href: "/volunteer/expenses", icon: <Wallet /> },
    { label: "Activity history", href: "/volunteer/history", icon: <History /> },
    { label: "My profile", href: "/volunteer/profile", icon: <UserRound /> },
  ];
}
