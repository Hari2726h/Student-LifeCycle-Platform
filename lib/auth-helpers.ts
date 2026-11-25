import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { ROLE_HOME } from "@/lib/roles";

export async function requireRole(roles: Role[]) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Every page currently using this is also covered by middleware.ts's
  // PROTECTED list, which already bounces a role mismatch to ROLE_HOME
  // before the page body runs — this branch is normally dead. It exists
  // as defense-in-depth: without it, a future page added here but missed
  // in middleware would otherwise send a mismatched role to /login, where
  // phone-OTP-only roles (APPLICANT, and anyone promoted from it) have no
  // password and get stuck — see app/apply/page.tsx's identical fix.
  if (!roles.includes(session.user.role)) redirect(ROLE_HOME[session.user.role]);
  return session;
}
