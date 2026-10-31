import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCycleStats } from "@/lib/cycles";

function csvCell(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const stats = await getCycleStats();
  const header = ["Year", "Opens", "Closes", "Applied", "Shortlisted", "Accepted", "Rejected", "Placement rate %"];
  const rows = stats.map(({ cycle, total, counts, accepted, placementRate }) => [
    cycle.year,
    cycle.opensAt.toISOString().slice(0, 10),
    cycle.closesAt.toISOString().slice(0, 10),
    total,
    counts.SHORTLISTED ?? 0,
    accepted,
    counts.REJECTED ?? 0,
    placementRate ?? "",
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="maatram-cycles-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
