import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseReport } from "../../src/core/report";
import { buildFileIndex, resolveIndex } from "../../src/core/fileIndex";

const drift = (() => {
  const r = parseReport(readFileSync("tests/fixtures/report-drift.json", "utf8"));
  if (!r.ok) throw new Error(r.error);
  return r.report;
})();

describe("buildFileIndex", () => {
  it("indexes drifted and moved pins by ref path, and ONLY those (healthy pins carry no refs in the report)", () => {
    const idx = buildFileIndex(drift);
    const all = [...idx.values()];
    expect(all.some((e) => e.drifted.length > 0)).toBe(true);
    expect(all.some((e) => e.moved.length > 0)).toBe(true);
    for (const e of all) expect(e.drifted.length + e.moved.length).toBeGreaterThan(0);
  });
  it("uses sourceRef when present and falls back to refId for not_found pins without one", () => {
    const idx = buildFileIndex({ goneFiles: [], beliefs: [{ beliefId: "b1", content: "c", total: 1, verified: 0, relocations: [], failures: [{ refId: "vdoc_x", reason: "not_found", sourceRef: null, title: null }] }] });
    expect([...idx.keys()]).toEqual(["vdoc_x"]);
  });
});

describe("resolveIndex", () => {
  it("splits resolvable from unresolvable and keys by vault path", () => {
    const idx = buildFileIndex(drift);
    const refPaths = [...idx.keys()];
    const vault = refPaths.filter((p) => p.endsWith(".md")); // pretend ingest root == vault root
    const res = resolveIndex(idx, vault);
    expect(res.byVaultPath.size + res.unresolved.size).toBe(idx.size);
  });
});
