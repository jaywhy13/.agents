# <Readable task name>

- **Started**: YYYY-MM-DD
- **Status**: in progress
- **Project**: <project-slug>
- **Task title**: 🧩 <task-slug>
- **Repository**: none
- **Worktree**: none
- **Cmux workspace**: 🧩 <task-slug>
  - **Tabs**: 📝 neovim, 🤖 pi, 🐚 terminal

## Overview

<1–3 sentence summary of what this task should accomplish and why it matters to the project.>

## Links

<PRs, issues, docs, dashboards, conversations, or source material.>

## Task list

Split todos by who does them. The scratchpad skill scans `### Agent` on startup
and offers to dispatch open Agent items.

### Human

- [ ] First human-only item

### Agent

- [ ] First agent-doable item

When the scratchpad dispatches an Agent todo, annotate it inline with the tab
and current status, e.g.:

- `[ ] Refactor foo — tab: 🕵️ subagent-foo, status: running`
- `[x] Refactor foo — tab: 🕵️ subagent-foo, status: done`
- `[ ] Refactor foo — tab: 🕵️ subagent-foo, status: blocked (auth)`

## Decisions

<Running log. Bullet per decision, newest at the bottom.
Format: `YYYY-MM-DD — <decision>. Rationale: <why>.`>

## Open Questions

<Unresolved items that need answers before further progress.>

## Context Snapshot

<Rolling, self-contained summary so a fresh session can resume without re-reading
the whole conversation. Keep it current: where things stand, what was just
decided or discovered, and the immediate next step.>

## Files Touched

<Running list of paths the work has modified. One per line, with a one-line note when helpful.>

## Verification Commands

<Test, lint, typecheck, query, or manual verification commands relevant to this task.>

---

## Metadata format reference

The top metadata block is the source of truth for `/scratchpad` and
`/scratchpad-sync`. Keep these lines parseable:

- `**Project**:` — Project slug from the filesystem, not the emoji display title.
- `**Task title**:` — Display title with emoji for the task.
- `**Repository**:` — Either `none` or the short name accepted by `dev cd`.
- `**Worktree**:` — Either `none` or an absolute path to a task-scoped git worktree.
- `**Cmux workspace**:` — Display title for the task's Cmux Workspace.
- `**Tabs**:` — Comma-separated Cmux tab titles. New tasks default to `📝 neovim`, `🤖 pi`, `🐚 terminal`.
- Agent todo annotation: `— tab: <tab>, status: <state>` after the item text.
  States: `queued`, `running`, `done`, `blocked (<reason>)`.

Default task workspace behavior:

- `📝 neovim`: cwd = Task folder; command = `nvim plan.md`.
- `🤖 pi`: cwd = Worktree when present, otherwise Task folder; command = `pi`.
- `🐚 terminal`: cwd = Worktree when present, otherwise Task folder; plain shell.
