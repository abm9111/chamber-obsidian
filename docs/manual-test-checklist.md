# Chamber Drift — manual test checklist

The 23 automated tests cover the pure logic in `src/core/` and the report
source's concurrency guarantees; everything below only exists once Obsidian
is rendering pixels, so it's checked by hand. Use a scratch vault, not one
you rely on. Run desktop first, then the mobile pass at the end.

Record pass/fail and any deviation from the expected text inline, next to
each item, so this file is the record — not a separate log.

1. **Fresh vault, plugin enabled, no report file.** Install and enable
   Chamber Drift in an empty vault before ever running `chamber verify`.
   Open the drift panel (ribbon icon or the "Open drift panel" command).
   Expect the "No report found" setup state: the configured report path,
   an explanation that Chamber writes it on a schedule outside Obsidian,
   and the cron one-liner shown verbatim.
   - On a phone/tablet: the same state should additionally show the
     Obsidian Sync nudge ("Sync all other types"). Confirm it appears on
     mobile and does **not** appear on desktop.

2. **Write the first report; panel should update with no reload.** With
   the panel still open, run the report one-liner for real against the
   scratch vault (`chamber verify --json > ".../.report.tmp" ; mv
   ".../.report.tmp" ".../report.json"`). Do not touch Obsidian.
   **This is the day-1 "do vault events fire for a `.json` create/rename"
   check the design spec flagged as unverified — record which of these
   actually happened, not just whether the panel eventually updated:**
   - [ ] Panel updated on its own within a few seconds of the `mv`
     (vault `create`/`modify`/`rename` events fired).
   - [ ] Panel did *not* update immediately, but did update within 5
     minutes (the safety poll caught it — events did not fire).
   - [ ] Neither happened within 5 minutes.
   - If the second box is checked (events silently don't fire on this
     platform), file an issue to make the 5-minute poll the documented
     default rather than an undocumented fallback — right now the UI's
     framing (and this checklist item) assumes live updates are the norm.

3. **Atomic rewrite while the panel is open.** With the panel open and
   showing a loaded report, run the one-liner again several times in a
   row (same or changed content each time). Expect no flicker to an
   error or missing-report state at any point, no half-parsed content, no
   console errors — the temp-file-then-`mv` swap should never be visible
   as an intermediate state.

4. **Drifted note shows a banner; healthy note shows none.** Open a note
   that has at least one `hash_mismatch` or relocated pin in the current
   report. Expect the quiet banner at the top of the note's content. Open
   an unrelated healthy note (no citations in the report, or every pin on
   it verified). Expect no banner at all — not even a "this note is
   clean" indicator.

5. **Banner click opens the filtered panel.** From a bannered note, click
   through ("details"). Expect the drift panel to open (or come into
   focus, if already open) filtered to that note's path, showing only its
   drifted/moved entries, with a visible "Filtered: `<path>` (show all)"
   control.

6. **Split-pane: banner follows focus.** Open two panes side by side,
   each showing a note with drifted or moved pins (the same note twice,
   or two different drifted notes). Click between panes to move focus.
   Expect the banner to render only in the currently-focused pane's note
   view, and to be gone from the pane you just moved focus *away* from —
   no stale banner left behind on the unfocused pane.

7. **Mode toggle: banner survives.** On a single bannered note, switch
   between Edit, Reading, and Live Preview without touching any other
   note or pane. Expect the banner to still be present after each switch.
   Known risk, stated plainly: a pure mode switch fires neither
   `active-leaf-change` nor `file-open`, and those are the only two events
   the banner re-renders on — if the banner vanishes on a mode switch,
   file an issue to also re-render on Obsidian's layout-change event
   rather than only those two.

8. **Unresolved refs are labeled, not guessed.** Using a report whose
   `beliefs[].failures[].sourceRef` points at a path outside the vault (or
   one ambiguous across two same-named files in different folders),
   confirm the panel renders that chip as plain, non-clickable text ending
   in "(outside this vault)" — never silently linked to the wrong file.

9. **Staleness warning.** In Settings, set "Staleness warning (hours)" to
   something low (e.g. `0`) while a real report is already loaded. Expect
   the staleness banner to appear in the panel immediately, no reopen
   needed, with the "is the scheduled verify running?" wording. Reset the
   threshold back up and confirm the warning disappears immediately too.

10. **Toggles live-update the UI.** With the panel open and a bannered
    note visible: flip "Show note banner" off — confirm any visible
    banner disappears immediately — then back on. Flip "Show relocations"
    off — confirm the collapsed moved-passages section disappears from
    the panel immediately, then back on. Change "Report path" to a
    nonexistent path — confirm the panel switches to the setup state for
    the new path; change it back and confirm it recovers.

11. **Plugin disable cleans up.** With a banner showing and the panel
    open, disable Chamber Drift from Community plugins. Expect the banner
    to be removed from the note immediately, and no leftover DOM or
    console errors from either the panel or the banner after disable.

12. **Mobile pass.** On one real mobile platform (iOS or Android), repeat
    items 1, 2, 4, and 5 — setup state, report picked up, banner on a
    drifted note, banner-to-panel navigation. If using Obsidian Sync,
    confirm "Sync all other types" is enabled first (see the README's
    Mobile section), and note here which sync mechanism carried the
    report (Obsidian Sync / iCloud / Syncthing / other).
