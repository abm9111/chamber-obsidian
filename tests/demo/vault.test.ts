import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseReport } from "../../src/core/report";
import { buildFileIndex, resolveIndex } from "../../src/core/fileIndex";
import { alarmedVaultPaths, beliefHits, locateNeedle, statusLabel } from "../../src/core/nav";

const report = (() => {
  const r = parseReport(readFileSync("demo/_chamber/report.json", "utf8"));
  if (!r.ok) throw new Error(r.error);
  return r.report;
})();

const vaultPaths = ["Welcome.md", "README.md", "Retention.md", "Onboarding.md"];

describe("demo vault report", () => {
  it("parses and resolves onto the two drifted notes testers are told to open", () => {
    const resolved = resolveIndex(buildFileIndex(report), vaultPaths);
    expect(alarmedVaultPaths(resolved)).toEqual(["Onboarding.md", "Retention.md"]);
    expect(beliefHits(report, resolved).map((h) => h.vaultPath)).toEqual(["Retention.md", "Onboarding.md"]);
    expect(report.goneFiles.map((g) => g.file)).toEqual(["Archive.md"]);
    expect(statusLabel({
      driftedBeliefs: report.beliefs.filter((b) => b.failures.length > 0).length,
      goneFiles: report.goneFiles.length,
      stale: false,
      conflicts: false,
    })).toBe("Drift 2");
  });

  it("can jump to the headings the canned titles name", () => {
    const retention = readFileSync("demo/Retention.md", "utf8");
    const onboarding = readFileSync("demo/Onboarding.md", "utf8");
    expect(locateNeedle(retention, "Retention › Window")).toBeGreaterThan(-1);
    expect(locateNeedle(onboarding, "Onboarding › Steps")).toBeGreaterThan(-1);
  });
});
