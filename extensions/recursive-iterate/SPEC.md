# Recursive Iterate Extension Spec

## Goal

Build a global Pi extension plus thin skill that runs recursive tree-of-thought style implementation/design exploration across git worktrees. It is optimized for cheap parallel DeepSeek v4 Flash usage and long-running background exploration.

The extension should let a user say roughly: “implement this UI” and produce a branching tree of independent variants, periodically score/prune them, and finish with a ranked comparison report. It must not automatically merge/apply a winner.

## Install Targets

- Extension: `~/.pi/agent/extensions/recursive-iterate/`
- Thin skill: `~/.pi/agent/skills/recursive-iterate/`

## Commands

Primary command names:

- `/recursive-iterate <prompt>`
- `/ri <prompt>` alias

Support status/resume/cleanup commands:

- `/ri-status [run]`
- `/ri-resume <run>`
- `/ri-cleanup <run>` explicit cleanup only

## Default Configuration

Default preset: `3/6/3/4`

- branching factor: `3`
- max depth: `6`
- prune every: `3` layers
- keep after prune: `4` branches
- reviewers per pruning checkpoint: `3`
- generation model default: DeepSeek v4 Flash
- review model default: DeepSeek v4 Flash
- judge model default: DeepSeek v4 Flash

Allow command/config overrides for models, branching, depth, prune cadence, keep count, reviewer count, timeouts, and dependency-install policy.

## Repo Requirements

v1 is git-only.

Startup must fail early unless:

- current directory is inside a git repository
- working tree is clean

Worktrees/branches should be created from the current clean HEAD.

## Worktree Model

Every node/variant gets its own git branch/worktree.

Suggested branch naming:

- `ri/<run-id>/<node-id>`

Worktrees and branches are persistent by default for later inspection. Cleanup happens only via explicit command.

Children should inherit parent code state by branching/copying from the parent node’s resulting commit/worktree state, not start from the original HEAD.

Prompt/context should stay compact: descendants receive lineage artifacts and branch metadata, not full ancestor conversations.

## Child Variant Contract

Each generation child is blind to siblings. Do not coordinate sibling angles, share sibling lists, or assign explicit strategy slots from the orchestrator.

Prompt should encourage independent meaningful divergence, but each child decides its own approach.

Each child must write/update required artifacts in its worktree:

- `IDEA.md` — chosen approach/design idea and how it differs conceptually
- `DESIGN_DECISIONS.md` — concrete design/implementation decisions and rationale
- `CHANGELOG.md` — what changed in this branch

Children must not write TODOs, next steps, speculative roadmaps, or “future work” sections. Artifacts are for descendants/reviewers, not planning drift.

Dependency installs/package-manager changes are denied by default. Provide explicit opt-in flag such as `--allow-installs`.

Failed children remain recorded in the tree and are marked failed/low-score, not immediately discarded.

## Pruning / Review Model

At depths `3, 6, 9, ...`, run a pruning checkpoint:

1. collect surviving branch artifacts and diffs/results
2. launch `3` parallel reviewers by default
3. reviewers inspect artifacts + final diff/result, not hidden child transcripts
4. reviewers may choose validation commands/tests themselves per branch
5. extension enforces timeout/resource limits and captures command/output evidence
6. judge aggregator synthesizes reviewer outputs and keeps top `4` branches by default

Intermediate layers expand all current surviving branches.

Review criteria should include:

- goal satisfaction
- implementation quality
- distinctness/creative value
- usability/design quality for UI tasks
- maintainability/simplicity
- validation/build confidence
- risks/failures

A failed branch can survive only if reviewers/judge explicitly justify its idea value; otherwise it scores low.

## Final Output

The extension ends with a report only. It must not merge, copy, or apply a winning branch to the main working tree.

Final report should include:

- ranked branches
- branch/worktree paths
- node lineage
- artifact summaries
- score breakdowns
- reviewer rationale
- validation evidence
- diff stats
- failure notes
- inspection commands

Default artifact location:

- `.pi/recursive-iterate/runs/<run-id>/`

Store run metadata, tree state, reviewer outputs, judge decisions, reports, process logs, and worktree paths there.

## Background / Resume

Runs are long-running and should execute asynchronously/background by default.

State must be persisted enough to support resume from checkpoints/interruption:

- run config
- node tree
- node status
- worktree/branch paths
- parent-child links
- artifacts collected
- reviewer outputs
- prune decisions
- current generation/checkpoint

`/ri-status` should summarize active/completed/failed nodes and current checkpoint.

`/ri-resume` should continue from saved metadata without redoing completed nodes unless necessary.

## Architecture Direction

Implement as a Pi extension, not a skill-only workflow.

Reason: skills are instruction packages; extensions can register commands/tools, spawn child `pi` processes, manage background orchestration, persist state, and control worktree cwd/model settings.

The extension should orchestrate by launching separate `pi` child processes per agent/worktree, not by asking current-session LLM to recursively call subagents.

Thin skill should document usage, command interpretation, and when to use recursive iteration. Prompt templates and orchestration prompts should live in extension source for stability.

## Safety / Non-goals

- No auto-merge/apply winner in v1.
- No dirty working tree support in v1.
- No non-git folder-copy fallback in v1.
- No sibling coordination by default.
- No dependency installs by default.
- No child next-step/TODO artifacts.
- No reliance on full child transcripts for scoring.
