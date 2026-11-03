// Deterministic layout for the alumni career-network diagram — no client
// JS, no force-simulation dependency. Alumni cluster by current company;
// clusters sit on an outer ring, members sit on a small ring around their
// cluster's center. Same input always produces the same picture.

const WIDTH = 820;
const HEIGHT = 560;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const CLUSTER_RING_RADIUS = 200;
const MEMBER_RING_RADIUS = 56;

// Fixed categorical order — never cycled per filter/sort, so a given
// company keeps its color across renders. Pulled from the app's existing
// brand tokens (not the reserved status colors success/warning/danger, so
// this never collides with a severity/status read elsewhere in the UI).
// Every node and cluster carries a direct text label, so identity never
// rests on color alone even though these muted tones read softer than a
// vivid categorical ramp would.
const CLUSTER_COLORS = ["var(--accent)", "var(--info)", "var(--gold)"];
const OVERFLOW_COLOR = "var(--ink-faint)";

export type AlumniNode = { id: string; name: string; role: string; company: string | null };

export type LaidOutNode = { id: string; name: string; role: string; x: number; y: number };
export type LaidOutCluster = { company: string; color: string; cx: number; cy: number; nodes: LaidOutNode[] };

export function buildCareerGraph(alumni: AlumniNode[]): { clusters: LaidOutCluster[]; width: number; height: number } {
  const byCompany = new Map<string, AlumniNode[]>();
  for (const a of alumni) {
    const key = a.company?.trim() || "Between roles";
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(a);
  }

  // Largest clusters first — reads better on a ring layout and gives a
  // stable, deterministic order independent of DB fetch order.
  const companies = [...byCompany.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  const clusters: LaidOutCluster[] = companies.map(([company, members], i) => {
    const angle = (2 * Math.PI * i) / companies.length - Math.PI / 2;
    const cx = CENTER.x + CLUSTER_RING_RADIUS * Math.cos(angle);
    const cy = CENTER.y + CLUSTER_RING_RADIUS * Math.sin(angle);
    const color = CLUSTER_COLORS[i] ?? OVERFLOW_COLOR;

    const nodes: LaidOutNode[] = members.map((m, j) => {
      if (members.length === 1) return { id: m.id, name: m.name, role: m.role, x: cx, y: cy };
      const memberAngle = (2 * Math.PI * j) / members.length;
      return {
        id: m.id,
        name: m.name,
        role: m.role,
        x: cx + MEMBER_RING_RADIUS * Math.cos(memberAngle),
        y: cy + MEMBER_RING_RADIUS * Math.sin(memberAngle),
      };
    });

    return { company, color, cx, cy, nodes };
  });

  return { clusters, width: WIDTH, height: HEIGHT };
}
