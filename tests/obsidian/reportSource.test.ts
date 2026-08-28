import { describe, expect, it, vi } from "vitest";
import { ReportSource } from "../../src/obsidian/reportSource";

// Plain-object mocks, no obsidian import here: the "obsidian" package ships
// types only (no runtime JS), so a value import of it inside a vitest test
// would fail to load. reportSource.ts only needs `TAbstractFile`/`App` as
// types (see its `import type` there) — these mocks stand in structurally
// and are passed in with `as never`, never `as any`.
function makeSource(adapter: {
  exists: (path?: string) => Promise<boolean>;
  read: () => Promise<string>;
  stat: () => Promise<{ mtime: number; size?: number }>;
  list?: (dir: string) => Promise<{ files: string[] }>;
}, files: string[] = [], settings: { reportPath: string } = { reportPath: "_chamber/report.json" }): ReportSource {
  const list = adapter.list ?? (async (dir: string) => {
    const prefix = dir && dir !== "/" ? dir.replace(/\/+$/, "") + "/" : "";
    return {
      files: files.filter((p) => prefix === "" ? !p.includes("/") : p.startsWith(prefix) && !p.slice(prefix.length).includes("/")),
      folders: [],
    };
  });
  const mockApp = {
    vault: { adapter: { ...adapter, list }, getFiles: () => files.map((path) => ({ path })), on: () => ({}) },
  };
  const mockPlugin = {
    settings,
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

  it("unsubscribe stops callbacks", async () => {
    const source = makeSource({
      exists: async () => true,
      read: async () => JSON.stringify({ beliefs: [] }),
      stat: async () => ({ mtime: Date.now() }),
    });
    let count = 0;
    const unsubscribe = source.onChange(() => { count++; });

    await source.refresh();
    expect(count).toBe(1);

    unsubscribe();
    await source.refresh();
    expect(count).toBe(1);
  });

  it("rejects an oversized file from stat.size without reading it, and keeps last-good", async () => {
    let huge = false;
    let read = 0;
    const source = makeSource({
      exists: async () => true,
      read: async () => { read++; return JSON.stringify({ beliefs: [{ beliefId: "kept" }] }); },
      stat: async () => huge ? { mtime: Date.now(), size: 6 * 1024 * 1024 } : { mtime: Date.now() },
    });
    await source.refresh();
    expect(source.current()?.live).toBe(true);
    huge = true;
    await source.refresh();
    expect(read).toBe(1);
    expect(source.state.kind).toBe("error");
    if (source.state.kind === "error") {
      expect(source.state.reason).toBe("unreadable");
      expect(source.state.error).toMatch(/too large/);
    }
    expect(source.current()?.live).toBe(false);
    expect(source.current()?.report.beliefs[0]?.beliefId).toBe("kept");
  });

  it("an empty file is its own transport state, not a JSON error", async () => {
    const source = makeSource({
      exists: async () => true,
      read: async () => "",
      stat: async () => ({ mtime: Date.now() }),
    });
    await source.refresh();
    expect(source.state.kind).toBe("error");
    if (source.state.kind === "error") expect(source.state.reason).toBe("empty");
  });

  it("a torn JSON file is reported as truncated, not merely invalid", async () => {
    const source = makeSource({
      exists: async () => true,
      read: async () => '{"beliefs": [{"beliefId": "x"',
      stat: async () => ({ mtime: Date.now() }),
    });
    await source.refresh();
    expect(source.state.kind).toBe("error");
    if (source.state.kind === "error") expect(source.state.reason).toBe("truncated");
  });

  it("keeps the last good report when the file goes bad, and recovers", async () => {
    let calls = 0;
    const source = makeSource({
      exists: async () => true,
      read: async () => {
        calls++;
        if (calls === 2) return ""; // sync tear between two good reads
        return JSON.stringify({ beliefs: [] });
      },
      stat: async () => ({ mtime: Date.now() }),
    });
    await source.refresh();
    expect(source.state.kind).toBe("loaded");
    await source.refresh();
    expect(source.state.kind).toBe("error");
    if (source.state.kind === "error") {
      expect(source.state.lastGood).not.toBeNull();
      expect(source.state.lastGood?.report.beliefs).toEqual([]);
    }
    await source.refresh();
    expect(source.state.kind).toBe("loaded");
  });

  it("flags a backwards report and measures late arrival of a newer one", async () => {
    const gens = ["2026-08-28T00:00:10.000Z", "2026-08-28T00:00:05.000Z", "2026-08-28T00:00:20.000Z"];
    let calls = 0;
    const source = makeSource({
      exists: async () => true,
      read: async () => JSON.stringify({ beliefs: [], generatedAt: gens[calls++] }),
      stat: async () => ({ mtime: Date.now() }),
    });
    await source.refresh(); // first sight: asserts nothing
    expect(source.state.kind).toBe("loaded");
    if (source.state.kind === "loaded") {
      expect(source.state.regressed).toBe(false);
      expect(source.state.arrivalLagMs).toBeNull();
    }
    await source.refresh(); // older generatedAt replaced a newer one
    if (source.state.kind === "loaded") expect(source.state.regressed).toBe(true);
    await source.refresh(); // newer report lands while the app is open
    if (source.state.kind === "loaded") {
      expect(source.state.regressed).toBe(false);
      expect(source.state.arrivalLagMs).not.toBeNull();
      expect(source.state.arrivalLagMs ?? 0).toBeGreaterThan(0);
    }
  });

  it("keeps last-good when the report file goes missing after a load", async () => {
    let exists = true;
    const source = makeSource({
      exists: async () => exists,
      read: async () => JSON.stringify({ beliefs: [{ beliefId: "kept" }] }),
      stat: async () => ({ mtime: Date.now() }),
    });
    await source.refresh();
    expect(source.current()?.live).toBe(true);
    exists = false;
    await source.refresh();
    expect(source.state.kind).toBe("missing");
    expect(source.current()?.live).toBe(false);
    expect(source.current()?.report.beliefs[0]?.beliefId).toBe("kept");
  });

  it("wipes last-good when the report path changes to a different file", async () => {
    const settings = { reportPath: "_chamber/report.json" };
    const source = makeSource({
      exists: async (path) => path === "_chamber/report.json",
      read: async () => JSON.stringify({ beliefs: [{ beliefId: "kept" }] }),
      stat: async () => ({ mtime: Date.now() }),
    }, [], settings);
    await source.refresh();
    expect(source.current()?.live).toBe(true);
    settings.reportPath = "other/report.json";
    await source.refresh();
    expect(source.state.kind).toBe("missing");
    expect(source.current()).toBeNull();
  });

  it("keeps conflicts found before a read failure", async () => {
    const source = makeSource({
      exists: async () => true,
      read: async () => { throw new Error("read failed"); },
      stat: async () => ({ mtime: Date.now() }),
    }, [
      "_chamber/report.json",
      "_chamber/report.sync-conflict-20260828-101010-ABCDEF.json",
    ]);
    await source.refresh();
    expect(source.state.kind).toBe("error");
    if (source.state.kind === "error") {
      expect(source.state.conflicts).toEqual(["_chamber/report.sync-conflict-20260828-101010-ABCDEF.json"]);
    }
  });

  it("lists conflict siblings via adapter.list even when getFiles is empty", async () => {
    const sibling = ".chamber/report.sync-conflict-20260828-101010-ABCDEF.json";
    const source = makeSource({
      exists: async () => true,
      read: async () => JSON.stringify({ beliefs: [] }),
      stat: async () => ({ mtime: Date.now() }),
      list: async () => ({ files: [".chamber/report.json", sibling] }),
    }, [], { reportPath: ".chamber/report.json" });
    await source.refresh();
    expect(source.state.kind).toBe("loaded");
    if (source.state.kind === "loaded") expect(source.state.conflicts).toEqual([sibling]);
  });

  it("lists sync-conflict copies sitting next to the report", async () => {
    const source = makeSource({
      exists: async () => true,
      read: async () => JSON.stringify({ beliefs: [] }),
      stat: async () => ({ mtime: Date.now() }),
    }, [
      "_chamber/report.json",
      "_chamber/report.sync-conflict-20260828-101010-ABCDEF.json",
      "_chamber/other.json",
    ]);
    await source.refresh();
    expect(source.state.kind).toBe("loaded");
    if (source.state.kind === "loaded") {
      expect(source.state.conflicts).toEqual(["_chamber/report.sync-conflict-20260828-101010-ABCDEF.json"]);
    }
  });

  it("current() is null when no report has ever loaded", async () => {
    const source = makeSource({
      exists: async () => false,
      read: async () => "",
      stat: async () => ({ mtime: Date.now() }),
    });
    expect(source.current()).toBeNull();
    await source.refresh();
    expect(source.state.kind).toBe("missing");
    expect(source.current()).toBeNull();
  });

  it("current() falls back to last-good while the file is torn, then goes live again", async () => {
    let calls = 0;
    const source = makeSource({
      exists: async () => true,
      read: async () => {
        calls++;
        if (calls === 2) return "";
        return JSON.stringify({ beliefs: [{ beliefId: "kept" }] });
      },
      stat: async () => ({ mtime: Date.now() }),
    });
    await source.refresh();
    const live = source.current();
    expect(live?.live).toBe(true);
    expect(live?.report.beliefs[0]?.beliefId).toBe("kept");

    await source.refresh();
    expect(source.state.kind).toBe("error");
    const fallback = source.current();
    expect(fallback?.live).toBe(false);
    expect(fallback?.report.beliefs[0]?.beliefId).toBe("kept");

    await source.refresh();
    expect(source.current()?.live).toBe(true);
  });

  it("does not claim arrival lag when a previously-seen report reappears after a rollback", async () => {
    const gens = [
      "2026-08-28T00:00:10.000Z",
      "2026-08-28T00:00:05.000Z",
      "2026-08-28T00:00:10.000Z",
      "2026-08-28T00:00:20.000Z",
    ];
    let calls = 0;
    const source = makeSource({
      exists: async () => true,
      read: async () => JSON.stringify({ beliefs: [], generatedAt: gens[calls++] }),
      stat: async () => ({ mtime: Date.now() }),
    });
    await source.refresh(); // T10 first sight
    await source.refresh(); // T5 regression
    if (source.state.kind === "loaded") {
      expect(source.state.regressed).toBe(true);
      expect(source.state.arrivalLagMs).toBeNull();
    }
    await source.refresh(); // T10 reappears — not a late delivery
    expect(source.state.kind).toBe("loaded");
    if (source.state.kind === "loaded") {
      expect(source.state.regressed).toBe(false);
      expect(source.state.arrivalLagMs).toBeNull();
    }
    await source.refresh(); // T20 is genuinely new
    if (source.state.kind === "loaded") {
      expect(source.state.regressed).toBe(false);
      expect(source.state.arrivalLagMs).not.toBeNull();
      expect(source.state.arrivalLagMs ?? 0).toBeGreaterThan(0);
    }
  });

  it("normalizes the report path so exists, conflicts, and last-good agree", async () => {
    let seenExists: string | undefined;
    let empty = false;
    const settings = { reportPath: "_chamber\\report.json/" };
    const source = makeSource({
      exists: async (path) => { seenExists = path; return true; },
      read: async () => empty ? "" : JSON.stringify({ beliefs: [{ beliefId: "kept" }] }),
      stat: async () => ({ mtime: Date.now() }),
    }, [
      "_chamber/report.json",
      "_chamber/report.sync-conflict-20260828-101010-ABCDEF.json",
    ], settings);
    await source.refresh();
    expect(seenExists).toBe("_chamber/report.json");
    expect(source.state.kind).toBe("loaded");
    if (source.state.kind === "loaded") {
      expect(source.state.conflicts).toEqual(["_chamber/report.sync-conflict-20260828-101010-ABCDEF.json"]);
    }
    // Same file under a different spelling must not wipe last-good.
    settings.reportPath = "_chamber/report.json";
    empty = true;
    await source.refresh();
    expect(source.state.kind).toBe("error");
    expect(source.current()?.live).toBe(false);
    expect(source.current()?.report.beliefs[0]?.beliefId).toBe("kept");
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
