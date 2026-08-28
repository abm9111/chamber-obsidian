# Chamber Drift — manual test checklist

The automated tests cover the pure logic in `src/core/` and the report
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
   scratch vault (`chamber verify --json > ".../.report.tmp" ; [ -s
   ".../.report.tmp" ] && mv ".../.report.tmp" ".../report.json"`). Do
   not touch Obsidian.
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

9. **Staleness warning.** First, edit the scratch report's `generatedAt`
   to an ISO string 3 hours in the past, so a 1-hour threshold has a
   report old enough to actually trip it. In Settings, set "Staleness
   warning (hours)" to something low (e.g. `1`) while that report is
   loaded. Commit the field with Enter or by clicking away — values ≤ 0 are
   rejected and the field snaps back to the last saved number. Expect
   the staleness banner to appear in the panel immediately, no reopen
   needed, with the "is the scheduled verify running?" wording. Reset the
   threshold back up (same commit) and confirm the warning disappears immediately too.

10. **Toggles live-update the UI.** With the panel open and a bannered
    note visible: flip "Show note banner" off — confirm any visible
    banner disappears immediately — then back on. Flip "Show relocations"
    off — confirm the collapsed moved-passages section disappears from
    the panel immediately, then back on. Change "Report path" to a
    nonexistent path and commit the field (Enter or click away) — confirm
    the panel switches to the setup state for the new path; change it back
    and confirm it recovers.

11. **Plugin disable cleans up.** With a banner showing and the panel
    open, disable Chamber Drift from Community plugins. Expect the banner
    to be removed from the note immediately, and no leftover DOM or
    console errors from either the panel or the banner after disable.

12. **Mobile pass.** On one real mobile platform (iOS or Android), repeat
    items 1, 2, 4, and 5 — setup state, report picked up, banner on a
    drifted note, banner-to-panel navigation. If using Obsidian Sync,
    confirm "Sync all other types" is enabled first (see the README's
    Mobile section), and note here which sync mechanism carried the
    report (Obsidian Sync / iCloud / Syncthing / other). Then run
    "Search drifted conclusions" and "Open next drifted note" from the
    command palette — both must work without a status bar.

13. **Status bar (desktop).** With a drifted report loaded, expect
    `Drift N` in the status bar; click it to open the panel. Open a
    clean report (or wait until none of the counts apply) and expect
    the item to disappear. Flip "Show status bar" off and confirm it
    stays gone even with drift.

14. **Search and next/prev.** Command palette → "Search drifted
    conclusions": pick a hit, expect the note to open (cursor on the
    Chamber title when that text still exists) and the panel to filter
    to that note. "Open next drifted note" / "Open previous drifted
    note" should cycle the alarmed notes without yanking focus into
    the panel. "Copy drifted note wikilinks" copies `[[paths]]` and
    shows a count Notice.

15. **Empty report keeps the last good one.** With a loaded report,
    truncate the file to zero bytes (`: > "<vault>/_chamber/report.json"`).
    Expect the panel to switch to "Report file is empty on this device"
    with the iCloud/transport explanation — and, below it, "Last report
    that loaded cleanly on this device:" with the previous content still
    rendered. The note banner and desktop status bar keep showing the
    last-good drift (they do not go blank for the empty-file window).
    Restore the report; expect normal recovery with no reload.

16. **Torn file is named, not blamed on Chamber.** Write half a report
    (`head -c 200 report.json > .t && mv .t report.json`). Expect the
    "Report looks torn mid-write" state (not "not valid JSON"), plus the
    last-good block. Restore and confirm recovery.

17. **Conflict copy warning.** Create a sibling
    `report.sync-conflict-20260828-101010-ABCDEF.json` next to the
    report. Expect a warning strip naming the copy in the panel and
    "Drift conflict" in the status bar once no real drift is present.
    Delete the copy; expect both to clear on the create/delete event
    (not only the 5-minute poll). Deleting the report file itself should
    switch to the missing state with last-good still rendered, same
    live-update rule.

18. **Backwards report.** With the panel open, overwrite the report
    with an older copy (earlier `generatedAt`). Expect the "older than
    the one loaded before it" warning. Overwrite with a newer report;
    expect the warning to clear — and, if the newer report's
    `generatedAt` is >30 min in the past, the "became visible here …
    after it was generated" transport line.
