/** Vault-path helpers. Obsidian uses `/` even on Windows; we still normalize. */

export function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function vaultPathsEqual(a: string, b: string): boolean {
  return normalizeVaultPath(a) === normalizeVaultPath(b);
}

/**
 * Parent folder of a vault path, with a trailing slash so it can be
 * compared to another path's parent. Vault root is `""` — not `"/"` —
 * because listed siblings at the root are `report.json`, not `/report.json`.
 */
export function vaultParentDir(path: string): string {
  const n = listedVaultPath(path);
  const slash = n.lastIndexOf("/");
  return slash >= 0 ? n.slice(0, slash + 1) : "";
}

/**
 * Argument for `adapter.list`. Vault root is `"/"` (Obsidian's list of
 * `""` is unreliable); every other folder is the parent without a slash.
 */
export function listDir(path: string): string {
  const parent = vaultParentDir(path);
  return parent === "" ? "/" : parent.slice(0, -1);
}

/** Strip a leading slash so a list("/") result compares as a vault-root path. */
export function listedVaultPath(path: string): string {
  const n = normalizeVaultPath(path);
  return n.startsWith("/") ? n.slice(1) : n;
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
