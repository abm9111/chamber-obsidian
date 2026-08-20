// Regenerates tests/fixtures/*.json from REAL chamber output. Maintainer
// action, never CI: needs Node >=23.6 (type stripping) and a chamber
// checkout. The parser must be tested against what verify actually emits,
// not against JSON written from memory of it.
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SRC = resolve(process.env.CHAMBER_SRC ?? "../chamber");
const load = (p) => import(pathToFileURL(join(SRC, "src", p)).href);
const { openChamberDb } = await load("db.ts");
const { ingestDirectory } = await load("ingest.ts");
const { commitBelief } = await load("commit_belief.ts");
const { buildVerifyReport } = await load("pins.ts");

const work = mkdtempSync(join(tmpdir(), "chamber-fixture-"));
try {
  const notes = join(work, "notes");
  mkdirSync(notes);
  const sec = (i) => `## Section ${i}\n\nBody of section ${i}, distinctive text ${i}.\n`;
  writeFileSync(join(notes, "policy.md"), `# Policy\n\n${[0, 1, 2, 3, 4].map(sec).join("\n")}`);
  writeFileSync(join(notes, "gone.md"), `# Gone\n\n${sec(9)}`);
  const db = openChamberDb(join(work, "db.sqlite"));
  ingestDirectory(db, notes);

  const pin = (ref) => {
    const r = db.prepare(`SELECT id, snapshot_hash FROM vector_document WHERE source_ref = ?`).get(ref);
    if (!r) throw new Error(`fixture setup: no passage at ${ref}`);
    return { kind: "vault_page", refId: r.id, snapshotHash: r.snapshot_hash };
  };
  for (const [text, ref] of [
    ["policy section 1 is settled", "policy.md#p1"],   // will hash_mismatch (edited in place)
    ["policy section 4 is settled", "policy.md#p4"],   // will relocate (note shrinks, text survives)
    ["the gone note said things", "gone.md#p0"],       // its FILE will be deleted -> goneFiles
    ["section 3 stays put", "policy.md#p3"],           // stays intact -> healthy belief entry
  ]) {
    const res = commitBelief(db, {
      type: "inference", text, sources: [pin(ref)],
      authorFamily: "fixture", path: "fast", requireVerifiedSupport: true,
    });
    if (!res.ok) throw new Error(`fixture setup: commit refused: ${JSON.stringify(res)}`);
  }

  writeFileSync("tests/fixtures/report-clean.json", JSON.stringify(buildVerifyReport(db, {}), null, 2) + "\n");

  // Drift: edit p1 in place; delete section 0 so the tail shifts (p4 text
  // survives one slot lower); delete gone.md from disk entirely.
  writeFileSync(join(notes, "policy.md"),
    `# Policy\n\n${[1, 2, 3, 4].map(sec).join("\n")}`.replace("distinctive text 1", "EDITED text 1"));
  rmSync(join(notes, "gone.md"));
  ingestDirectory(db, notes);

  const drift = buildVerifyReport(db, {});
  writeFileSync("tests/fixtures/report-drift.json", JSON.stringify(drift, null, 2) + "\n");
  const legacy = JSON.parse(JSON.stringify(drift));
  delete legacy.generatedAt;
  writeFileSync("tests/fixtures/report-legacy.json", JSON.stringify(legacy, null, 2) + "\n");

  const kinds = new Set(drift.beliefs.flatMap((b) => b.failures.map((f) => f.reason)));
  const ok =
    kinds.has("hash_mismatch") &&
    drift.beliefs.some((b) => b.relocations.length > 0) &&
    (drift.goneFiles?.length ?? 0) > 0 &&
    typeof drift.generatedAt === "string";
  if (!ok) throw new Error(`fixtures missing a required scenario: reasons=${[...kinds]} reloc=${drift.beliefs.some((b) => b.relocations.length > 0)} gone=${drift.goneFiles?.length}`);
  console.log("fixtures regenerated: clean, drift, legacy");
} finally {
  rmSync(work, { recursive: true, force: true });
}
