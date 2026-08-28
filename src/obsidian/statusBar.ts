import { Platform } from "obsidian";
import type ChamberDriftPlugin from "../main";
import { statusLabel } from "../core/nav";
import { reportAge } from "../core/staleness";

/**
 * Quiet desktop watchdog. Hidden when the report is clean and fresh —
 * same silence-on-healthy rule as the note banner. No Notices.
 * Mobile has no status bar; commands cover that path.
 */
export class DriftStatusBar {
  private el: HTMLElement | null = null;
  constructor(private plugin: ChamberDriftPlugin) {}

  start(): void {
    if (Platform.isMobile) return;
    this.el = this.plugin.addStatusBarItem();
    this.el.addClass("chamber-drift-status");
    this.el.setAttr("title", "Chamber Drift");
    this.el.onclick = () => void this.plugin.activatePanel();
    this.plugin.source.onChange(() => this.update());
    this.update();
  }

  update(): void {
    if (!this.el) return;
    if (!this.plugin.settings.showStatusBar) {
      this.el.setText("");
      this.el.style.display = "none";
      return;
    }
    const cur = this.plugin.source.current();
    const driftedBeliefs = cur ? cur.report.beliefs.filter((b) => b.failures.length > 0).length : 0;
    const goneFiles = cur ? cur.report.goneFiles.length : 0;
    const age = cur ? reportAge(cur.report.generatedAt, cur.mtime, Date.now()) : { ms: null };
    const stale = age.ms !== null && age.ms > this.plugin.settings.stalenessHours * 3600_000;
    const label = statusLabel({
      driftedBeliefs,
      goneFiles,
      stale,
      conflicts: this.plugin.source.state.conflicts.length > 0,
    });
    if (!label) {
      this.el.setText("");
      this.el.style.display = "none";
      return;
    }
    this.el.setText(label);
    this.el.style.display = "";
    this.el.setAttr("title", `${label} — click to open the drift panel`);
  }
}
