import type { Report } from "./report";
import { vaultPathForRef, type ResolvedIndex } from "./fileIndex";

export interface BeliefHit {
  beliefId: string;
  content: string;
  vaultPath: string | null;
  reason: string;
  title: string | null;
  pinCount: number;
}

/** Notes that currently have drifted or moved pins standing on them, vault-path order. */
export function alarmedVaultPaths(resolved: ResolvedIndex): string[] {
  return [...resolved.byVaultPath.entries()]
    .filter(([, e]) => e.drifted.length > 0 || e.moved.length > 0)
    .map(([p]) => p)
    .sort();
}

export function beliefHits(report: Report, resolved: ResolvedIndex): BeliefHit[] {
  return report.beliefs.filter((b) => b.failures.length > 0).map((b) => {
    const f = b.failures[0];
    return {
      beliefId: b.beliefId,
      content: b.content,
      vaultPath: vaultPathForRef(f.sourceRef ?? f.refId, resolved),
      reason: f.reason,
      title: f.title ?? null,
      pinCount: b.failures.length,
    };
  });
}

export function neighborPath(paths: readonly string[], current: string | null, dir: 1 | -1): string | null {
  if (paths.length === 0) return null;
  const first = paths[0] ?? null;
  const last = paths[paths.length - 1] ?? null;
  if (current === null) return dir === 1 ? first : last;
  const i = paths.indexOf(current);
  if (i < 0) return dir === 1 ? first : last;
  const next = i + dir;
  if (next < 0) return last;
  if (next >= paths.length) return first;
  return paths[next] ?? null;
}

/**
 * Status bar is silent when the vault is clean and the report is fresh — same
 * rule as the note banner. Priority: real drift, then a sync-conflict copy of
 * the report (an integrity problem), then staleness, then gone files.
 */
export function statusLabel(opts: { driftedBeliefs: number; goneFiles: number; stale: boolean; conflicts: boolean }): string | null {
  if (opts.driftedBeliefs > 0) return `Drift ${opts.driftedBeliefs}`;
  if (opts.conflicts) return "Drift conflict";
  if (opts.stale) return "Drift stale";
  if (opts.goneFiles > 0) return "Drift gone";
  return null;
}

export function wikilinkList(paths: readonly string[]): string {
  return paths.map((p) => `[[${p.replace(/\.md$/i, "")}]]`).join("\n");
}

/**
 * Best-effort cursor target inside a note. Chamber titles are often
 * `file › heading › heading`; the last segment is what usually appears in the file.
 */
export function locateNeedle(content: string, title: string | null): number {
  if (!title) return -1;
  const exact = content.indexOf(title);
  if (exact >= 0) return exact;
  const last = title.split(/[›>]/).map((s) => s.trim()).filter(Boolean).pop();
  if (last && last.length >= 4) return content.indexOf(last);
  return -1;
}
