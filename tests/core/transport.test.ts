import { describe, expect, it } from "vitest";
import { conflictSiblings, eventTouchesReport, isRegression, looksTruncated } from "../../src/core/transport";

describe("looksTruncated", () => {
  it("flags JSON that opens but never closes", () => {
    expect(looksTruncated('{"beliefs": [{"beliefId": "x"')).toBe(true);
    expect(looksTruncated("[1, 2")).toBe(true);
  });
  it("accepts complete JSON, with or without padding", () => {
    expect(looksTruncated('{"beliefs": []}')).toBe(false);
    expect(looksTruncated('  {"beliefs": []}\n')).toBe(false);
  });
  it("does not claim non-JSON text is truncated", () => {
    expect(looksTruncated("plain text, not a report")).toBe(false);
    expect(looksTruncated("")).toBe(false);
  });
});

describe("conflictSiblings", () => {
  const report = "_chamber/report.json";
  it("matches Syncthing and conflicted-copy names, case-insensitively", () => {
    const files = [
      report,
      "_chamber/report.sync-conflict-20260828-101010-ABCDEF.json",
      "_chamber/Report (Conflicted Copy).json",
      "_chamber/other.json",
    ];
    expect(conflictSiblings(report, files)).toEqual([
      "_chamber/Report (Conflicted Copy).json",
      "_chamber/report.sync-conflict-20260828-101010-ABCDEF.json",
    ]);
  });
  it("matches vault-root siblings even when list() prefixes a slash", () => {
    expect(conflictSiblings("report.json", [
      "/report.json",
      "/report.sync-conflict-20260828-101010-ABCDEF.json",
      "report (conflicted copy).json",
      "notes/report.sync-conflict-1.json",
    ])).toEqual([
      "report (conflicted copy).json",
      "report.sync-conflict-20260828-101010-ABCDEF.json",
    ]);
  });
  it("ignores other folders, other stems, numbered copies, and the report itself", () => {
    const files = [
      report,
      "elsewhere/report.sync-conflict-1.json",
      "_chamber/other-conflict.json",
      "_chamber/report 2.json",
    ];
    expect(conflictSiblings(report, files)).toEqual([]);
  });
});

describe("eventTouchesReport", () => {
  const report = "_chamber/report.json";
  it("wakes on the report path, including slash/backslash spellings", () => {
    expect(eventTouchesReport(report, report)).toBe(true);
    expect(eventTouchesReport(report, "_chamber\\report.json/")).toBe(true);
    expect(eventTouchesReport(report, "notes/other.md")).toBe(false);
  });
  it("wakes on a conflict sibling create or delete, not on an unrelated neighbor", () => {
    expect(eventTouchesReport(report, "_chamber/report.sync-conflict-20260828-101010-ABCDEF.json")).toBe(true);
    expect(eventTouchesReport(report, "_chamber/other.json")).toBe(false);
    expect(eventTouchesReport(report, "elsewhere/report.sync-conflict-1.json")).toBe(false);
  });
});

describe("isRegression", () => {
  it("is true only for a genuinely older report, with jitter slack", () => {
    expect(isRegression(10_000, 5_000)).toBe(true);
    expect(isRegression(10_000, 9_500)).toBe(false); // within 1s slack
    expect(isRegression(10_000, 10_000)).toBe(false);
    expect(isRegression(10_000, 20_000)).toBe(false);
  });
});
