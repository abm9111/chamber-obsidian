import { describe, expect, it } from "vitest";
import { reportAge } from "../../src/core/staleness";

const NOW = Date.parse("2026-08-20T12:00:00Z");
describe("reportAge", () => {
  it("prefers generatedAt over mtime", () => {
    const a = reportAge("2026-08-20T10:00:00Z", NOW - 60_000, NOW);
    expect(a).toEqual({ ms: 2 * 3600_000, source: "generatedAt" });
  });
  it("falls back to mtime when generatedAt is absent or unparseable", () => {
    expect(reportAge(undefined, NOW - 60_000, NOW)).toEqual({ ms: 60_000, source: "mtime" });
    expect(reportAge("not a date", NOW - 60_000, NOW)).toEqual({ ms: 60_000, source: "mtime" });
  });
  it("admits ignorance when neither exists", () => {
    expect(reportAge(undefined, null, NOW)).toEqual({ ms: null, source: "unknown" });
  });
  it("clamps a future generatedAt to zero rather than reporting negative age", () => {
    expect(reportAge(new Date(NOW + 60_000).toISOString(), null, NOW)).toEqual({ ms: 0, source: "generatedAt" });
  });
});
