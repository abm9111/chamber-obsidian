import { describe, expect, it } from "vitest";
import { refToPath, resolveRef, resolvePath } from "../../src/core/refs";

describe("refToPath", () => {
  it("strips the passage suffix and only the suffix", () => {
    expect(refToPath("notes/a.md#p4")).toBe("notes/a.md");
    expect(refToPath("a.md#p0.md#p12")).toBe("a.md#p0.md"); // '#' is legal in filenames
    expect(refToPath("src/x.ts:10-20")).toBe("src/x.ts:10-20"); // bare code ref untouched
  });
});

describe("resolveRef", () => {
  const vault = ["notes/a.md", "07 - Research/notes/a.md", "b.md"];
  it("prefers the exact path", () => {
    expect(resolveRef("notes/a.md#p1", vault)).toEqual({ kind: "exact", path: "notes/a.md" });
  });
  it("resolves a unique suffix (subfolder-ingest case)", () => {
    expect(resolveRef("a.md#p1", ["07 - Research/sub/a.md", "b.md"])).toEqual({ kind: "suffix", path: "07 - Research/sub/a.md" });
  });
  it("refuses ambiguity — a uniqueness proof, not a guess", () => {
    expect(resolveRef("a.md#p1", vault)).toEqual({ kind: "unresolved" });
  });
  it("suffix matches whole path segments only", () => {
    expect(resolveRef("a.md#p1", ["notes/za.md"])).toEqual({ kind: "unresolved" });
  });
});

describe("resolvePath", () => {
  it("does not re-strip an already-stripped key (extensionless #pN filename)", () => {
    expect(resolvePath("weird/report#p3", ["weird/report#p3"])).toEqual({ kind: "exact", path: "weird/report#p3" });
  });
});
