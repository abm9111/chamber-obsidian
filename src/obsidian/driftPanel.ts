import { ItemView, WorkspaceLeaf } from "obsidian";
import type ChamberDriftPlugin from "../main";
export const VIEW_TYPE_DRIFT = "chamber-drift-panel";
export class DriftPanel extends ItemView {
  constructor(leaf: WorkspaceLeaf, protected plugin: ChamberDriftPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE_DRIFT; }
  getDisplayText(): string { return "Chamber Drift"; }
  getIcon(): string { return "shield-alert"; }
  setFileFilter(_path: string | null): void { void _path; }
}
