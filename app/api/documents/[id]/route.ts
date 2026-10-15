import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readUploadedFile } from "@/lib/uploads";

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

  const buffer = await readUploadedFile(doc.storageKey);
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
