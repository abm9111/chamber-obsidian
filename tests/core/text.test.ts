import { describe, expect, it } from "vitest";
import { excerpt, exceedsByteCap, utf8ByteLength } from "../../src/core/text";

describe("utf8ByteLength", () => {
  it("counts ASCII as one byte per code unit", () => {
    expect(utf8ByteLength("abcd")).toBe(4);
  });
  it("counts non-ASCII by UTF-8 bytes, not UTF-16 units", () => {
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("你")).toBe(3);
    expect(utf8ByteLength("😀")).toBe(4);
  });
});

describe("exceedsByteCap", () => {
  it("rejects by code-unit length without scanning when already over", () => {
    expect(exceedsByteCap("abcde", 4)).toBe(true);
  });
  it("rejects a short string whose UTF-8 bytes exceed the cap", () => {
    expect(exceedsByteCap("ééé", 4)).toBe(true); // 6 bytes, 3 code units
    expect(exceedsByteCap("abcd", 4)).toBe(false);
  });
});

describe("excerpt", () => {
  it("returns the string unchanged when it fits", () => {
    expect(excerpt("hello", 80)).toBe("hello");
  });
  it("does not split a surrogate pair at the boundary", () => {
    const s = "a".repeat(78) + "😀" + "z";
    expect(excerpt(s, 80)).toBe("a".repeat(78) + "…");
  });
});
