import Link from "next/link";
import { ArrowLeft, Share2, Users2 } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getStaffNav } from "@/lib/staff-nav";
import { buildCareerGraph } from "@/lib/career-graph";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default async function CareerGraphPage() {
  const session = await requireRole(["STAFF"]);
  const nav = await getStaffNav("STAFF", session.user.id);

  const alumni = await prisma.alumniProfile.findMany({
    include: { student: { include: { user: true } } },
  });

  const nodes = alumni.map((a) => ({
    id: a.id,
    name: a.student.user.name,
    role: a.currentRole ?? "Role unknown",
    company: a.currentCompany,
  }));

  const { clusters, width, height } = buildCareerGraph(nodes);
  const hasAnyAlumni = nodes.length > 0;

  return (
    <AppShell role="STAFF" name={session.user.name ?? "Staff"} nav={nav}>
      <PageHeader
        eyebrow="Alumni"
        title="Career network"
        description="Alumni clustered by current company — who's connected to who, at a glance."
        action={
          <Link href="/staff/alumni" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-strong">
            <ArrowLeft className="size-4" aria-hidden /> Back to directory
          </Link>
        }
      />

      <Card>
        <CardHeader eyebrow="Network" title={`${clusters.length} compan${clusters.length === 1 ? "y" : "ies"} represented`} action={<Share2 className="size-4 text-ink-faint" aria-hidden />} />
        <CardBody>
          {!hasAnyAlumni ? (
            <EmptyState icon={Users2} title="No alumni yet" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto w-full max-w-3xl" role="img" aria-label="Alumni career network, clustered by current company">
                  {/* Edges first, so nodes and labels draw on top */}
                  {clusters.map((cluster) =>
                    cluster.nodes.flatMap((a, i) =>
                      cluster.nodes.slice(i + 1).map((b) => (
                        <line
                          key={`${a.id}-${b.id}`}
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke={cluster.color}
                          strokeWidth={1.5}
                          strokeOpacity={0.35}
                        />
                      )),
                    ),
                  )}

                  {clusters.map((cluster) => (
                    <g key={cluster.company}>
                      <text
                        x={cluster.cx}
                        y={cluster.cy - 72}
                        textAnchor="middle"
                        className="fill-ink text-[13px] font-medium"
                      >
                        {cluster.company}
                      </text>
                      <text
                        x={cluster.cx}
                        y={cluster.cy - 58}
                        textAnchor="middle"
                        className="fill-ink-faint text-[11px]"
                      >
                        {cluster.nodes.length} alumn{cluster.nodes.length === 1 ? "us" : "i"}
                      </text>
                      {cluster.nodes.map((n) => (
                        <g key={n.id}>
                          <circle cx={n.x} cy={n.y} r={7} fill={cluster.color} stroke="var(--surface)" strokeWidth={2}>
                            <title>
                              {n.name} — {n.role} at {cluster.company}
                            </title>
                          </circle>
                          <text x={n.x} y={n.y + 18} textAnchor="middle" className="fill-ink-muted text-[10px]">
                            {n.name.split(" ")[0]}
                          </text>
                        </g>
                      ))}
                    </g>
                  ))}
                </svg>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-ink-muted">
                {clusters.map((cluster) => (
                  <span key={cluster.company} className="inline-flex items-center gap-1.5">
                    <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: cluster.color }} />
                    {cluster.company} ({cluster.nodes.length})
                  </span>
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-ink-faint">
                Hover a dot for name and role. Lines connect alumni who currently work at the same company.
              </p>
            </>
          )}
        </CardBody>
      </Card>
    </AppShell>
  );
}
