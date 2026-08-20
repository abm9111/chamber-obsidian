# Chamber Drift

Shows which of your conclusions lost support when the notes under them changed.

Chamber Drift is the Obsidian-side half of [Chamber](https://github.com/abm9111/chamber). Chamber's `verify` command hashes the passages a belief is pinned to and reports when one no longer says what it said at pin time; this plugin renders that report inside your vault. It does not run any check itself — see [What it will not do](#what-it-will-not-do).

## What it shows

Chamber Drift reads one file — the JSON report your own scheduled `chamber verify --json` writes into the vault (see [Setup](#setup)) — and renders it in two places. Nothing here calls Chamber, reaches the network, or writes to your vault; it only parses and displays a report that already exists on disk.

**The drift panel.** Open it from the ribbon icon (a shield-alert icon, tooltip "Chamber Drift") or the command "Open drift panel". The header shows when the report was checked, how many conclusions it covers, and counts of broken, degraded, and moved pins, plus a staleness warning once the report is older than your configured threshold. Each drifted conclusion appears as an excerpt of the belief with one chip per broken pin — `hash_mismatch: <ref> — now holds: <title>` when the cited passage has been edited or shifted underneath it, `not_found: minted against <ref> — whatever is there now is not what was cited` when the exact text a code citation pinned to no longer exists anywhere in the file. Relocated passages (moved, not broken — support is intact) and files gone from disk are shown as their own collapsed info sections rather than alarms, mirroring Chamber's own alarm/info split. A ref the plugin can't map onto a file in this vault is labeled "(outside this vault)" instead of guessed at.

**The note banner.** A quiet strip that appears only on notes with drifted or moved pins standing on them. Healthy notes get nothing — a healthy belief's report entry carries no refs to point a banner at, so a reassuring banner on a clean note would be UI for data that doesn't exist. Click the banner to jump into the panel, filtered to that note.

## Setup

Chamber Drift never runs `chamber` itself. You schedule `chamber verify --json` outside Obsidian, writing its output atomically into the vault; the plugin only watches the file that lands there:

```
chamber verify --json > "<vault>/_chamber/.report.tmp" ; [ -s "<vault>/_chamber/.report.tmp" ] && mv "<vault>/_chamber/.report.tmp" "<vault>/_chamber/report.json"
```

The `[ -s … ]` guard moves the temp file only when it's non-empty — so a run that silently produces nothing (wrong `PATH` under launchd, `chamber` missing) never clobbers the last good report — and it isn't `&&` because `verify` exits 1 exactly when it finds drift, which `&&` would treat as failure and discard the one report you actually need to see.

The temp file sits next to its destination rather than in `/tmp` — `mv` is only atomic within a single filesystem, and `/tmp` is routinely a different one, which turns `mv` into copy-then-unlink and reintroduces exactly the half-written read this line exists to prevent. Replace `<vault>` with your vault's real filesystem path; neither launchd nor cron expand it for you.

Default report path is `_chamber/report.json`, configurable in settings. The leading underscore, not a dot, is deliberate: Obsidian's vault index ignores dot-folders, so a dot-prefixed path gets no file-change events at all and falls back to a 30-second poll instead of updating live.

**launchd** (macOS), every 15 minutes — save as `~/Library/LaunchAgents/com.chamber.verify.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.chamber.verify</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <!-- && is XML-escaped below: a raw & inside a plist <string> is invalid
         XML and launchd refuses the whole file. The escaped form round-trips
         to the exact one-liner above. -->
    <string>chamber verify --json > "/Users/you/Vault/_chamber/.report.tmp" ; [ -s "/Users/you/Vault/_chamber/.report.tmp" ] &amp;&amp; mv "/Users/you/Vault/_chamber/.report.tmp" "/Users/you/Vault/_chamber/report.json"</string>
  </array>
  <key>StartInterval</key><integer>900</integer>
</dict>
</plist>
```

Load it with `launchctl load ~/Library/LaunchAgents/com.chamber.verify.plist`.

**cron**, every 15 minutes:

```cron
*/15 * * * * chamber verify --json > "/Users/you/Vault/_chamber/.report.tmp" ; [ -s "/Users/you/Vault/_chamber/.report.tmp" ] && mv "/Users/you/Vault/_chamber/.report.tmp" "/Users/you/Vault/_chamber/report.json"
```

Either way, `chamber ingest`/`chamber index-code` need to have run and beliefs need to be pinned (`chamber believe`) before there's anything for `verify` to check against. See Chamber's [`docs/CI_DRIFT_GATE.md`](https://github.com/abm9111/chamber/blob/main/docs/CI_DRIFT_GATE.md) for the full loop, including wiring the identical check into CI.

## Mobile

The transport is a file in the vault, so mobile works wherever that file syncs — that's the whole story, and it's why this plugin declares `isDesktopOnly: false` even though Chamber itself cannot run on a phone. iCloud and Syncthing sync everything by default; nothing extra is needed there.

**Obsidian Sync users need one toggle.** First-party Obsidian Sync ships with "Sync all other types" turned **off**, and `report.json` rides on that toggle exactly like any other non-Markdown file — without it, the report silently never reaches your phone. Enable it at **Settings → Sync → Sync all other types**. If the panel shows "No report found" on mobile after it works on desktop, this is the first thing to check; the panel's setup state says so directly when it detects it's running on mobile.

## Install

**Community plugins (once listed):** Settings → Community plugins → Browse → search "Chamber Drift" → Install → Enable. Chamber Drift is not yet in the official registry — a submission is planned; check this repo for current status.

**BRAT (available now):** install [BRAT](https://github.com/TfTHacker/obsidian42-brat), then "Add Beta Plugin" → `abm9111/chamber-obsidian` → Add Plugin → enable Chamber Drift under Community plugins.

## Settings

| Setting | Default | What it does |
|---|---|---|
| Report path | `_chamber/report.json` | Vault-relative path your scheduled job writes to. |
| Staleness warning (hours) | `48` | Panel shows a warning once the report is older than this. |
| Show note banner | on | Turns the per-note banner on or off entirely. |
| Show relocations | on | Turns the collapsed "moved passages" section of the panel on or off. |

## What it will not do

Chamber checks; this shows. Chamber Drift never runs `chamber verify`, never schedules anything, and never writes to your vault or your notes — there is no code path in this plugin that modifies a note or the report file. Everything it displays comes from parsing JSON your own scheduled job already wrote.

A few limits worth knowing before you rely on it:

- The note banner decorates only the **active** view. Open the same drifted note in a split pane and the banner follows focus rather than showing on both panes at once.
- Staleness normally reads `generatedAt` from inside the report. For reports written by Chamber versions that predate that field, it falls back to the report file's modified time and labels the age "(approx — from file time)" — a synced file's mtime reflects the sync engine, not when `verify` actually ran, so treat that label as a hint rather than a measurement.
- No passage- or line-level decoration in the editor, no "verify now" button, no reading of Chamber's SQLite database. The report file is the only contract this plugin has with Chamber.

See Chamber's [`docs/KNOWN_LIMITATIONS.md`](https://github.com/abm9111/chamber/blob/main/docs/KNOWN_LIMITATIONS.md) for what Chamber itself does and doesn't guarantee — everything this plugin shows is downstream of those guarantees. Chamber is MIT-licensed, as is this plugin: [github.com/abm9111/chamber](https://github.com/abm9111/chamber).

## Screenshots

<!-- screenshots added manually before registry PR -->

1. **Panel with drift** — the sidebar panel showing a broken pin and the collapsed relocations/gone-files sections.
2. **Banner on a note** — the quiet banner on a note whose cited passage moved or broke.

## License

MIT — see [LICENSE](LICENSE).
