import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseReport, MAX_REPORT_BYTES } from "../../src/core/report";

const fx = (n: string) => readFileSync(`tests/fixtures/${n}`, "utf8");

describe("parseReport", () => {
  it("parses the real drift fixture", () => {
    const r = parseReport(fx("report-drift.json"));
    if (!r.ok) throw new Error(r.error);
    expect(r.report.beliefs.length).toBeGreaterThan(0);
    expect(r.report.beliefs.some((b) => b.failures.some((f) => f.reason === "hash_mismatch"))).toBe(true);
    expect(r.report.beliefs.some((b) => b.relocations.length > 0)).toBe(true);
    expect(r.report.goneFiles.length).toBeGreaterThan(0);
    expect(typeof r.report.generatedAt).toBe("string");
  });
  it("parses the legacy fixture (no generatedAt) without complaint", () => {
    const r = parseReport(fx("report-legacy.json"));
    if (!r.ok) throw new Error(r.error);
    expect(r.report.generatedAt).toBeUndefined();
  });
  it("tolerates unknown fields and missing optional arrays", () => {
    const r = parseReport(JSON.stringify({ beliefs: [{ beliefId: "b", content: "c", total: 1, verified: 1 }], futureField: 42 }));
    if (!r.ok) throw new Error(r.error);
    expect(r.report.beliefs[0].failures).toEqual([]);
    expect(r.report.beliefs[0].relocations).toEqual([]);
    expect(r.report.goneFiles).toEqual([]);
  });
  it("rejects non-JSON, non-object, and missing beliefs", () => {
    for (const bad of ["not json{", "42", JSON.stringify({ nope: [] })]) {
      const r = parseReport(bad);
      expect(r.ok).toBe(false);
    }
  });
  it("rejects an oversized report instead of freezing the UI", () => {
    const r = parseReport("x".repeat(MAX_REPORT_BYTES + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too large/);
  });
  it("coerces wrong-typed leaves instead of throwing", () => {
    const r = parseReport(JSON.stringify({
      beliefs: [{ beliefId: 1, content: 2, total: "3", verified: null, failures: [{ refId: true, reason: 4 }], relocations: [{ from: 5 }] }],
      goneFiles: [{ file: 9, passages: "nope" }],
    }));
    if (!r.ok) throw new Error(r.error);
    expect(r.report.beliefs[0]).toEqual({
      beliefId: "", content: "", total: 0, verified: 0,
      failures: [{ refId: "", reason: "", sourceRef: null, title: null }],
      relocations: [{ refId: "", from: "", to: null, title: null }],
    });
    expect(r.report.goneFiles).toEqual([{ file: "", passages: 0 }]);
  });
  it("drops non-finite top-level counters", () => {
    const r = parseReport(JSON.stringify({ beliefs: [], checked: Infinity, broken: NaN, degraded: Infinity, relocatedPins: Number.POSITIVE_INFINITY }));
    if (!r.ok) throw new Error(r.error);
    expect(r.report.checked).toBeUndefined();
    expect(r.report.broken).toBeUndefined();
    expect(r.report.degraded).toBeUndefined();
    expect(r.report.relocatedPins).toBeUndefined();
  });
});
