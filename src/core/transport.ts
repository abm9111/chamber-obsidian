import { listedVaultPath, normalizeVaultPath, vaultParentDir } from "./paths";

/**
 * Device-truth checks for the report file itself. X practitioner reports
 * (Aug 2026) locate the failure between the writer and this device: iCloud
 * placeholders arrive empty, sync engines deliver torn or out-of-order
 * copies, and two writers leave conflict siblings next to the file.
 * Everything here is observation over strings — no I/O, no fixes.
 */

/** Arrival lag below this is unremarkable; above it, the panel says sync carried the report late. */
export const ARRIVAL_LAG_MIN_MS = 30 * 60_000;

/** A file that starts like JSON but never closes is a torn copy, not a malformed report. */
export function looksTruncated(raw: string): boolean {
  const head = raw.trimStart();
  if (!(head.startsWith("{") || head.startsWith("["))) return false;
  const tail = raw.trimEnd();
  return !(tail.endsWith("}") || tail.endsWith("]"));
}

/**
 * Sync-conflict siblings of the report: same folder, same stem, and a
 * conflict marker in the name — Syncthing's `report.sync-conflict-…json`,
 * Dropbox-style `report (conflicted copy).json`. Numbered duplicates like
 * `report 2.json` are deliberately not matched: too ambiguous to alarm on.
 */
export function conflictSiblings(reportPath: string, vaultPaths: readonly string[]): string[] {
  const report = listedVaultPath(reportPath);
  const dir = vaultParentDir(report);
  const base = report.slice(dir.length);
  const stem = base.replace(/\.[^.]*$/, "").toLowerCase();
  return vaultPaths
    .map(listedVaultPath)
    .filter((p) => {
      if (p === report) return false;
      if (vaultParentDir(p) !== dir) return false;
      const name = p.slice(dir.length).toLowerCase();
      return name.startsWith(stem) && name.includes("conflict");
    })
    .sort();
}

/** Vault event should wake the source: the report itself, or a conflict sibling of it. */
export function eventTouchesReport(reportPath: string, eventPath: string): boolean {
  const report = normalizeVaultPath(reportPath);
  const event = normalizeVaultPath(eventPath);
  if (report === event) return true;
  return conflictSiblings(report, [event]).length > 0;
}

/**
 * True when the next report is older than the previous one. 1s slack so
 * clock jitter between writers does not read as a rollback; a real
 * regression (a sync conflict resolving to the stale side, or two verify
 * jobs racing) is minutes, not milliseconds.
 */
export function isRegression(prevGeneratedMs: number, nextGeneratedMs: number): boolean {
  return nextGeneratedMs < prevGeneratedMs - 1000;
}
