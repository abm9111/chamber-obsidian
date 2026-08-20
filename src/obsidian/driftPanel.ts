import { ItemView, Platform, TFile, WorkspaceLeaf } from "obsidian";
import type ChamberDriftPlugin from "../main";

export const VIEW_TYPE_DRIFT = "chamber-drift-panel";

// The `[ -s … ]` guard moves only a non-empty temp file: the redirect creates
// the file even when the command never runs (wrong PATH under launchd), and an
// unguarded mv then replaces the last known-good report with an empty one.
// `&&` after verify would be the WRONG guard — verify exits 1 when drift
// exists, so gating the move on exit status suppresses exactly the reports
// that matter. Review caught both wrong forms shipping side by side.
const CRON_LINE =
  'chamber verify --json > "<vault>/_chamber/.report.tmp" ; [ -s "<vault>/_chamber/.report.tmp" ] && mv "<vault>/_chamber/.report.tmp" "<vault>/_chamber/report.json"';

function ageText(ms: number | null, source: string): string {
  if (ms === null) return "age unknown";
  const h = ms / 3600_000;
  const t = h < 1 ? `${Math.max(1, Math.round(ms / 60_000))} min ago`
    : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago`;
  return source === "mtime" ? `${t} (approx — from file time)` : t;
}

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

  private openVaultFile(path: string): void {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) void this.app.workspace.getLeaf(false).openFile(f);
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
      // Platform-aware setup nudge — first-party Sync ships with non-md types off.
      if (Platform.isMobile) {
        el.createEl("p", { text: "On mobile with Obsidian Sync: enable Settings → Sync → “Sync all other types”, or the report never arrives." });
      }
      return;
    }
    if (s.kind === "error") {
      el.createEl("h4", { text: "Report unreadable" });
      el.createEl("p", { text: s.error });
      el.createEl("p", { text: `Path: ${this.plugin.settings.reportPath}` });
      return;
    }

    const { report, ageMs, ageSource, resolved } = s;
    const header = el.createDiv({ cls: "chamber-drift-header" });
    header.createEl("div", {
      text: `checked ${ageText(ageMs, ageSource)} · ${report.checked ?? report.beliefs.length} conclusions · ` +
        `${report.broken ?? 0} broken · ${report.degraded ?? 0} degraded · ${report.relocatedPins ?? 0} moved`,
    });
    if (report.database) header.createEl("div", { cls: "chamber-drift-db", text: report.database.split("/").pop() ?? "" });

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

    if (drifted.length === 0 && (report.relocatedPins ?? 0) === 0) {
      el.createEl("p", { cls: "chamber-drift-clean", text: "No drift. Every pinned source still says what it said." });
      return;
    }

    // Identity match on the unstripped ref — the index stores refs verbatim,
    // so equality is available and prefix-matching was a bug: a report entry
    // whose refId and sourceRef both coerced to "" prefix-matched every pin
    // in every file and rendered as a clickable link to whichever vault path
    // the Map yielded first. Exact match makes the malformed case naturally
    // unresolvable instead.
    const vaultPathOf = (rawRef: string): string | null => {
      for (const [vp, entry] of resolved.byVaultPath) {
        if (entry.drifted.some((d) => d.ref === rawRef) || entry.moved.some((m) => m.from === rawRef)) return vp;
      }
      return null;
    };
    const inFilter = (vaultPath: string | null): boolean => this.fileFilter === null || vaultPath === this.fileFilter;

    for (const b of drifted) {
      const rows = b.failures.map((f) => ({ f, vp: vaultPathOf(f.sourceRef ?? f.refId) }));
      const visible = rows.filter((r) => inFilter(r.vp));
      // A filtered view must not show a belief whose every failure lives in
      // some other file — the box-with-no-chips shell that shipped first
      // showed every drifted belief vault-wide under any filter.
      if (this.fileFilter !== null && visible.length === 0) continue;
      const box = el.createDiv({ cls: "chamber-drift-belief" });
      box.createEl("div", { cls: "chamber-drift-content", text: `“${b.content.length > 120 ? b.content.slice(0, 119) + "…" : b.content}”` });
      box.createEl("div", { cls: "chamber-drift-count", text: `${b.verified}/${b.total} pins verified` });
      for (const { f, vp } of visible) {
        const chip = box.createDiv({ cls: `chamber-drift-chip chamber-drift-${f.reason}` });
        const label = f.reason === "not_found" && f.sourceRef
          ? `not_found: minted against ${f.sourceRef} — whatever is there now is not what was cited`
          : f.reason === "hash_mismatch"
            ? `hash_mismatch: ${f.sourceRef ?? f.refId}${f.title ? ` — now holds: ${f.title}` : ""}`
            : `${f.reason}: ${f.sourceRef ?? f.refId}`;
        if (vp) { const a = chip.createEl("a", { text: label }); a.onclick = () => this.openVaultFile(vp); }
        else chip.createSpan({ text: `${label} (outside this vault)` });
      }
    }

    if (this.plugin.settings.showRelocations && (report.relocatedPins ?? 0) > 0) {
      const det = el.createEl("details", { cls: "chamber-drift-moved" });
      det.createEl("summary", { text: `${report.relocatedPins} passage(s) found at a new position — support intact where noted` });
      for (const b of report.beliefs) for (const r of b.relocations) {
        det.createEl("div", { text: `moved: ${r.from} → ${r.to ?? "?"}` });
      }
    }
    if (report.goneFiles.length > 0) {
      const det = el.createEl("details", { cls: "chamber-drift-gone" });
      det.createEl("summary", { text: `${report.goneFiles.length} pinned file(s) no longer on disk — pins verify against stored content only` });
      for (const g of report.goneFiles) det.createEl("div", { text: `${g.file} (${g.passages} passage(s))` });
    }
  }
}
