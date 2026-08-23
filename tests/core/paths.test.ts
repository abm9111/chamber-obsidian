import { describe, expect, it } from "vitest";
import { goneFileMatchesFilter, isEventBlindPath, vaultPathsEqual } from "../../src/core/paths";

describe("vaultPathsEqual", () => {
  it("treats backslash and trailing slash as the same path", () => {
    expect(vaultPathsEqual("_chamber/report.json", "_chamber/report.json")).toBe(true);
    expect(vaultPathsEqual("notes\\a.md", "notes/a.md")).toBe(true);
    expect(vaultPathsEqual("notes/a.md/", "notes/a.md")).toBe(true);
  });
});

describe("isEventBlindPath", () => {
  it("is true for a leading dot AND a mid-path dot-folder", () => {
    expect(isEventBlindPath(".chamber/report.json")).toBe(true);
    expect(isEventBlindPath("notes/.chamber/report.json")).toBe(true);
    expect(isEventBlindPath("_chamber/report.json")).toBe(false);
  });
});

describe("goneFileMatchesFilter", () => {
  it("passes everything when unfiltered and only the matching file when filtered", () => {
    expect(goneFileMatchesFilter("notes/gone.md", null)).toBe(true);
    expect(goneFileMatchesFilter("notes/gone.md", "notes/gone.md")).toBe(true);
    expect(goneFileMatchesFilter("/tmp/vault/notes/gone.md", "notes/gone.md")).toBe(true);
    expect(goneFileMatchesFilter("notes/gone.md", "policy.md")).toBe(false);
  });
});
