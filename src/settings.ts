import { App, PluginSettingTab, Setting } from "obsidian";
import type ChamberDriftPlugin from "./main";

export interface ChamberDriftSettings {
  reportPath: string;      // vault-relative
  stalenessHours: number;  // warn past this
  showBanner: boolean;
  showRelocations: boolean;
}
export const DEFAULT_SETTINGS: ChamberDriftSettings = {
  reportPath: "_chamber/report.json",
  stalenessHours: 48,
  showBanner: true,
  showRelocations: true,
};

export class ChamberDriftSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ChamberDriftPlugin) { super(app, plugin); }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName("Report path")
      .setDesc("Vault-relative path your scheduled `chamber verify --json` writes to. Dot-paths fall back to polling — Obsidian raises no file events for them.")
      .addText((t) => t.setValue(this.plugin.settings.reportPath).onChange(async (v) => {
        this.plugin.settings.reportPath = v.trim() || DEFAULT_SETTINGS.reportPath;
        await this.plugin.saveSettings(); await this.plugin.source.refresh();
      }));
    new Setting(containerEl)
      .setName("Staleness warning (hours)")
      .setDesc("Warn when the report is older than this — a stale report usually means the scheduled verify stopped running.")
      .addText((t) => t.setValue(String(this.plugin.settings.stalenessHours)).onChange(async (v) => {
        const n = Number(v);
        this.plugin.settings.stalenessHours = Number.isFinite(n) && n > 0 ? n : DEFAULT_SETTINGS.stalenessHours;
        await this.plugin.saveSettings(); this.plugin.source.notify();
      }));
    new Setting(containerEl).setName("Show note banner").addToggle((t) =>
      t.setValue(this.plugin.settings.showBanner).onChange(async (v) => {
        this.plugin.settings.showBanner = v; await this.plugin.saveSettings(); this.plugin.source.notify();
      }));
    new Setting(containerEl).setName("Show relocations (moved passages)").addToggle((t) =>
      t.setValue(this.plugin.settings.showRelocations).onChange(async (v) => {
        this.plugin.settings.showRelocations = v; await this.plugin.saveSettings(); this.plugin.source.notify();
      }));
  }
}
