import { describe, it, expect } from "vitest";
import { buildCareerGraph } from "@/lib/career-graph";

describe("buildCareerGraph", () => {
  it("merges spelling/legal-suffix variants of the same company into one cluster", () => {
    // The exact bug a larger, more realistic dataset surfaced: grouping by
    // the raw currentCompany string instead of its normalized form split
    // one real employer into several one-person clusters.
    const { clusters } = buildCareerGraph([
      { id: "1", name: "A", role: "Engineer", company: "Zoho" },
      { id: "2", name: "B", role: "Engineer", company: "Zoho Corp" },
      { id: "3", name: "C", role: "Engineer", company: "ZOHO Corporation" },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].nodes).toHaveLength(3);
  });

  it("labels the merged cluster with whichever spelling its members use most often", () => {
    const { clusters } = buildCareerGraph([
      { id: "1", name: "A", role: "Engineer", company: "Zoho" },
      { id: "2", name: "B", role: "Engineer", company: "Zoho" },
      { id: "3", name: "C", role: "Engineer", company: "Zoho Corp" },
    ]);
    expect(clusters[0].company).toBe("Zoho");
  });

  it("still keeps genuinely different companies in separate clusters", () => {
    const { clusters } = buildCareerGraph([
      { id: "1", name: "A", role: "Engineer", company: "Zoho" },
      { id: "2", name: "B", role: "Engineer", company: "Infosys" },
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("groups everyone with no current company into one 'Between roles' cluster", () => {
    const { clusters } = buildCareerGraph([
      { id: "1", name: "A", role: "Engineer", company: null },
      { id: "2", name: "B", role: "Engineer", company: "" },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].company).toBe("Between roles");
    expect(clusters[0].nodes).toHaveLength(2);
  });
});
