import { MarkdownView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { ChamberDriftSettingTab, DEFAULT_SETTINGS, type ChamberDriftSettings } from "./settings";
import { ReportSource } from "./obsidian/reportSource";
import { DriftPanel, VIEW_TYPE_DRIFT } from "./obsidian/driftPanel";
import { NoteBanner } from "./obsidian/noteBanner";
import { DriftStatusBar } from "./obsidian/statusBar";
import { DriftSearchModal } from "./obsidian/searchModal";
import { openVaultPin } from "./obsidian/openPin";
import { alarmedVaultPaths, neighborPath, wikilinkList, type BeliefHit } from "./core/nav";

export default class ChamberDriftPlugin extends Plugin {
  settings: ChamberDriftSettings = DEFAULT_SETTINGS;
  source!: ReportSource;
  private banner!: NoteBanner;
  private statusBar!: DriftStatusBar;

  async onload(): Promise<void> {
    // loadData() is typed `any`; spreading it directly is the unsafe
    // assignment the directory's type-checked lint flags. Narrow it once.
    const stored = (await this.loadData()) as Partial<ChamberDriftSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
    this.source = new ReportSource(this.app, this);
    this.registerView(VIEW_TYPE_DRIFT, (leaf: WorkspaceLeaf) => new DriftPanel(leaf, this));
    this.addRibbonIcon("shield-alert", "Chamber Drift", () => void this.activatePanel());
    this.addCommand({ id: "open-panel", name: "Open drift panel", callback: () => void this.activatePanel() });
    this.addCommand({ id: "search-drifted", name: "Search drifted conclusions", callback: () => new DriftSearchModal(this).open() });
    this.addCommand({ id: "next-drifted-note", name: "Open next drifted note", callback: () => void this.jumpDrifted(1) });
    this.addCommand({ id: "prev-drifted-note", name: "Open previous drifted note", callback: () => void this.jumpDrifted(-1) });
    this.addCommand({ id: "copy-drifted-wikilinks", name: "Copy drifted note wikilinks", callback: () => void this.copyDriftedWikilinks() });
    this.addSettingTab(new ChamberDriftSettingTab(this.app, this));
    this.banner = new NoteBanner(this);
    this.banner.start();
    this.statusBar = new DriftStatusBar(this);
    this.statusBar.start();
    this.source.start();
  }

  onunload(): void { this.banner.detach(); }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }

  async activatePanel(filterPath: string | null = null): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DRIFT)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(true) ?? this.app.workspace.getLeaf(false);
    if (!leaf) {
      new Notice("Chamber Drift could not open a pane for the drift panel.");
      return;
    }
    await leaf.setViewState({ type: VIEW_TYPE_DRIFT, active: true });
    // revealLeaf returns a Promise since Obsidian 1.7.2 — which is also why
    // the manifest's minAppVersion is 1.7.2: declaring 1.5.0 while calling
    // the promising signature was the directory review's one hard Error.
    await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof DriftPanel) view.setFileFilter(filterPath);
  }

  async openHit(hit: BeliefHit): Promise<void> {
    if (hit.vaultPath) {
      await openVaultPin(this.app, hit.vaultPath, hit.title);
      await this.activatePanel(hit.vaultPath);
    } else {
      await this.activatePanel(null);
    }
  }

  async jumpDrifted(dir: 1 | -1): Promise<void> {
    const cur = this.source.current();
    if (!cur) {
      new Notice("Chamber Drift has no report loaded.");
      return;
    }
    const paths = alarmedVaultPaths(cur.resolved);
    const current = this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path ?? null;
    const next = neighborPath(paths, current, dir);
    if (!next) {
      new Notice("No drifted notes in this vault.");
      return;
    }
    await openVaultPin(this.app, next, null);
  }

  async copyDriftedWikilinks(): Promise<void> {
    const cur = this.source.current();
    if (!cur) {
      new Notice("Chamber Drift has no report loaded.");
      return;
    }
    const paths = alarmedVaultPaths(cur.resolved);
    if (paths.length === 0) {
      new Notice("No drifted notes to copy.");
      return;
    }
    await navigator.clipboard.writeText(wikilinkList(paths));
    new Notice(`Copied ${paths.length} drifted note wikilink${paths.length === 1 ? "" : "s"}.`);
  }
}
