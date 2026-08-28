import { App, PluginSettingTab, Setting } from "obsidian";
import type ChamberDriftPlugin from "./main";

export interface ChamberDriftSettings {
  reportPath: string;      // vault-relative
  stalenessHours: number;  // warn past this
  showBanner: boolean;
  showRelocations: boolean;
  showStatusBar: boolean;
}
export const DEFAULT_SETTINGS: ChamberDriftSettings = {
  reportPath: "_chamber/report.json",
  stalenessHours: 48,
  showBanner: true,
  showRelocations: true,
  showStatusBar: true,
};

export class ChamberDriftSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ChamberDriftPlugin) { super(app, plugin); }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName("Report path")
      .setDesc("Vault-relative path your scheduled `chamber verify --json` writes to. Dot-paths fall back to polling — Obsidian raises no file events for them.")
      .addText((t) => {
        t.setValue(this.plugin.settings.reportPath);
        const apply = async () => {
          const next = t.getValue().trim() || DEFAULT_SETTINGS.reportPath;
          t.setValue(next);
          if (next === this.plugin.settings.reportPath) return;
          this.plugin.settings.reportPath = next;
          await this.plugin.saveSettings();
          await this.plugin.source.refresh();
        };
        t.inputEl.addEventListener("blur", () => void apply());
        t.inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") t.inputEl.blur(); });
      });
    new Setting(containerEl)
      .setName("Staleness warning (hours)")
      .setDesc("Warn when the report is older than this — a stale report usually means the scheduled verify stopped running.")
      .addText((t) => {
        t.setValue(String(this.plugin.settings.stalenessHours));
        const apply = async () => {
          const n = Number(t.getValue());
          if (Number.isFinite(n) && n > 0) {
            if (n === this.plugin.settings.stalenessHours) return;
            this.plugin.settings.stalenessHours = n;
            await this.plugin.saveSettings();
            this.plugin.source.notify();
          } else {
            t.setValue(String(this.plugin.settings.stalenessHours));
          }
        };
        t.inputEl.addEventListener("blur", () => void apply());
        t.inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") t.inputEl.blur(); });
      });
    new Setting(containerEl).setName("Show note banner").addToggle((t) =>
      t.setValue(this.plugin.settings.showBanner).onChange(async (v) => {
        this.plugin.settings.showBanner = v; await this.plugin.saveSettings(); this.plugin.source.notify();
      }));
    new Setting(containerEl).setName("Show relocations (moved passages)").addToggle((t) =>
      t.setValue(this.plugin.settings.showRelocations).onChange(async (v) => {
        this.plugin.settings.showRelocations = v; await this.plugin.saveSettings(); this.plugin.source.notify();
      }));
    new Setting(containerEl)
      .setName("Show status bar")
      .setDesc("Desktop only. Hidden when the report is clean and fresh — no extra chrome on a healthy vault.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showStatusBar).onChange(async (v) => {
          this.plugin.settings.showStatusBar = v; await this.plugin.saveSettings(); this.plugin.source.notify();
        }));
  }
}
