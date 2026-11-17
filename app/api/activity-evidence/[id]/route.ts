import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createPresignedDownloadUrl } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const evidence = await prisma.activityEvidence.findUnique({ where: { id }, include: { report: { select: { volunteerId: true } } } });
  if (!evidence) return new NextResponse("Not found", { status: 404 });
  if (session.user.role !== "STAFF" && evidence.report.volunteerId !== session.user.id) return new NextResponse("Forbidden", { status: 403 });
  const url = await createPresignedDownloadUrl(evidence.storageKey, evidence.fileName);
  return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "private, no-store" } });
}
