import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createPresignedDownloadUrl } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    include: { applicant: true },
  });
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const role = session.user.role;
  const isOwner = doc.applicant?.userId === session.user.id;
  const isAssignedVolunteer = role === "VOLUNTEER" && doc.applicant?.volunteerId === session.user.id;
  const allowed = role === "STAFF" || role === "COMMITTEE" || isAssignedVolunteer || isOwner;
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  // Access control stays here; the actual bytes are served directly by
  // object storage via a short-lived signed URL, not proxied through us.
  const url = await createPresignedDownloadUrl(doc.storageKey, doc.fileName);
  return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "private, no-store" } });
}
