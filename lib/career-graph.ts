// Deterministic layout for the alumni career-network diagram — no client
// JS, no force-simulation dependency. Alumni cluster by current company;
// clusters sit on an outer ring, members sit on a small ring around their
// cluster's center. Same input always produces the same picture.
import { normalizeCompanyName } from "./company-normalize";

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
  // Group by the same normalized key lib/alumni-career.ts's
  // findAlumniAtCompany() matches on — otherwise "Zoho", "Zoho Corp" and
  // "ZOHO Corporation" silently render as three separate one-person
  // clusters instead of merging, contradicting the one feature this graph
  // exists to demonstrate. Each cluster keeps its own tally of the exact
  // strings its members used, so the node is still labeled with real
  // spelling (whichever variant is most common), not the lowercase
  // normalized key.
  const byKey = new Map<string, { members: AlumniNode[]; labelCounts: Map<string, number> }>();
  for (const a of alumni) {
    const raw = a.company?.trim();
    const key = raw ? normalizeCompanyName(raw) : "__between_roles__";
    const label = raw || "Between roles";
    if (!byKey.has(key)) byKey.set(key, { members: [], labelCounts: new Map() });
    const bucket = byKey.get(key)!;
    bucket.members.push(a);
    bucket.labelCounts.set(label, (bucket.labelCounts.get(label) ?? 0) + 1);
  }

  function modeLabel(labelCounts: Map<string, number>) {
    return [...labelCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }

  // Largest clusters first — reads better on a ring layout and gives a
  // stable, deterministic order independent of DB fetch order.
  const companies = [...byKey.entries()]
    .map(([, { members, labelCounts }]) => [modeLabel(labelCounts), members] as const)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

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
