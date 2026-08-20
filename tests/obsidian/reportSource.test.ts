import { describe, expect, it, vi } from "vitest";
import { ReportSource } from "../../src/obsidian/reportSource";

// Plain-object mocks, no obsidian import here: the "obsidian" package ships
// types only (no runtime JS), so a value import of it inside a vitest test
// would fail to load. reportSource.ts only needs `TAbstractFile`/`App` as
// types (see its `import type` there) — these mocks stand in structurally
// and are passed in with `as never`, never `as any`.
function makeSource(adapter: {
  exists: () => Promise<boolean>;
  read: () => Promise<string>;
  stat: () => Promise<{ mtime: number }>;
}): ReportSource {
  const mockApp = {
    vault: { adapter, getFiles: () => [], on: () => ({}) },
  };
  const mockPlugin = {
    settings: { reportPath: "_chamber/report.json" },
    registerEvent() {},
    registerInterval() {},
  };
  return new ReportSource(mockApp as never, mockPlugin as never);
}

describe("ReportSource", () => {
  it("a throwing listener does not wedge the source", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const source = makeSource({
      exists: async () => true,
      read: async () => JSON.stringify({ beliefs: [] }),
      stat: async () => ({ mtime: Date.now() }),
    });
    let count = 0;
    source.onChange(() => { throw new Error("render bug"); });
    source.onChange(() => { count++; });

    await source.refresh();
    await source.refresh();

    expect(source.state.kind).toBe("loaded");
    expect(count).toBe(2);
    errorSpy.mockRestore();
  });

  it("a failed refresh does not poison the next one", async () => {
    let calls = 0;
    const source = makeSource({
      exists: async () => true,
      read: async () => {
        calls++;
        if (calls === 1) throw new Error("read failed");
        return JSON.stringify({ beliefs: [] });
      },
      stat: async () => ({ mtime: Date.now() }),
    });

    await source.refresh();
    expect(source.state.kind).toBe("error");

    await source.refresh();
    expect(source.state.kind).toBe("loaded");
  });

  it("refreshes serialize in enqueue order", async () => {
    const firstJson = JSON.stringify({ beliefs: [{ beliefId: "first" }] });
    const secondJson = JSON.stringify({ beliefs: [{ beliefId: "second" }] });
    let calls = 0;
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const source = makeSource({
      exists: async () => true,
      read: async () => {
        calls++;
        if (calls === 1) { await firstGate; return firstJson; } // held open: proves call 2 can't run ahead of it
        return secondJson;
      },
      stat: async () => ({ mtime: Date.now() }),
    });

    const p1 = source.refresh();
    const p2 = source.refresh();
    releaseFirst();
    await p1;
    await p2;

    expect(source.state.kind).toBe("loaded");
    if (source.state.kind === "loaded") {
      expect(source.state.report.beliefs[0]?.beliefId).toBe("second");
    }
  });
});
