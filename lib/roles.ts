import type { Role } from "@prisma/client";

/** Single source of truth for "where does this role land" — used by
 * middleware.ts to gate routes and by pages that need to send an
 * already-authenticated user somewhere sensible (e.g. the sidebar logo,
 * or /apply redirecting a promoted-to-STUDENT user away from the
 * applicant wizard instead of bouncing them to a login page they can't
 * use — see auth.ts's phone-otp provider, which has no role check of
 * its own). */
export const ROLE_HOME: Record<Role, string> = {
  APPLICANT: "/applicant",
  VOLUNTEER: "/volunteer",
  COMMITTEE: "/staff",
  MENTOR: "/mentor",
  STUDENT: "/portal",
  ALUMNI: "/portal",
  STAFF: "/staff",
};

/** Where "my profile" goes for roles that have a self-edit page. Absent
 * for roles that don't (Mentor, Staff, Committee, Applicant) — the
 * sidebar only renders the link when a role has an entry here. */
export const ROLE_PROFILE: Partial<Record<Role, string>> = {
  VOLUNTEER: "/volunteer/profile",
  STUDENT: "/portal/profile",
  ALUMNI: "/portal/profile",
};
