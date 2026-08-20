/**
 * Parse and validate a chamber `verify --json` report.
 *
 * Validation requires only: JSON, an object, `beliefs` an array. Everything
 * else is optional and unknown fields pass through untouched, so Chamber can
 * grow the report additively without breaking installed plugins. Anything
 * less than the minimum renders as "unreadable" — never a throw: this runs
 * inside the Obsidian UI process on every file change.
 */
export interface PinFailure { refId: string; reason: string; sourceRef?: string | null; title?: string | null }
export interface Relocation { refId: string; from: string; to: string | null; title?: string | null }
export interface BeliefEntry { beliefId: string; content: string; total: number; verified: number; failures: PinFailure[]; relocations: Relocation[] }
export interface Report {
  generatedAt?: string; database?: string; checked?: number; broken?: number; degraded?: number;
  relocatedPins?: number; goneFiles: { file: string; passages: number }[]; beliefs: BeliefEntry[];
}
export const MAX_REPORT_BYTES = 5 * 1024 * 1024;
export type ParseResult = { ok: true; report: Report } | { ok: false; error: string };

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const optStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

export function parseReport(raw: string): ParseResult {
  if (raw.length > MAX_REPORT_BYTES) {
    return { ok: false, error: `report too large (${(raw.length / 1024 / 1024).toFixed(1)} MB > 5 MB)` };
  }
  let data: unknown;
  try { data = JSON.parse(raw); } catch (e) { return { ok: false, error: `not valid JSON: ${String(e)}` }; }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "report is not an object" };
  }
  const o = data as Record<string, unknown>;
  if (!Array.isArray(o.beliefs)) return { ok: false, error: "report has no beliefs array" };
  const beliefs: BeliefEntry[] = arr(o.beliefs).flatMap((b) => {
    if (b === null || typeof b !== "object") return [];
    const e = b as Record<string, unknown>;
    return [{
      beliefId: str(e.beliefId), content: str(e.content),
      total: num(e.total), verified: num(e.verified),
      failures: arr(e.failures).flatMap((f) => {
        if (f === null || typeof f !== "object") return [];
        const x = f as Record<string, unknown>;
        return [{ refId: str(x.refId), reason: str(x.reason), sourceRef: optStr(x.sourceRef) ?? null, title: optStr(x.title) ?? null }];
      }),
      relocations: arr(e.relocations).flatMap((r) => {
        if (r === null || typeof r !== "object") return [];
        const x = r as Record<string, unknown>;
        return [{ refId: str(x.refId), from: str(x.from), to: optStr(x.to) ?? null, title: optStr(x.title) ?? null }];
      }),
    }];
  });
  const goneFiles = arr(o.goneFiles).flatMap((g) => {
    if (g === null || typeof g !== "object") return [];
    const x = g as Record<string, unknown>;
    return [{ file: str(x.file), passages: num(x.passages) }];
  });
  return {
    ok: true,
    report: {
      generatedAt: optStr(o.generatedAt), database: optStr(o.database),
      checked: typeof o.checked === "number" ? o.checked : undefined,
      broken: typeof o.broken === "number" ? o.broken : undefined,
      degraded: typeof o.degraded === "number" ? o.degraded : undefined,
      relocatedPins: typeof o.relocatedPins === "number" ? o.relocatedPins : undefined,
      goneFiles, beliefs,
    },
  };
}
