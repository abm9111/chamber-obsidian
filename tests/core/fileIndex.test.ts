import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseReport } from "../../src/core/report";
import { buildFileIndex, resolveIndex, vaultPathForRef } from "../../src/core/fileIndex";

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
  it("merges two ref keys that resolve to one vault file (suffix collision)", () => {
    const idx = buildFileIndex({ goneFiles: [], beliefs: [
      { beliefId: "b1", content: "one", total: 1, verified: 0, relocations: [], failures: [{ refId: "r1", reason: "hash_mismatch", sourceRef: "a.md#p0", title: null }] },
      { beliefId: "b2", content: "two", total: 1, verified: 0, relocations: [], failures: [{ refId: "r2", reason: "hash_mismatch", sourceRef: "sub/a.md#p1", title: null }] },
    ] });
    const res = resolveIndex(idx, ["notes/sub/a.md"]);
    expect(res.byVaultPath.size).toBe(1);
    const merged = res.byVaultPath.get("notes/sub/a.md");
    expect(merged?.drifted.length).toBe(2);
  });
  it("keeps an extensionless #pN filename intact (strip once, then resolvePath)", () => {
    const idx = buildFileIndex({ goneFiles: [], beliefs: [{
      beliefId: "b", content: "c", total: 1, verified: 0, relocations: [],
      failures: [{ refId: "r", reason: "hash_mismatch", sourceRef: "weird/report#p3#p1", title: null }],
    }] });
    const res = resolveIndex(idx, ["weird/report#p3"]);
    expect(res.byVaultPath.has("weird/report#p3")).toBe(true);
    expect(res.unresolved.size).toBe(0);
  });
  it("maps an unstripped ref onto its vault path by exact identity, not prefix", () => {
    const idx = buildFileIndex({ goneFiles: [], beliefs: [{
      beliefId: "b", content: "c", total: 1, verified: 0, relocations: [],
      failures: [{ refId: "r", reason: "hash_mismatch", sourceRef: "notes/a.md#p1", title: null }],
    }] });
    const res = resolveIndex(idx, ["notes/a.md"]);
    expect(vaultPathForRef("notes/a.md#p1", res)).toBe("notes/a.md");
    expect(vaultPathForRef("", res)).toBeNull();
    expect(vaultPathForRef("notes/a.md", res)).toBeNull();
  });
});
