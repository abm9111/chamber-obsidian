import { Plugin, WorkspaceLeaf } from "obsidian";
import { ChamberDriftSettingTab, DEFAULT_SETTINGS, type ChamberDriftSettings } from "./settings";
import { ReportSource } from "./obsidian/reportSource";
import { DriftPanel, VIEW_TYPE_DRIFT } from "./obsidian/driftPanel";
import { NoteBanner } from "./obsidian/noteBanner";

export default class ChamberDriftPlugin extends Plugin {
  settings: ChamberDriftSettings = DEFAULT_SETTINGS;
  source!: ReportSource;
  private banner!: NoteBanner;

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.source = new ReportSource(this.app, this);
    this.registerView(VIEW_TYPE_DRIFT, (leaf: WorkspaceLeaf) => new DriftPanel(leaf, this));
    this.addRibbonIcon("shield-alert", "Chamber Drift", () => void this.activatePanel());
    this.addCommand({ id: "open-panel", name: "Open drift panel", callback: () => void this.activatePanel() });
    this.addSettingTab(new ChamberDriftSettingTab(this.app, this));
    this.banner = new NoteBanner(this);
    this.banner.start();
    this.source.start();
  }

  onunload(): void { this.banner.detach(); }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }

  async activatePanel(filterPath: string | null = null): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DRIFT)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_DRIFT, active: true });
    this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof DriftPanel) view.setFileFilter(filterPath);
  }
}
