import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/auth";
import { submitVerificationCore } from "@/lib/verification";

/** The same write path as the online verification form, exposed as a
 * plain POST endpoint instead of a server action — a service worker or an
 * IndexedDB-backed sync queue can retry a fetch() call once connectivity
 * returns; it can't "retry" an RSC server action the same way. Used by
 * the offline queue in app/staff/applicants/[id]/verification-form.tsx. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "VOLUNTEER") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const applicantId = String(formData.get("applicantId") ?? "");
  if (!applicantId) {
    return NextResponse.json({ ok: false, error: "Missing applicantId" }, { status: 400 });
  }

  const result = await submitVerificationCore(applicantId, session.user.id, formData);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
