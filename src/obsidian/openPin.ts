import { MarkdownView, TFile, type App } from "obsidian";
import { locateNeedle } from "../core/nav";

/** Open a vault file and, when a Chamber title is given, land the cursor on that heading if it still exists. */
export async function openVaultPin(app: App, path: string, title?: string | null): Promise<void> {
  const f = app.vault.getAbstractFileByPath(path);
  if (!(f instanceof TFile)) return;
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(f);
  if (!title) return;
  const view = leaf.view;
  if (!(view instanceof MarkdownView)) return;
  const editor = view.editor;
  const at = locateNeedle(editor.getValue(), title);
  if (at < 0) return;
  const pos = editor.offsetToPos(at);
  editor.setCursor(pos);
  editor.scrollIntoView({ from: pos, to: pos }, true);
}
