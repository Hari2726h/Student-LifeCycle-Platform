import {
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  History,
  Home,
  ListTodo,
  Phone,
  School,
  UserPlus,
  UserRound,
  Wallet,
  Gift,
} from "lucide-react";
import type { NavItem } from "@/components/sidebar-content";

export function getVolunteerNav(): NavItem[] {
  return [
    { label: "Overview", href: "/volunteer", icon: <Home /> },
    // /staff also serves VOLUNTEER (its own "Verification queue" section —
    // applicants assigned directly via Applicant.volunteerId, a separate,
    // older flow from the VolunteerActivity-based one below) and is the
    // only way to reach /apply/assist. Without this, both only exist by
    // typing the URL — the same shape of bug as the demo-accounts gap.
    { label: "My verification queue", href: "/staff", icon: <ListTodo /> },
    { label: "My activities", href: "/volunteer/activities", icon: <ClipboardList /> },
    { label: "Physical verification", href: "/volunteer/physical-verifications", icon: <ClipboardCheck /> },
    { label: "Call verification", href: "/volunteer/call-verifications", icon: <Phone /> },
    { label: "Tutoring", href: "/volunteer/tutoring", icon: <GraduationCap /> },
    { label: "School visits", href: "/volunteer/school-visits", icon: <School /> },
    { label: "Santa programme", href: "/volunteer/santa", icon: <Gift /> },
    { label: "Expenses", href: "/volunteer/expenses", icon: <Wallet /> },
    { label: "Activity history", href: "/volunteer/history", icon: <History /> },
    { label: "Assisted application", href: "/apply/assist", icon: <UserPlus /> },
    { label: "My profile", href: "/volunteer/profile", icon: <UserRound /> },
  ];
}
