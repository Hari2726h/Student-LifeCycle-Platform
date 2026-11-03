import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/auth";
import { issueAlumniCredential } from "@/lib/credentials";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const alumniProfileId = typeof body?.alumniProfileId === "string" ? body.alumniProfileId : "";
  if (!alumniProfileId) {
    return NextResponse.json({ ok: false, error: "Missing alumniProfileId" }, { status: 400 });
  }

  const credential = await issueAlumniCredential(alumniProfileId);
  return NextResponse.json(credential);
}
