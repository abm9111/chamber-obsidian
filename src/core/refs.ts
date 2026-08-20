/** Strip the `#pN` passage suffix — and only that suffix (filenames may contain '#'). */
export function refToPath(ref: string): string {
  return ref.replace(/#p\d+$/, "");
}

export type Resolution = { kind: "exact" | "suffix"; path: string } | { kind: "unresolved" };

/**
 * Report refs are relative to the INGEST root, which is the vault root in the
 * common setup — but ingesting a vault subfolder is ordinary, and then every
 * ref misses at the vault root. Resolution order: exact; unique path-suffix
 * (whole segments — accepted only when exactly one vault file matches, a
 * uniqueness proof rather than a guess); otherwise unresolved. Ambiguity is
 * always unresolved — never pick one. Stripping happens exactly once, here —
 * resolvePath exists so callers holding already-stripped keys (buildFileIndex's
 * map) cannot strip twice, which mis-resolved extensionless `#pN`-suffixed
 * filenames.
 */
export function resolveRef(ref: string, vaultPaths: readonly string[]): Resolution {
  return resolvePath(refToPath(ref), vaultPaths);
}

/** Resolve an ALREADY-STRIPPED path. resolveRef = strip once, then this. */
export function resolvePath(path: string, vaultPaths: readonly string[]): Resolution {
  if (vaultPaths.includes(path)) return { kind: "exact", path };
  const matches = vaultPaths.filter((v) => v.endsWith("/" + path));
  if (matches.length === 1) return { kind: "suffix", path: matches[0] };
  return { kind: "unresolved" };
}
