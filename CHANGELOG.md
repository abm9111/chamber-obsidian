# Changelog

## 1.2.0 — 2026-08-28

Last-good device truth and a review queue. Display-only still: one vault file, no Chamber run, no note writes.

### Added

- Desktop status bar: `Drift 3`, `Drift stale`, `Drift gone`, or `Drift conflict`. Silent on a clean, fresh report. Click opens the panel. Setting: **Show status bar**.
- Commands: **Search drifted conclusions**, **Open next/previous drifted note**, **Copy drifted note wikilinks** (clipboard only).
- Device-truth panel copy for empty (iCloud placeholder), torn mid-write, sync-conflict siblings, a report that goes backwards, and a newer report that arrived more than 30 minutes after it was generated.
- While disk is bad, the last clean load on this device stays in the panel, banner, status bar, search, and next/prev.
- `SECURITY.md` — GitHub Security Advisories.

### Changed

- Conflict copies and a deleted report wake the watcher immediately.
- Oversized reports are refused from `stat.size` before read (5 MB cap; parse still caps UTF-8 bytes).
- Settings for report path and staleness commit on blur/Enter.
- CI runs `npm audit --audit-level=high`.
- esbuild 0.28.2 (clears GHSA-67mh-4wv8-2f99; matches Vite's peer so `npm ci` stays in sync). Coverage measured in CI.

### Fixed

- Vault-root report path: `adapter.list("/")` results now compare as the same parent `conflictSiblings` uses.
