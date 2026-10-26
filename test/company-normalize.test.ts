import { describe, it, expect } from "vitest";
import { normalizeCompanyName } from "@/lib/company-normalize";

describe("normalizeCompanyName", () => {
  it("merges legal-suffix variants of the same company", () => {
    const variants = ["Zoho", "Zoho Corporation", "Zoho Corporation Pvt Ltd", "zoho pvt. ltd.", "ZOHO LIMITED"];
    const normalized = variants.map(normalizeCompanyName);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe("zoho");
  });

  it("strips suffixes that only reduce after a prior suffix is removed", () => {
    // "Technologies" only becomes a trailing suffix once "Private Limited" is stripped.
    expect(normalizeCompanyName("Acme Technologies Private Limited")).toBe("acme");
  });

  it("applies the alias table for initialisms that don't share a suffix pattern", () => {
    expect(normalizeCompanyName("TCS")).toBe("tata consultancy services");
    expect(normalizeCompanyName("tcs")).toBe("tata consultancy services");
    expect(normalizeCompanyName("HCL")).toBe("hcltech");
  });

  it("is idempotent — normalizing an already-normalized name is a no-op", () => {
    const once = normalizeCompanyName("Infosys Limited");
    expect(normalizeCompanyName(once)).toBe(once);
  });

  it("does not over-merge companies that merely share a word", () => {
    // Suffix-stripping must anchor to the end of the string, not match
    // anywhere — otherwise unrelated companies sharing a word would collide.
    expect(normalizeCompanyName("Tech Mahindra")).not.toBe(normalizeCompanyName("Mahindra Group"));
  });

  it("folds whitespace and punctuation before comparing", () => {
    expect(normalizeCompanyName("  Wipro   Ltd.  ")).toBe("wipro");
    expect(normalizeCompanyName("Wipro, Ltd")).toBe("wipro");
  });
});
