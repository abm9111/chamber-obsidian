import { TAbstractFile, type App } from "obsidian";
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
  private lastRaw: string | null = null;

  constructor(private app: App, private plugin: ChamberDriftPlugin) {}

  onChange(cb: () => void): void { this.listeners.push(cb); }
  notify(): void { for (const cb of this.listeners) cb(); }

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

  async refresh(): Promise<void> {
    const path = this.plugin.settings.reportPath;
    const adapter = this.app.vault.adapter;
    let next: SourceState;
    let raw: string | null = null;
    try {
      if (!(await adapter.exists(path))) next = { kind: "missing" };
      else {
        raw = await adapter.read(path);
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
    const changed = raw !== this.lastRaw || next.kind !== this.state.kind;
    this.lastRaw = raw;
    this.state = next;
    if (changed) this.notify();
  }
}
