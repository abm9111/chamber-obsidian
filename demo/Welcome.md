# Chamber Drift — two-minute try

This folder is a tiny vault with a canned drift report already in it. You do not need [Chamber](https://github.com/abm9111/chamber) installed to see the plugin.

**Open this `demo/` folder as the vault**, not the plugin repository root. The plugin looks for `_chamber/report.json` at the vault root.

## Install the plugin

Chamber Drift is not in the official community plugin list yet.

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat).
2. BRAT → Add Beta Plugin → `abm9111/chamber-obsidian` → Add Plugin.
3. Settings → Community plugins → enable **Chamber Drift**.

## What to click

1. Open [[Retention]]. Expect a banner: a conclusion still stands on “30 days”; the note now says 14. Click **details**.
2. Open the drift panel from the ribbon (shield-alert) if it is not already open. Expect two broken conclusions, one moved passage, and one gone file (`Archive.md` is missing on purpose).
3. Desktop status bar should read `Drift 2`. Click it.
4. Command palette: **Search drifted conclusions**, **Open next/previous drifted note**, **Copy drifted note wikilinks**.
5. Open this note again. No banner — healthy notes stay quiet.

Then open [[Onboarding]] (the other drifted note) and walk next/prev between the two.

## If the panel says the report is stale

This canned file is stamped `2026-08-28`. After 48 hours the plugin warns on purpose. Set `generatedAt` in `_chamber/report.json` to now (ISO 8601), or raise **Staleness warning** in settings. Leaving it is a valid test of that warning.

## This is not a live Chamber loop

Nothing here runs `chamber verify`. The JSON is fake so you can judge the UI. The real loop — pin beliefs, schedule `ingest` + `verify --json` into your own vault — is in the [plugin README](https://github.com/abm9111/chamber-obsidian#setup).

## Three questions if you are testing

1. Did the panel, banner, and status bar agree on the same two drifted notes?
2. Did next/prev walk [[Retention]] ↔ [[Onboarding]] without opening a third pane?
3. If you empty `_chamber/report.json` and save, does last-good keep the panel up instead of going blank?

Reply on [Discussions](https://github.com/abm9111/chamber-obsidian/discussions).
