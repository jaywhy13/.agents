# <Readable task name>

- **Started**: YYYY-MM-DD
- **Status**: in progress
- **Project**: <project-slug>
- **Task title**: 🧩 <task-slug>
- **Workctl task**: <project-slug>/<task-slug>
- **Repository**: none
- **Worktree**: none
- **Scratchpad path**: /Users/jeanmark.wright/Documents/JMxShopify/Projects/<project-slug>/tasks/<task-slug>
- **Zellij session**: <project-slug>/<task-slug>
  - **Tabs**: plan, code, pi, terminal

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

When the scratchpad dispatches an Agent todo, annotate it inline with the Zellij
tab and current status, e.g.:

- `[ ] Refactor foo — tab: subagent-foo, status: running`
- `[x] Refactor foo — tab: subagent-foo, status: done`
- `[ ] Refactor foo — tab: subagent-foo, status: blocked (auth)`

For substantial Agent todos, create a workctl Todo with `workctl todo add`.
Todo repository, directory, and worktree fields should be omitted unless the Todo
intentionally overrides the parent Task.

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

The top metadata block is the source of truth for `/scratchpad`,
`/scratchpad-sync`, workctl sync, and Zellij resume. Keep these lines parseable:

- `**Status**:` — Task status: `upcoming`, `in progress`, `blocked`, `paused`, `in review`, `done`, or `completed`. Status lives here, not in a folder name.
- `**Project**:` — Project slug from the filesystem, not the emoji display title.
- `**Task title**:` — Display title with emoji for the task.
- `**Workctl task**:` — Fully qualified workctl task ID: `<project_id>/<task_id>`.
- `**Repository**:` — Either `none` or the short name accepted by `dev cd`.
- `**Worktree**:` — Either `none` or an absolute path to a task-scoped git worktree.
- `**Scratchpad path**:` — Absolute path to this task scratchpad folder.
- `**Zellij session**:` — Task-level Zellij session name, usually the same as `Workctl task`.
- `**Tabs**:` — Comma-separated durable working-surface tab titles. New tasks default to `plan`, `code`, `pi`, `terminal`; `workctl zellij sync` creates additional tabs from active workctl Todos.
- Agent todo annotation: `— tab: <tab>, status: <state>` after the item text. States: `queued`, `running`, `done`, `blocked (<reason>)`.

Workctl setup:

```sh
workctl task show <project-slug>/<task-slug> >/dev/null 2>&1 || \
  workctl task add <project-slug>/<task-slug> \
    --title "<Task title>" \
    --summary "<one-line task summary>" \
    --status in_progress \
    --priority medium \
    --directory "/Users/jeanmark.wright/Documents/JMxShopify/Projects/<project-slug>/tasks/<task-slug>" \
    --open-with terminal
```

If this task has a worktree, include `--worktree <absolute worktree>`. If it has
a repository, include `--repository <repo>`. For nested work, use
`workctl todo add <project-slug>/<task-slug>/<todo-slug>` and include
`--parent <project-slug>/<task-slug>/<parent-todo-slug>` only for nested Todos.

Zellij resume:

```sh
workctl zellij attach <project-slug>/<task-slug>
workctl task jump <project-slug>/<task-slug>
```

Worktree scratchpad link:

```sh
worktree_path="<absolute worktree>"
scratchpad_path="/Users/jeanmark.wright/Documents/JMxShopify/Projects/<project-slug>/tasks/<task-slug>"
link_path="$worktree_path/.scratchpad"

if [ -L "$link_path" ]; then
  current_target=$(readlink "$link_path")
  if [ "$current_target" != "$scratchpad_path" ]; then
    echo "STOP: $link_path points to $current_target, expected $scratchpad_path" >&2
    exit 1
  fi
elif [ -e "$link_path" ]; then
  echo "STOP: $link_path exists and is not a symlink" >&2
  exit 1
else
  ln -s "$scratchpad_path" "$link_path"
fi
```

Historical note: older Task records may include Cmux fields and emoji tab names.
They are legacy compatibility data and are not the primary scratchpad workspace
model anymore.
