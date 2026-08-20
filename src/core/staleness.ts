/**
 * Age of a report. `generatedAt` (inside the report) always wins: a synced
 * copy's mtime is whatever the sync engine set, so mtime-based staleness is a
 * control that silently stops working on exactly the mobile path the file
 * transport exists for. mtime is the labeled fallback for reports from
 * Chamber versions predating the field.
 */
export type AgeSource = "generatedAt" | "mtime" | "unknown";
export interface ReportAge { ms: number | null; source: AgeSource }

export function reportAge(generatedAt: string | undefined, mtimeMs: number | null, nowMs: number): ReportAge {
  if (generatedAt !== undefined) {
    const t = Date.parse(generatedAt);
    if (Number.isFinite(t)) return { ms: Math.max(0, nowMs - t), source: "generatedAt" };
  }
  if (mtimeMs !== null) return { ms: Math.max(0, nowMs - mtimeMs), source: "mtime" };
  return { ms: null, source: "unknown" };
}
