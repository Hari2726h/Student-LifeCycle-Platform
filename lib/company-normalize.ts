/** Company-name merging rules — deterministic, not fuzzy-matched, so the
 * same input always normalizes the same way. Order: strip punctuation,
 * fold whitespace/case, strip legal suffixes (repeatedly — "Zoho
 * Corporation Pvt Ltd" needs two passes), then apply the known-alias
 * table for names that don't share a suffix pattern at all. */

const LEGAL_SUFFIXES = [
  "private limited",
  "pvt ltd",
  "pvt limited",
  "private ltd",
  "limited",
  "ltd",
  "corporation",
  "corp",
  "incorporated",
  "inc",
  "llp",
  "llc",
  "technologies",
  "technology",
  "solutions",
  "& co",
  "and co",
  "co",
];

// Known variants that don't reduce to the same string via suffix-stripping
// alone — e.g. an initialism vs. the full name.
const ALIASES: Record<string, string> = {
  tcs: "tata consultancy services",
  hcl: "hcltech",
  infy: "infosys",
};

function stripLegalSuffixes(name: string): string {
  let s = name;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_SUFFIXES) {
      const re = new RegExp(`\\s+${suffix}$`, "i");
      if (re.test(s)) {
        s = s.replace(re, "").trim();
        changed = true;
      }
    }
  }
  return s;
}

export function normalizeCompanyName(raw: string): string {
  let s = raw
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");

  s = stripLegalSuffixes(s).trim();
  s = s.replace(/\s+/g, " ");

  return ALIASES[s] ?? s;
}
