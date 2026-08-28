import type { TAbstractFile, App } from "obsidian";
import { MAX_REPORT_BYTES, parseReport, type Report } from "../core/report";
import { reportAge, type AgeSource } from "../core/staleness";
import { buildFileIndex, resolveIndex, type ResolvedIndex } from "../core/fileIndex";
import { isEventBlindPath, listDir, listedVaultPath, normalizeVaultPath } from "../core/paths";
import { conflictSiblings, eventTouchesReport, isRegression, looksTruncated } from "../core/transport";
import type ChamberDriftPlugin from "../main";

/**
 * "empty" and "truncated" are transport states, not parse states: an iCloud
 * placeholder that was never downloaded reads as zero bytes, and a sync
 * engine caught mid-write leaves JSON that opens but never closes. Both used
 * to collapse into one "not valid JSON" message that blamed the report.
 */
export type ErrorReason = "empty" | "truncated" | "unreadable";

/** The last report that parsed cleanly on this device — kept so a torn sync write can't blank the panel. */
export interface LastGood { report: Report; resolved: ResolvedIndex; mtime: number | null }

/** Live loaded report, or last-good while the file on disk is lying. `live` is false for the fallback. */
export interface CurrentReport extends LastGood { live: boolean }

export type SourceState =
  | { kind: "missing"; conflicts: string[]; lastGood: LastGood | null }
  | { kind: "error"; error: string; reason: ErrorReason; conflicts: string[]; lastGood: LastGood | null }
  | {
      kind: "loaded"; report: Report; ageMs: number | null; ageSource: AgeSource; resolved: ResolvedIndex;
      conflicts: string[]; arrivalLagMs: number | null; regressed: boolean;
    };

/**
 * Locates, watches, parses. Subscribes to create/modify/rename/delete — an
 * atomic rename-over surfaces as any of the first three depending on the
 * platform watcher; delete is its own event (the report vanishing, or a
 * conflict copy appearing/disappearing next to it). AND a 5-minute safety
 * poll regardless: a missed event is a silently stale panel, which is this
 * product's own failure mode pointed at itself. Dot-paths get a 30s poll
 * instead of events (Obsidian raises none for them, including a dot-folder
 * in the middle of the path).
 */
export class ReportSource {
  state: SourceState = { kind: "missing", conflicts: [], lastGood: null };
  private listeners: Array<() => void> = [];
  private inflight: Promise<void> = Promise.resolve();

  private lastGood: LastGood | null = null;
  private lastGoodPath: string | null = null;

  /**
   * Session memory for the two things a single stat cannot tell you: did this
   * report arrive long after it was generated (sync lag — verify itself ran),
   * and did generatedAt go BACKWARDS (two verify writers racing, or a sync
   * conflict resolving to the stale side). The first sight after startup
   * asserts neither: an old report on open is just an old report.
   *
   * `maxGenMs` is the highest generatedAt seen this session. Arrival lag is
   * only claimed when a generatedAt is strictly newer than that — a conflict
   * copy rolling back to a timestamp we already accepted is a reappearance,
   * not a late delivery.
   */
  private prevGenMs: number | null = null;
  private maxGenMs: number | null = null;
  private arrivalLagMs: number | null = null;
  private regressed = false;

  constructor(private app: App, private plugin: ChamberDriftPlugin) {}

