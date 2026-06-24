---
description: Scan codebase for TODOs, FIXMEs, HACKs sorted by age
argument-hint: "[path]"
---
Scan ${1:-.} for TODO, FIXME, HACK, XXX comments. Group them:
- **Old** (git blame > 6 months) — probably stale
- **Recent** (3-6 months) — maybe still relevant
- **Fresh** (< 3 months) — active

For each item show: file:line, text, author, age. Flag anything mentioning security, data loss, or production.

Run: `grep -rn "TODO\|FIXME\|HACK\|XXX" ${1:-.} --include="*.{ts,js,tsx,jsx,nix,rs,go,py,md}"`
