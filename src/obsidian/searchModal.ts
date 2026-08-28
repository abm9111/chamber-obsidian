import { FuzzySuggestModal } from "obsidian";
import type ChamberDriftPlugin from "../main";
import { beliefHits, type BeliefHit } from "../core/nav";
import { excerpt } from "../core/text";

export class DriftSearchModal extends FuzzySuggestModal<BeliefHit> {
  constructor(private plugin: ChamberDriftPlugin) {
    super(plugin.app);
    this.setPlaceholder("Search drifted conclusions…");
    this.emptyStateText = "No drifted conclusions.";
  }

  getItems(): BeliefHit[] {
    const cur = this.plugin.source.current();
    this.emptyStateText = cur ? "No drifted conclusions." : "No report loaded.";
    if (!cur) return [];
    return beliefHits(cur.report, cur.resolved);
  }

  getItemText(item: BeliefHit): string {
    const where = item.vaultPath ?? "outside this vault";
    return `${excerpt(item.content, 80)} ${where} ${item.reason}`;
  }

  onChooseItem(item: BeliefHit): void {
    void this.plugin.openHit(item);
  }
}
