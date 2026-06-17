# <Readable project name>

- **Started**: YYYY-MM-DD
- **Status**: active
- **Project slug**: <project-slug>
- **Project title**: 🗂️ <project-slug>
- **Cmux group**: 🗂️ <project-slug>
- **Project workspace**: 🧭 project
  - **Tabs**: 📝 neovim, 🤖 pi

## Overview

<1–3 sentence summary of what this project lets you accomplish and why it exists.>

## Links

<Project-level issues, documents, dashboards, repositories, or other source material.>

## Active Tasks

<Current tasks in `tasks/active/`. Keep this list in sync when tasks move.>

## Upcoming Tasks

<Planned tasks in `tasks/upcoming/`.>

## Completed Tasks

<Finished tasks in `tasks/completed/`.>

## Decisions

<Running project-level log. Bullet per decision, newest at the bottom.
Format: `YYYY-MM-DD — <decision>. Rationale: <why>.`>

## Open Questions

<Project-level unresolved questions.>

## Context Snapshot

<Rolling, self-contained project summary so a fresh session can resume without
re-reading every task plan. Keep it current: where the project stands, what is
active, what is blocked, and the next project-level move.>

---

## Metadata format reference

The top metadata block is the source of truth for `/scratchpad` and
`/scratchpad-sync`.

- `**Status**:` — Project folder lifecycle: `active`, `upcoming`, or `completed`.
- `**Project slug**:` — ASCII folder slug.
- `**Project title**:` — Human display title with emoji.
- `**Cmux group**:` — Cmux Group display title, usually the same as Project title.
- `**Project workspace**:` — Project-level workspace title inside the Cmux Group.
- `**Tabs**:` — Project workspace tabs. Defaults: `📝 neovim`, `🤖 pi`.

Default project workspace behavior:

- `📝 neovim`: cwd = Project folder; command = `nvim project.md`.
- `🤖 pi`: cwd = Project folder; command = `pi`.