  /**
   * Returns an unsubscribe. Views register on open and MUST unregister on
   * close: a panel is constructed anew each time its leaf reopens, and an
   * earlier version registered in the constructor with no way to leave —
   * every close/reopen leaked a listener rendering into a detached DOM tree
   * for the rest of the session.
   */
  onChange(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      const i = this.listeners.indexOf(cb);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

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

  /**
   * The report every surface should read. Live loaded state when the file is
   * good; last-good (live: false) while the file is missing or torn; null
   * only when this device has never loaded a report at this path.
   */
  current(): CurrentReport | null {
    const s = this.state;
    if (s.kind === "loaded") {
      return { report: s.report, resolved: s.resolved, mtime: this.lastGood?.mtime ?? null, live: true };
    }
    const lg = s.lastGood;
    return lg ? { report: lg.report, resolved: lg.resolved, mtime: lg.mtime, live: false } : null;
  }

  start(): void {
    const onFs = (f: TAbstractFile | string): void => {
      const path = typeof f === "string" ? f : f.path;
      if (eventTouchesReport(this.plugin.settings.reportPath, path)) void this.refresh();
    };
    this.plugin.registerEvent(this.app.vault.on("create", onFs));
    this.plugin.registerEvent(this.app.vault.on("modify", onFs));
    this.plugin.registerEvent(this.app.vault.on("delete", onFs));
    this.plugin.registerEvent(this.app.vault.on("rename", (f, old) => { onFs(f); onFs(old); }));
    this.plugin.registerInterval(window.setInterval(() => void this.refresh(), 5 * 60_000));
    this.plugin.registerInterval(window.setInterval(() => {
      if (isEventBlindPath(this.plugin.settings.reportPath)) void this.refresh();
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
    const path = normalizeVaultPath(this.plugin.settings.reportPath);
    const adapter = this.app.vault.adapter;
    // Last-good and the session memory describe ONE file. A changed report
    // path is a different file — carrying the old file's verdicts over would
    // show a "last good report" that never lived at the new path. Compared
    // after normalize so `_chamber/report.json/` and `_chamber\report.json`
    // are the same file as the event handler already treats them.
    if (this.lastGoodPath !== path) {
      this.lastGood = null;
      this.prevGenMs = null;
      this.maxGenMs = null;
      this.arrivalLagMs = null;
      this.regressed = false;
      this.lastGoodPath = path;
    }
    let next: SourceState;
    // Sibling listing is separate from the report read: a list failure must
    // not become "report unreadable", and a read failure must not wipe
    // conflicts we already found (status bar and panel both read them).
    let conflicts: string[] = [];
    try {
      conflicts = conflictSiblings(path, await this.listSiblingPaths(adapter, path));
    } catch { /* listing is best-effort */ }
    try {
      const vaultPaths = this.app.vault.getFiles().map((f) => f.path);
      if (!(await adapter.exists(path))) {
        next = { kind: "missing", conflicts, lastGood: this.lastGood };
      } else {
        // Stat first: parseReport's byte cap only runs after the file is already
        // a string in this process. A 200 MB iCloud placeholder would inflate
        // the renderer and then be rejected. size is bytes on disk; skip the
        // pre-check when the adapter omits it and let parseReport still gate.
        const stat = await adapter.stat(path);
        if (stat?.size != null && stat.size > MAX_REPORT_BYTES) {
          next = {
            kind: "error", reason: "unreadable",
            error: `report too large (${(stat.size / 1024 / 1024).toFixed(1)} MB > 5 MB)`,
            conflicts, lastGood: this.lastGood,
          };
        } else {
          const raw = await adapter.read(path);
          if (raw.trim().length === 0) {
            next = { kind: "error", reason: "empty", error: "the report file has no content on this device", conflicts, lastGood: this.lastGood };
          } else {
            const parsed = parseReport(raw);
            if (!parsed.ok) {
              next = { kind: "error", reason: looksTruncated(raw) ? "truncated" : "unreadable", error: parsed.error, conflicts, lastGood: this.lastGood };
            } else {
              const mtime = stat?.mtime ?? null;
              const age = reportAge(parsed.report.generatedAt, mtime, Date.now());
              const resolved = resolveIndex(buildFileIndex(parsed.report), vaultPaths);
              this.trackDeviceTruth(parsed.report.generatedAt);
              this.lastGood = { report: parsed.report, resolved, mtime };
              next = {
                kind: "loaded", report: parsed.report, ageMs: age.ms, ageSource: age.source, resolved,
                conflicts, arrivalLagMs: this.arrivalLagMs, regressed: this.regressed,
              };
            }
          }
        }
      }
    } catch (e) {
      next = { kind: "error", reason: "unreadable", error: String(e), conflicts, lastGood: this.lastGood };
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

  /**
   * Conflict copies next to the report. `getFiles()` is blind to any
   * dot-prefixed segment, so `.chamber/report.sync-conflict-…` would never
   * appear there — `adapter.list` on the parent folder still sees it.
   * `getFiles()` stays the source for resolveIndex (vault notes).
   */
  private async listSiblingPaths(adapter: { list?: (dir: string) => Promise<{ files?: string[] }> }, reportPath: string): Promise<string[]> {
    if (typeof adapter.list !== "function") return [];
    try {
      const listed = await adapter.list(listDir(reportPath));
      return (listed.files ?? []).map(listedVaultPath);
    } catch {
      return [];
    }
  }

  private trackDeviceTruth(generatedAt: string | undefined): void {
    const t = generatedAt !== undefined ? Date.parse(generatedAt) : NaN;
    const gen = Number.isFinite(t) ? t : null;
    if (gen === null) {
      // Legacy report without generatedAt: no ordering is knowable.
      this.arrivalLagMs = null;
      this.regressed = false;
      return;
    }
    if (this.prevGenMs === null) {
      this.prevGenMs = gen;
      this.maxGenMs = gen;
      return;
    }
    if (gen === this.prevGenMs) return; // same report re-read by a poll — carry the standing verdicts
    if (isRegression(this.prevGenMs, gen)) {
      this.regressed = true;
      this.arrivalLagMs = null;
    } else {
      this.regressed = false;
      // Lag only for a generatedAt this session has never seen. A conflict
      // rolling T10 → T5 → T10 is a reappearance, not "became visible late".
      if (this.maxGenMs === null || gen > this.maxGenMs) {
        this.arrivalLagMs = Math.max(0, Date.now() - gen);
        this.maxGenMs = gen;
      }
    }
    this.prevGenMs = gen;
  }
}
