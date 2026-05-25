---
name: scratchpad
description: "Per-task plan.md scratchpad. Discover or create a task folder under the user's tasks directory, then keep a living plan.md updated as work progresses. Trigger: user says 'scratchpad', '/scratchpad', 'open the scratchpad', or starts a multi-step task that needs a written plan."
---

# scratchpad

Maintain a markdown plan for every multi-step task the user works on, in a single
canonical tasks directory. The plan is a living document: it captures the
overview, the task list, decisions, and what's been touched, and the agent
keeps it in sync as work progresses.

## Configuration

- **Tasks root**: `/Users/jeanmark.wright/Documents/JMxShopify/Tasks`
- **Discovery window**: last 7 days
- **Update cadence**: after each task item is checked off (or a new
  decision/open-question is recorded)

## Folder & file layout

```
<TASKS_ROOT>/
  YYYY-MM-DD-kebab-readable-name/
    plan.md
```

- One folder per task. Date prefix is the day the task was started
  (not the day each session resumes).
- Slug: lower-kebab-case, 3–6 words, captures the *what* not the *how*.
  Examples: `improving-job-deferral-mechanisms`,
  `tri-state-database-health-status`,
  `meeting-reminder-onboarding-flow`.

## Phase 1: Discovery (run on every invocation)

Before writing anything, find out what we're working on.

1. List immediate subdirectories of `<TASKS_ROOT>` whose name starts with
   a date in the last 7 days (inclusive of today). Sort newest first.
2. If today's date already has one or more folders, surface them at the
   top.
3. Present the candidate folders to the user with an `ask` tool call
   (single-select) including:
   - Each recent folder, labelled `YYYY-MM-DD — readable name`.
   - An explicit "Create a new task folder" option.
4. If the user picks an existing folder, read `plan.md` and confirm the
   summary back to them in one line before proceeding.
5. If the user picks "new", ask for a short readable name (or propose
   one based on conversation context), then create
   `<TASKS_ROOT>/<TODAY>-<slug>/plan.md` from the template below.

Skip the prompt only if the user has *already named the task* explicitly
in this turn (e.g. "open the scratchpad for the database health refactor"
matched by exact-or-fuzzy substring to a recent folder).

## plan.md template

Use this exact section ordering when creating a new plan.md:

```markdown
# <Readable task name>

Started: YYYY-MM-DD
Status: in progress

## Overview

<1–3 sentence summary of what we're trying to accomplish and why.>

## Task list

- [ ] First concrete item
- [ ] Second concrete item

## Decisions

<Running log. Bullet per decision, newest at the bottom.
Format: `YYYY-MM-DD — <decision>. Rationale: <why>.`>

## Open Questions

<Unresolved items that need answers before further progress.>

## Files Touched

<Running list of paths the work has modified. One per line, with a one-
line note when helpful.>

## Verification Commands

<Test, lint, typecheck commands relevant to this task.>

## Links

<PRs, issues, related docs.>
```

Sections may be empty but must always be present. The agent should not
delete sections; an empty section is a valid state.

## Phase 2: Live updates

Update plan.md whenever:

1. A task item is completed → flip `[ ]` to `[x]`.
2. A new task item is identified → append to the Task list.
3. A decision is made (the user resolves an ambiguity, picks one option,
   etc.) → append to Decisions.
4. A new open question surfaces → append to Open Questions.
5. A file is created/modified that wasn't already listed → append to
   Files Touched.
6. The status changes (blocked, in review, done) → update the Status
   line.

Use the `edit` tool with small targeted edits — never rewrite the whole
file. Preserve the user's manual edits.

## Execution rule

Before executing any implementation work from the task list, load and follow the
`tdd-implementation` skill (`~/.pi/agent/skills/tdd-implementation/SKILL.md`).
Do not write code or tests outside that loop.

## Hard rules

- Never auto-create a folder without explicit user confirmation of the
  slug and name (or an unambiguous discovery match).
- Never overwrite plan.md content; only append or check off items.
- Do not stage or commit task folders or plan.md unless the user
  explicitly asks.
- The plan is for the human, not the agent. Keep entries terse, factual,
  and dated. Avoid speculation.

## Stop conditions

- User explicitly says "stop tracking" / "close the scratchpad" → set
  Status to `paused` (or `done` if confirmed) and stop auto-updating.
- New unrelated task started → run Phase 1 discovery again before
  touching any plan.md.
