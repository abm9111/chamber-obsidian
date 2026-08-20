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
});
