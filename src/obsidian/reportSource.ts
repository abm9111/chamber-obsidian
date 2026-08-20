import type { TAbstractFile, App } from "obsidian";
import { parseReport, type Report } from "../core/report";
import { reportAge, type AgeSource } from "../core/staleness";
import { buildFileIndex, resolveIndex, type ResolvedIndex } from "../core/fileIndex";
import type ChamberDriftPlugin from "../main";

export type SourceState =
  | { kind: "missing" }
  | { kind: "error"; error: string }
  | { kind: "loaded"; report: Report; ageMs: number | null; ageSource: AgeSource; resolved: ResolvedIndex };

/**
 * Locates, watches, parses. Subscribes to create/modify/rename — an atomic
 * rename-over surfaces as any of the three depending on the platform watcher —
 * AND runs a 5-minute safety poll regardless: a missed event is a silently
 * stale panel, which is this product's own failure mode pointed at itself.
 * Dot-paths get a 30s poll instead of events (Obsidian raises none for them).
 */
export class ReportSource {
  state: SourceState = { kind: "missing" };
  private listeners: Array<() => void> = [];
  private inflight: Promise<void> = Promise.resolve();

  constructor(private app: App, private plugin: ChamberDriftPlugin) {}

  onChange(cb: () => void): void { this.listeners.push(cb); }

  notify(): void {
    for (const cb of this.listeners) {
      try { cb(); } catch (e) {
        // A subscriber's render bug must cost that one render, not the source:
        // before this guard, a single throwing listener rejected the inflight
        // chain and permanently wedged every future refresh — the silently
        // stale panel this file exists to prevent, caused by its own plumbing.
        console.error("chamber-drift: onChange listener threw", e);
      }
    }
  }

  start(): void {
    const onFs = (f: TAbstractFile | string): void => {
      const path = typeof f === "string" ? f : f.path;
      if (path === this.plugin.settings.reportPath) void this.refresh();
    };
    this.plugin.registerEvent(this.app.vault.on("create", onFs));
    this.plugin.registerEvent(this.app.vault.on("modify", onFs));
    this.plugin.registerEvent(this.app.vault.on("rename", (f, old) => { onFs(f); onFs(old); }));
    this.plugin.registerInterval(window.setInterval(() => void this.refresh(), 5 * 60_000));
    this.plugin.registerInterval(window.setInterval(() => {
      if (this.plugin.settings.reportPath.startsWith(".")) void this.refresh();
    }, 30_000));
    void this.refresh();
  }

  /**
   * Serialized: concurrent triggers (a vault event landing on a poll tick)
   * queue behind each other instead of interleaving. Without this, the
   * earlier trigger's slower I/O could resolve last and overwrite fresher
   * state with staler — a visible regression, not just a wasted render.
   */
  refresh(): Promise<void> {
    const run = this.inflight.then(() => this.doRefresh());
    // The stored chain link swallows rejections so one failure can never
    // poison subsequent refreshes; the RETURNED promise does not, so an
    // awaiting caller still sees its own failure.
    this.inflight = run.catch(() => {});
    return run;
  }

  // Must never reject — the try/catch below turns every failure into an { kind: "error" } state, because a rejection here would poison the inflight chain and wedge every future refresh() behind it.
  private async doRefresh(): Promise<void> {
    const path = this.plugin.settings.reportPath;
    const adapter = this.app.vault.adapter;
    let next: SourceState;
    try {
      if (!(await adapter.exists(path))) next = { kind: "missing" };
      else {
        const raw = await adapter.read(path);
        const parsed = parseReport(raw);
        if (!parsed.ok) next = { kind: "error", error: parsed.error };
        else {
          const stat = await adapter.stat(path);
          const age = reportAge(parsed.report.generatedAt, stat?.mtime ?? null, Date.now());
          const vaultPaths = this.app.vault.getFiles().map((f) => f.path);
          const resolved = resolveIndex(buildFileIndex(parsed.report), vaultPaths);
          next = { kind: "loaded", report: parsed.report, ageMs: age.ms, ageSource: age.source, resolved };
        }
      }
    } catch (e) {
      next = { kind: "error", error: String(e) };
    }
    // Always notify: consumers re-render idempotently and cheaply. An earlier
    // version de-duplicated on raw content + state kind — and under-notified,
    // because two things consumers display change with NO raw delta: age
    // (a report crosses the staleness threshold by time alone, exactly when
    // the scheduled verify has silently stopped) and the resolved index
    // (a vault file appearing can resolve a previously-unresolved ref). A
    // skipped render was this plugin's own failure mode — a silently stale
    // panel — traded for saving a few DOM writes a minute.
    this.state = next;
    this.notify();
  }
}
