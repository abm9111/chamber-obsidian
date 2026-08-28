import { ItemView, Platform, WorkspaceLeaf } from "obsidian";
import type ChamberDriftPlugin from "../main";
import { vaultPathForRef, type ResolvedIndex } from "../core/fileIndex";
import { goneFileMatchesFilter } from "../core/paths";
import { excerpt } from "../core/text";
import { reportAge, type AgeSource } from "../core/staleness";
import { ARRIVAL_LAG_MIN_MS } from "../core/transport";
import type { Report } from "../core/report";
import type { LastGood } from "./reportSource";
import { openVaultPin } from "./openPin";

export const VIEW_TYPE_DRIFT = "chamber-drift-panel";

// The `[ -s … ]` guard moves only a non-empty temp file: the redirect creates
// the file even when the command never runs (wrong PATH under launchd), and an
// unguarded mv then replaces the last known-good report with an empty one.
// `&&` after verify would be the WRONG guard — verify exits 1 when drift
// exists, so gating the move on exit status suppresses exactly the reports
// that matter. Review caught both wrong forms shipping side by side.
const CRON_LINE =
  'chamber verify --json > "<vault>/_chamber/.report.tmp" ; [ -s "<vault>/_chamber/.report.tmp" ] && mv "<vault>/_chamber/.report.tmp" "<vault>/_chamber/report.json"';

