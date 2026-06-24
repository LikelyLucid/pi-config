---
description: Scan codebase for common typos in comments and strings
argument-hint: "[path]"
---
Scan ${1:-.} for common typos in comments, docstrings, and user-facing strings.

Common patterns to flag:
- `recieve` → receive, `acheive` → achieve, `occured` → occurred
- `seperate` → separate, `definately` → definitely
- `teh` → the, `helo` → hello
- `dont` → don't, `wont` → won't, `doesnt` → doesn't
- `cant` → can't, `isnt` → isn't, `couldnt` → couldn't
- `shouldnt` → shouldn't, `wouldnt` → wouldn't

Show file:line and context. Ignore generated files and vendored code.

Run: `grep -rn -i "\b\(recieve\|acheive\|occured\|seperate\|definately\|teh\|dont\|wont\|doesnt\|cant\|isnt\|couldnt\|shouldnt\|wouldnt\)\b" ${1:-.} --include="*.{ts,js,tsx,jsx,nix,rs,go,py,md}" 2>/dev/null`
