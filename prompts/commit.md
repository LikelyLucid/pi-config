---
description: Write a conventional commit message from staged changes
argument-hint: "[additional context]"
---
Run `git diff --cached` and generate a conventional commit message. Format:

<type>(<scope>): <short summary>

<body>

<footer>

Use types: feat, fix, chore, docs, refactor, test, style, perf, ci.
Keep the summary under 72 chars. Include a body with motivation and key changes when non-trivial. Include footers for breaking changes and closed issues.

Staged diff:
```
$(git diff --cached)
```

Additional context: $@
