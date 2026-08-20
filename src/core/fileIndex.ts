import type { Report } from "./report";
import { refToPath, resolvePath } from "./refs";

/**
 * Inverts the report: which files does drift stand on? Drift-only by data
 * fact, not choice — a healthy belief's entry carries counters and EMPTY
 * failures/relocations, so the refs of intact pins appear nowhere in
 * `verify --json`. Any UI implying we know what healthy conclusions cite
 * would be speced against data that does not exist.
 */
export interface DriftedPin { beliefId: string; contentExcerpt: string; reason: string; ref: string; titleNow: string | null }
export interface MovedPin { beliefId: string; contentExcerpt: string; from: string; to: string | null }
export interface FileEntry { drifted: DriftedPin[]; moved: MovedPin[] }

const EXCERPT = 80;
const excerpt = (s: string): string => (s.length > EXCERPT ? s.slice(0, EXCERPT - 1) + "…" : s);

export function buildFileIndex(report: Report): Map<string, FileEntry> {
  const out = new Map<string, FileEntry>();
  const entry = (key: string): FileEntry => {
    let e = out.get(key);
    if (!e) { e = { drifted: [], moved: [] }; out.set(key, e); }
    return e;
  };
  for (const b of report.beliefs) {
    for (const f of b.failures) {
      const ref = f.sourceRef ?? f.refId; // not_found pins from old chambers have no position — key by id, labeled unresolvable downstream
      entry(refToPath(ref)).drifted.push({ beliefId: b.beliefId, contentExcerpt: excerpt(b.content), reason: f.reason, ref, titleNow: f.title ?? null });
    }
    for (const r of b.relocations) {
      entry(refToPath(r.from)).moved.push({ beliefId: b.beliefId, contentExcerpt: excerpt(b.content), from: r.from, to: r.to });
    }
  }
  return out;
}

export interface ResolvedIndex { byVaultPath: Map<string, FileEntry>; unresolved: Map<string, FileEntry> }

export function resolveIndex(index: Map<string, FileEntry>, vaultPaths: readonly string[]): ResolvedIndex {
  const byVaultPath = new Map<string, FileEntry>();
  const unresolved = new Map<string, FileEntry>();
  for (const [refPath, e] of index) {
    const r = resolvePath(refPath, vaultPaths); // refPath is already stripped (buildFileIndex's key) — do not strip again
    if (r.kind === "unresolved") { unresolved.set(refPath, e); continue; }
    const prev = byVaultPath.get(r.path);
    if (prev) { prev.drifted.push(...e.drifted); prev.moved.push(...e.moved); }
    else byVaultPath.set(r.path, { drifted: [...e.drifted], moved: [...e.moved] });
  }
  return { byVaultPath, unresolved };
}
