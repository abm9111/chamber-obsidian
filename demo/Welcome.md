# Chamber Drift — two-minute try

This folder is a tiny vault with a canned drift report already in it. You do not need [Chamber](https://github.com/abm9111/chamber) installed to see the plugin.

**Open this `demo/` folder as the vault**, not the plugin repository root. The plugin looks for `_chamber/report.json` at the vault root.

The one problem: a conclusion is still in the vault after the thing it stood on moved. Sync, rename, delete, and two machines writing the same file are how that happens. Each click below is one of those causes. The panel is the same answer every time.

## Install the plugin

1. Settings → Community plugins → Browse → search **Chamber Drift** → Install → Enable.
2. Or [BRAT](https://github.com/TfTHacker/obsidian42-brat) → Add Beta Plugin → `abm9111/chamber-obsidian` if you want a GitHub build before the directory catches a new tag.

Listing: [community.obsidian.md/plugins/chamber-drift](https://community.obsidian.md/plugins/chamber-drift).

## What to click

1. Open [[Retention]]. The note now says 14 days; a conclusion still stands on 30. That is a source that changed under a claim — the research-notes question. Click **details**.
2. Open the drift panel from the ribbon (shield-alert) if it is not already open. Two broken conclusions (Retention + [[Onboarding]], a list that shrank), one moved passage (Refunds relocated, support intact), one gone file (`Archive.md` deleted on purpose). Rename, edit, and delete are the same panel.
3. Desktop status bar should read `Drift 2`. Click it.
4. Command palette: **Search drifted conclusions**, **Open next/previous drifted note**, **Copy drifted note wikilinks**.
5. Open this note again. No banner — a note with no lost support stays quiet.
6. Empty `_chamber/report.json` and save. Last-good keeps the panel up. That is torn / placeholder / two-machine transport — named, not repaired.

Then walk next/prev between [[Retention]] and [[Onboarding]].

## If the panel says the report is stale

This canned file is stamped `2026-08-28`. After 48 hours the plugin warns on purpose. Set `generatedAt` in `_chamber/report.json` to now (ISO 8601), or raise **Staleness warning** in settings. Leaving it is a valid test of that warning.

## This is not a live Chamber loop

Nothing here runs `chamber verify`. The JSON is fake so you can judge the UI. The real loop — pin beliefs, schedule `ingest` + `verify --json` into your own vault — is in the [plugin README](https://github.com/abm9111/chamber-obsidian#setup).

## Three questions if you are testing

1. Did the panel, banner, and status bar agree on the same two drifted notes?
2. Did next/prev walk [[Retention]] ↔ [[Onboarding]] without opening a third pane?
3. If you empty `_chamber/report.json` and save, does last-good keep the panel up instead of going blank?

Reply on [Discussions](https://github.com/abm9111/chamber-obsidian/discussions).
