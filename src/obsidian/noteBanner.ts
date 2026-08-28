import { MarkdownView } from "obsidian";
import type ChamberDriftPlugin from "../main";

/**
 * Drift-only and quiet: appears ONLY on notes with drifted or moved pins.
 * Healthy notes get nothing — the report carries no refs for intact pins, so
 * a reassuring banner would be speced against data that does not exist, and
 * silence-on-healthy is the more Obsidian-native behaviour anyway. Injected
 * into the view's CONTENT container, not titlebar chrome — mobile's header
 * differs and content prepend is layout-safe on both.
 */
export class NoteBanner {
  private els = new Set<HTMLElement>();
  constructor(private plugin: ChamberDriftPlugin) {}

  start(): void {
    this.plugin.registerEvent(this.plugin.app.workspace.on("active-leaf-change", () => this.update()));
    this.plugin.registerEvent(this.plugin.app.workspace.on("file-open", () => this.update()));
    // Plugin-lifetime singleton (constructed once in onload, detached in onunload) —
    // unlike a panel leaf, it never reopens, so there is nothing to unsubscribe for.
    // The unsubscribe this returns is deliberately unused; views that churn (open/close
    // repeatedly, e.g. DriftPanel) must capture and call it instead.
    this.plugin.source.onChange(() => this.update());
  }

  detach(): void { for (const el of this.els) el.remove(); this.els.clear(); }

  private update(): void {
    this.detach();
    if (!this.plugin.settings.showBanner) return;
    const cur = this.plugin.source.current();
    if (!cur) return;
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    if (!view || !file) return;
    const entry = cur.resolved.byVaultPath.get(file.path);
    if (!entry || (entry.drifted.length === 0 && entry.moved.length === 0)) return;

    const parts: string[] = [];
    if (entry.drifted.length > 0) parts.push(`${entry.drifted.length} conclusion pin(s) lost support standing on this note`);
    if (entry.moved.length > 0) parts.push(`${entry.moved.length} passage(s) here moved under conclusions`);
    const el = view.contentEl.createDiv({ cls: "chamber-drift-banner" });
    el.createSpan({ text: parts.join(" · ") + " " });
    const open = el.createEl("a", { text: "details" });
    open.onclick = () => void this.plugin.activatePanel(file.path);
    view.contentEl.prepend(el);
    this.els.add(el);
  }
}
