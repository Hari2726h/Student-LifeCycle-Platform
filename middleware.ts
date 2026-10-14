import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Role } from "@prisma/client";

const ROLE_HOME: Record<Role, string> = {
  APPLICANT: "/applicant",
  VOLUNTEER: "/staff",
  COMMITTEE: "/staff",
  MENTOR: "/mentor",
  STUDENT: "/portal",
  ALUMNI: "/portal",
  STAFF: "/staff",
};

const PROTECTED: { prefix: string; roles: Role[] }[] = [
  { prefix: "/applicant", roles: ["APPLICANT"] },
  { prefix: "/portal", roles: ["STUDENT", "ALUMNI"] },
  { prefix: "/mentor", roles: ["MENTOR"] },
  { prefix: "/staff", roles: ["STAFF", "COMMITTEE", "VOLUNTEER"] },
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const rule = PROTECTED.find((r) => pathname.startsWith(r.prefix));
  if (!rule) return NextResponse.next();

  const role = req.auth?.user?.role;

  if (!role) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!rule.roles.includes(role)) {
    return NextResponse.redirect(new URL(ROLE_HOME[role], req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/applicant/:path*", "/portal/:path*", "/mentor/:path*", "/staff/:path*"],
};
