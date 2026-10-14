import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

const ROLE_HOME: Record<string, string> = {
  APPLICANT: "/applicant",
  VOLUNTEER: "/staff",
  COMMITTEE: "/staff",
  MENTOR: "/mentor",
  STUDENT: "/portal",
  ALUMNI: "/portal",
  STAFF: "/staff",
};

export default async function Home() {
  const session = await auth();
  if (session?.user?.role) {
    redirect(ROLE_HOME[session.user.role] ?? "/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
        Maatram Foundation
      </p>
      <h1 className="mt-2 max-w-xl text-3xl font-semibold text-neutral-900">
        Student Lifecycle Platform
      </h1>
      <p className="mt-3 max-w-md text-sm text-neutral-500">
        One record, from application to alumni — replacing spreadsheets with a
        single pipeline for applicants, volunteers, mentors, and staff.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/apply"
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Apply for sponsorship
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
