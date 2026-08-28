# Security

Chamber Drift is a display-only Obsidian plugin. It reads one vault file
(the Chamber verify report), renders it, and copies wikilinks to the
clipboard when you ask. It does not write notes, does not write the
report, and does not make network requests.

## Report a vulnerability

Please use [GitHub Security Advisories](https://github.com/abm9111/chamber-obsidian/security/advisories/new)
on this repository. Do not open a public issue for an unreleased report.

Include the plugin version (`manifest.json`), Obsidian version, and the
shortest steps that show the problem.

## What this plugin does not do

- It never runs `chamber` or any other shell command.
- It never schedules jobs, and it never phones home.
- The report path is a user setting; reads go through Obsidian's vault
  adapter and stay inside the vault.
