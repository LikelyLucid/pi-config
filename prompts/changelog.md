---
description: Generate a changelog from git log between refs
argument-hint: "<from-ref> [to-ref]"
---
Generate a changelog from git log.

From: $1
To: ${2:-HEAD}

Group commits by type (feat, fix, chore, docs, refactor, test, style, perf, ci). Omit trivial commits (typo fixes, formatting-only, dependency bumps). Format as markdown bullet list.

```
git log --no-merges --format="%h %s (%an)" $1..${2:-HEAD}
```
