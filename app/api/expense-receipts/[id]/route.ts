import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createPresignedDownloadUrl } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const expense = await prisma.activityExpense.findUnique({ where: { id }, select: { volunteerId: true, status: true, receiptKey: true, receiptName: true } });
  if (!expense?.receiptKey || !expense.receiptName) return new NextResponse("Not found", { status: 404 });
  if (session.user.role !== "STAFF" && expense.volunteerId !== session.user.id) return new NextResponse("Forbidden", { status: 403 });
  const url = await createPresignedDownloadUrl(expense.receiptKey, expense.receiptName);
  return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "private, no-store" } });
}
