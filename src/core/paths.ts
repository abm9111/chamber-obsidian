/** Vault-path helpers. Obsidian uses `/` even on Windows; we still normalize. */

export function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function vaultPathsEqual(a: string, b: string): boolean {
  return normalizeVaultPath(a) === normalizeVaultPath(b);
}

/**
 * Obsidian's vault index ignores any path with a dot-prefixed segment, not
 * only a leading `.`. Those paths get no create/modify/rename events — the
 * 30s poll has to cover `notes/.chamber/report.json` as well as `.chamber/…`.
 */
export function isEventBlindPath(path: string): boolean {
  return normalizeVaultPath(path).split("/").some((seg) => seg.startsWith("."));
}

/** Gone-file paths are ingest-relative (or absolute); match the panel filter only when it's that file. */
export function goneFileMatchesFilter(goneFile: string, fileFilter: string | null): boolean {
  if (fileFilter === null) return true;
  const n = normalizeVaultPath(goneFile);
  const f = normalizeVaultPath(fileFilter);
  return n === f || n.endsWith("/" + f);
}
