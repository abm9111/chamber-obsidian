import { describe, expect, it } from "vitest";
import { parseReport } from "../../src/core/report";
import { buildFileIndex, resolveIndex } from "../../src/core/fileIndex";
import { alarmedVaultPaths, beliefHits, locateNeedle, neighborPath, statusLabel, wikilinkList } from "../../src/core/nav";
import { readFileSync } from "node:fs";

const drift = (() => {
  const r = parseReport(readFileSync("tests/fixtures/report-drift.json", "utf8"));
  if (!r.ok) throw new Error(r.error);
  return r.report;
})();

describe("alarmedVaultPaths / beliefHits", () => {
  it("lists resolved notes that have drift or moves, and one hit per drifted belief", () => {
    const resolved = resolveIndex(buildFileIndex(drift), ["policy.md"]);
    expect(alarmedVaultPaths(resolved)).toEqual(["policy.md"]);
    const hits = beliefHits(drift, resolved);
    expect(hits.length).toBe(drift.beliefs.filter((b) => b.failures.length > 0).length);
    expect(hits[0]?.vaultPath).toBe("policy.md");
  });
});

describe("neighborPath", () => {
  const paths = ["a.md", "b.md", "c.md"];
  it("wraps and starts at an end when the current note is not in the list", () => {
    expect(neighborPath(paths, "a.md", 1)).toBe("b.md");
    expect(neighborPath(paths, "c.md", 1)).toBe("a.md");
    expect(neighborPath(paths, "a.md", -1)).toBe("c.md");
    expect(neighborPath(paths, "other.md", 1)).toBe("a.md");
    expect(neighborPath([], "a.md", 1)).toBeNull();
  });
});

describe("statusLabel", () => {
  it("stays silent on a clean fresh report and speaks only for drift, conflicts, staleness, or gone files", () => {
    expect(statusLabel({ driftedBeliefs: 0, goneFiles: 0, stale: false, conflicts: false })).toBeNull();
    expect(statusLabel({ driftedBeliefs: 0, goneFiles: 0, stale: false, conflicts: true })).toBe("Drift conflict");
    expect(statusLabel({ driftedBeliefs: 3, goneFiles: 0, stale: false, conflicts: false })).toBe("Drift 3");
    expect(statusLabel({ driftedBeliefs: 0, goneFiles: 0, stale: true, conflicts: false })).toBe("Drift stale");
    expect(statusLabel({ driftedBeliefs: 0, goneFiles: 2, stale: false, conflicts: false })).toBe("Drift gone");
  });
  it("ranks a sync-conflict copy above staleness but below real drift", () => {
    expect(statusLabel({ driftedBeliefs: 2, goneFiles: 0, stale: true, conflicts: true })).toBe("Drift 2");
    expect(statusLabel({ driftedBeliefs: 0, goneFiles: 1, stale: true, conflicts: true })).toBe("Drift conflict");
  });
});

describe("wikilinkList / locateNeedle", () => {
  it("strips .md for wikilinks and prefers the last heading segment of a Chamber title", () => {
    expect(wikilinkList(["notes/a.md", "b.md"])).toBe("[[notes/a]]\n[[b]]");
    expect(locateNeedle("# Section 2\nbody", "policy › Policy › Section 2")).toBe(2);
    expect(locateNeedle("nope", "policy › Policy › Section 2")).toBe(-1);
    expect(locateNeedle("hello", null)).toBe(-1);
  });
});