function durText(ms: number): string {
  const h = ms / 3600_000;
  return h < 1 ? `${Math.max(1, Math.round(ms / 60_000))} min`
    : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`;
}

function ageText(ms: number | null, source: string): string {
  if (ms === null) return "age unknown";
  const t = `${durText(ms)} ago`;
  return source === "mtime" ? `${t} (approx — from file time)` : t;
}

/** Device-truth verdicts rendered only for the CURRENT report — a last-good rerender omits them. */
interface DeviceTruth { conflicts: string[]; arrivalLagMs: number | null; regressed: boolean }

export class DriftPanel extends ItemView {
  private fileFilter: string | null = null;
  private unsubscribe: (() => void) | null = null;
  constructor(leaf: WorkspaceLeaf, protected plugin: ChamberDriftPlugin) {
    super(leaf);
  }
  getViewType(): string { return VIEW_TYPE_DRIFT; }
  getDisplayText(): string { return "Chamber Drift"; }
  getIcon(): string { return "shield-alert"; }
  async onOpen(): Promise<void> {
    this.unsubscribe = this.plugin.source.onChange(() => this.render());
    this.render();
  }
  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
  setFileFilter(path: string | null): void { this.fileFilter = path; this.render(); }

  private openVaultFile(path: string, title?: string | null): void {
    void openVaultPin(this.app, path, title);
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass("chamber-drift");
    const s = this.plugin.source.state;

    if (s.kind === "missing") {
      el.createEl("h4", { text: "No report found" });
      el.createEl("p", { text: `Looked for: ${this.plugin.settings.reportPath}` });
      el.createEl("p", { text: "Chamber writes it on a schedule, outside Obsidian:" });
      el.createEl("pre", { text: CRON_LINE });
      // Platform-aware setup nudges — first-party Sync ships with non-md types
      // off, and iCloud eviction makes a synced file empty or invisible.
      if (Platform.isMobile) {
        el.createEl("p", { text: "On mobile with Obsidian Sync: enable Settings → Sync → “Sync all other types”, or the report never arrives." });
        el.createEl("p", { text: "On iCloud: set the vault folder to “Keep Downloaded” — an evicted file shows up empty or not at all." });
      }
      this.renderConflicts(el, s.conflicts);
      this.renderLastGood(el, s.lastGood);
      return;
    }
    if (s.kind === "error") {
      // Three failures that used to collapse into one "unreadable": an empty
      // file (cloud placeholder / eviction), a torn file (sync engine caught
      // mid-write), and genuinely malformed JSON. Different fixes — name them.
      const heading = s.reason === "empty" ? "Report file is empty on this device"
        : s.reason === "truncated" ? "Report looks torn mid-write"
          : "Report unreadable";
      el.createEl("h4", { text: heading });
      if (s.reason === "empty") {
        el.createEl("p", { text: "The file exists here but has no bytes. The scheduled one-liner's [ -s ] guard prevents an empty write at the source, so this is usually transport: an iCloud placeholder that was never downloaded (“Keep Downloaded” off) or a sync engine mid-transfer." });
      } else if (s.reason === "truncated") {
        el.createEl("p", { text: "The file starts like JSON but never closes — usually a sync engine caught mid-write. The panel retries automatically when the file changes and on the next poll." });
      } else {
        el.createEl("p", { text: s.error });
      }
      el.createEl("p", { text: `Path: ${this.plugin.settings.reportPath}` });
      this.renderConflicts(el, s.conflicts);
      this.renderLastGood(el, s.lastGood);
      return;
    }

    this.renderLoaded(el, s.report, s.resolved, s.ageMs, s.ageSource, {
      conflicts: s.conflicts, arrivalLagMs: s.arrivalLagMs, regressed: s.regressed,
    });
  }

  private renderConflicts(el: HTMLElement, conflicts: string[]): void {
    if (conflicts.length === 0) return;
    el.createDiv({
      cls: "chamber-drift-stale",
      text: `Sync-conflict ${conflicts.length === 1 ? "copy" : "copies"} of the report: ${conflicts.join(", ")} — two devices are writing it. Only ${this.plugin.settings.reportPath} is read.`,
    });
  }

  private renderLastGood(el: HTMLElement, lastGood: LastGood | null): void {
    if (!lastGood) return;
    // A torn or evicted file must not blank the panel: the last cleanly-loaded
    // report stays visible, labeled as such, until a good copy lands.
    el.createDiv({ cls: "chamber-drift-lastgood", text: "Last report that loaded cleanly on this device:" });
    const age = reportAge(lastGood.report.generatedAt, lastGood.mtime, Date.now());
    this.renderLoaded(el, lastGood.report, lastGood.resolved, age.ms, age.source, null);
  }

  private renderLoaded(el: HTMLElement, report: Report, resolved: ResolvedIndex, ageMs: number | null, ageSource: AgeSource, dt: DeviceTruth | null): void {
    const header = el.createDiv({ cls: "chamber-drift-header" });
    header.createDiv({
      text: `checked ${ageText(ageMs, ageSource)} · ${report.checked ?? report.beliefs.length} conclusions · ` +
        `${report.broken ?? 0} broken · ${report.degraded ?? 0} degraded · ${report.relocatedPins ?? 0} moved`,
    });
    if (report.database) header.createDiv({ cls: "chamber-drift-db", text: report.database.split("/").pop() ?? "" });

    if (dt?.regressed) {
      el.createDiv({ cls: "chamber-drift-stale", text: "This report is older than the one loaded before it — two verify jobs writing the same file, or a sync conflict resolved to the stale side." });
    }
    if (dt) this.renderConflicts(el, dt.conflicts);
    if (dt && dt.arrivalLagMs !== null && dt.arrivalLagMs > ARRIVAL_LAG_MIN_MS) {
      el.createDiv({ cls: "chamber-drift-transport", text: `Became visible here ${durText(dt.arrivalLagMs)} after it was generated — sync carried it late; verify itself ran.` });
    }

    if (ageMs !== null && ageMs > this.plugin.settings.stalenessHours * 3600_000) {
      el.createDiv({ cls: "chamber-drift-stale", text: `Report is ${ageText(ageMs, ageSource)} — is the scheduled verify running?` });
    }
    if (this.fileFilter) {
      const bar = el.createDiv({ cls: "chamber-drift-filter" });
      bar.createSpan({ text: `Filtered: ${this.fileFilter} ` });
      const clear = bar.createEl("a", { text: "(show all)" });
      clear.onclick = () => this.setFileFilter(null);
    }

    const drifted = report.beliefs.filter((b) => b.failures.length > 0);
    const anyMoved = report.beliefs.some((b) => b.relocations.length > 0);

    // goneFiles must block the clean claim: a deleted pinned note produces a
    // report with zero failures (its pins verify against stored content —
    // chamber KL 5), and "every pinned source still says what it said" is
    // false in exactly that state. The gone-files info block below is the
    // honest rendering, so fall through to it.
    if (this.fileFilter === null && drifted.length === 0 && !anyMoved && report.goneFiles.length === 0) {
      el.createEl("p", { cls: "chamber-drift-clean", text: "No drift. Every pinned source still says what it said." });
      return;
    }

    const vaultPathOf = (rawRef: string): string | null => vaultPathForRef(rawRef, resolved);
    const inFilter = (vaultPath: string | null): boolean => this.fileFilter === null || vaultPath === this.fileFilter;

    let shownBeliefs = 0;
    for (const b of drifted) {
      const rows = b.failures.map((f) => ({ f, vp: vaultPathOf(f.sourceRef ?? f.refId) }));
      const visible = rows.filter((r) => inFilter(r.vp));
      // A filtered view must not show a belief whose every failure lives in
      // some other file — the box-with-no-chips shell that shipped first
      // showed every drifted belief vault-wide under any filter.
      if (this.fileFilter !== null && visible.length === 0) continue;
      shownBeliefs++;
      const box = el.createDiv({ cls: "chamber-drift-belief" });
      box.createDiv({ cls: "chamber-drift-content", text: `“${excerpt(b.content, 120)}”` });
      box.createDiv({ cls: "chamber-drift-count", text: `${b.verified}/${b.total} pins verified` });
      for (const { f, vp } of visible) {
        const chip = box.createDiv({ cls: `chamber-drift-chip chamber-drift-${f.reason}` });
        const label = f.reason === "not_found" && f.sourceRef
          ? `not_found: minted against ${f.sourceRef} — whatever is there now is not what was cited`
          : f.reason === "hash_mismatch"
            ? `hash_mismatch: ${f.sourceRef ?? f.refId}${f.title ? ` — now holds: ${f.title}` : ""}`
            : `${f.reason}: ${f.sourceRef ?? f.refId}`;
        if (vp) { const a = chip.createEl("a", { text: label }); a.onclick = () => this.openVaultFile(vp, f.title); }
        else chip.createSpan({ text: `${label} (outside this vault)` });
      }
    }

    let shownMoved = 0;
    if (this.plugin.settings.showRelocations) {
      const movedRows: { from: string; to: string | null }[] = [];
      for (const b of report.beliefs) for (const r of b.relocations) {
        if (inFilter(vaultPathOf(r.from))) movedRows.push({ from: r.from, to: r.to });
      }
      shownMoved = movedRows.length;
      if (movedRows.length > 0) {
        const det = el.createEl("details", { cls: "chamber-drift-moved" });
        det.createEl("summary", { text: `${movedRows.length} passage(s) found at a new position — support intact where noted` });
        for (const r of movedRows) det.createDiv({ text: `moved: ${r.from} → ${r.to ?? "?"}` });
      }
    }
    const goneVisible = report.goneFiles.filter((g) => goneFileMatchesFilter(g.file, this.fileFilter));
    if (goneVisible.length > 0) {
      const det = el.createEl("details", { cls: "chamber-drift-gone" });
      det.createEl("summary", { text: `${goneVisible.length} pinned file(s) no longer on disk — pins verify against stored content only` });
      for (const g of goneVisible) det.createDiv({ text: `${g.file} (${g.passages} passage(s))` });
    }

    if (shownBeliefs === 0 && shownMoved === 0 && goneVisible.length === 0) {
      el.createEl("p", {
        cls: "chamber-drift-clean",
        text: this.fileFilter ? "No drift on this note." : "No drift. Every pinned source still says what it said.",
      });
    }
  }
}
