# <Readable task name>

- **Started**: YYYY-MM-DD
- **Status**: in progress
- **Repository**: none
- **Worktree**: none
- **Zellij session**: task-<slug>
  - **Panes**: plan

## Overview

<1–3 sentence summary of what we're trying to accomplish and why.>

## Links

<PRs, issues, related docs.>


## Task list

Split todos by who does them. The scratchpad skill scans `### Agent` on
startup and offers to dispatch the open items.

### Human

- [ ] First human-only item

### Agent

- [ ] First agent-doable item

When the scratchpad dispatches an Agent todo, annotate it inline with the tab
and current status, e.g.:

- `[ ] Refactor foo — tab: subagent-foo, status: running`
- `[x] Refactor foo — tab: subagent-foo, status: done`
- `[ ] Refactor foo — tab: subagent-foo, status: blocked (auth)`

## Decisions

<Running log. Bullet per decision, newest at the bottom.
Format: `YYYY-MM-DD — <decision>. Rationale: <why>.`>

## Open Questions

<Unresolved items that need answers before further progress.>

## Context Snapshot

<Rolling, self-contained summary so a fresh session can resume without re-reading
the whole conversation. Keep it current: where things stand, what was just
decided or discovered, and the immediate next step. Newest summary replaces or
appends to the prior one — do not let it go stale.>

## Files Touched

<Running list of paths the work has modified. One per line, with a one-line note when helpful.>

## Verification Commands

<Test, lint, typecheck commands relevant to this task.>

---

## Metadata format reference

The top metadata block is the source of truth for `/scratchpad` and
`/scratchpad-sync`. Keep these lines parseable:

- `### Human` / `### Agent` subheadings under `## Task list` — the scratchpad
  scans the `### Agent` list on every startup.
- Agent todo annotation: `— tab: <tab>, status: <state>` after the item text.
  States: `queued`, `running`, `done`, `blocked (<reason>)`.


Metadata bullets:

- `**Repository**:` — either `none` or the short name accepted by `dev cd`
  (e.g. `ads-data`, `ad-network-connectivity`). When set, every Zellij pane
  starts by running `dev cd <repo>` so the shell lands in the repo with the
  dev environment activated.
- `**Worktree**:` — either `none` or an absolute path to a git worktree
  directory (typically `<repo>/.worktrees/<branch>`). When set, both skills
  ensure the worktree exists on disk and create it if missing. Panes with a
  repo and a worktree run `dev cd <repo>` then `cd <worktree-relative-path>`.
- `**Zellij session**:` — single session name; defaults to `task-<slug>`.
- `**Panes**:` — comma-separated list of pane names. Each pane maps to a Zellij
  tab in the rebuilt session (one tab per pane, one pane per tab). Optional
  inline parens may add a short description, e.g. `plan (todos), pi (agent),
  code (editor)`.

Multi-session tasks are rare. If needed, repeat the `Zellij session` /
`Panes` bullets for each session.
