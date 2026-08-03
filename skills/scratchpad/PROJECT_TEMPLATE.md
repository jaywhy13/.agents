# <Readable project name>

- **Started**: YYYY-MM-DD
- **Status**: active
- **Project slug**: <project-slug>
- **Project title**: 🗂️ <project-slug>
- **Workctl project**: <project-slug>
- **Scratchpad path**: /Users/jeanmark.wright/Documents/JMxShopify/Projects/<project-slug>
- **Repository**: none

## Overview

<1–3 sentence summary of what this project lets you accomplish and why it exists.>

## Links

<Project-level issues, documents, dashboards, repositories, or other source material.>

## Active Tasks

<Current tasks whose `plan.md` status is active, such as `in progress`, `in review`, `blocked`, or `paused`. Keep this list in sync when task statuses change.>

## Upcoming Tasks

<Planned tasks whose `plan.md` status is `upcoming`.>

## Completed Tasks

<Finished tasks whose `plan.md` status is `done` or `completed`.>

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

The top metadata block is the source of truth for `/scratchpad`,
`/scratchpad-sync`, and workctl sync.

- `**Status**:` — Project lifecycle: `active`, `upcoming`, or `completed`. Status lives here, not in a folder name.
- `**Project slug**:` — ASCII folder slug.
- `**Project title**:` — Human display title with emoji.
- `**Workctl project**:` — Workctl project ID, usually the same as `Project slug`.
- `**Scratchpad path**:` — Absolute path to this Project folder.
- `**Repository**:` — Either `none` or the short name accepted by `dev cd`.

Workctl setup:

```sh
workctl project show <project-slug> >/dev/null 2>&1 || \
  workctl project add <project-slug> \
    --title "<Project title>" \
    --directory "/Users/jeanmark.wright/Documents/JMxShopify/Projects/<project-slug>"
```

If this project has a default repository, include `--repository <repo>`.

Historical note: older Project records may include Cmux fields. They are legacy
compatibility data and are not the primary scratchpad workspace model anymore.
