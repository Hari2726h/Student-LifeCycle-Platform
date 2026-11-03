import { NextResponse, NextRequest } from "next/server";
import { verifyCredential } from "@/lib/credentials";

/** Deliberately unauthenticated — the entire point of a verifiable
 * credential is that a third party (an employer, another institution)
 * can check it without logging into Maatram at all. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.credential) {
    return NextResponse.json({ valid: false, reason: "No credential provided" }, { status: 400 });
  }
  const result = verifyCredential(body.credential);
  return NextResponse.json(result);
}
