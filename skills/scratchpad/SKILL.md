---
name: scratchpad
description: "Project/task scratchpad organized around Cmux. Projects live under a Projects root and map to Cmux Groups; tasks live under projects and map to Cmux Workspaces. Maintains project.md and per-task plan.md, opens project/task workspaces with Neovim, pi, and terminal tabs, and tears down task workspaces safely on completion. Trigger: user says 'scratchpad', '/scratchpad', 'open the scratchpad', 'I'm done with this task', or starts a multi-step task that needs a written plan."
---

# scratchpad

Maintain markdown scratchpads for project-level context and task-level plans.
Projects are the top-level unit of organization. A Project maps to a Cmux Group.
A Task maps to a Cmux Workspace inside that Group.

The filesystem is the durable source of truth; Cmux runtime identifiers are not.
Keep the files trustworthy enough that `/scratchpad-sync` can rebuild useful
Cmux Groups, Workspaces, and tabs from disk.

## Model

- **Project**: a body of work, such as Ads Data Migration. It has one
  `project.md` and one Cmux Group title, for example `🚚 ads-data-migration`.
- **Task**: a concrete slice of work inside a Project. It has one `plan.md` and
  one Cmux Workspace title, for example `🧪 test-dbt-model-pipeline`.
- **Tab**: a Cmux Surface inside the Workspace's main Pane. Use these like the
  old Zellij tabs.

## Configuration

- **Projects root**: `/Users/jeanmark.wright/Documents/JMxShopify/Projects`
- **Active projects root**: `/Users/jeanmark.wright/Documents/JMxShopify/Projects/active`
- **Upcoming projects root**: `/Users/jeanmark.wright/Documents/JMxShopify/Projects/upcoming`
- **Completed projects root**: `/Users/jeanmark.wright/Documents/JMxShopify/Projects/completed`
- **Task plan template**: `PLAN_TEMPLATE.md` in this skill directory.

The old `/Users/jeanmark.wright/Documents/JMxShopify/Tasks` tree is not a normal
source of truth after migration. Do not create new work there and do not scan it
for active work.

## Folder layout

```
<PROJECTS_ROOT>/
  active/
    ads-data-migration/
      project.md
      tasks/
        active/
          2026-06-16-test-dbt-model-pipeline/
            plan.md
        upcoming/
        completed/
  upcoming/
    job-deferrer/
      project.md
      tasks/
        active/
        upcoming/
        completed/
  completed/
    finished-project/
      project.md
      tasks/
        completed/
          2026-05-14-finished-task/
            plan.md
```

Rules:

- Project and task folder names are ASCII lower-kebab-case slugs. Store emojis
  in metadata and Cmux titles, not folder names.
- Project folder status is coarse: `active`, `upcoming`, or `completed`.
- Task folder status is coarse: `active`, `upcoming`, or `completed`.
- Finer task states such as `in review`, `blocked`, or `paused` stay in
  `plan.md`; they do not require separate folders.
- Never overwrite or merge folders. If a destination exists, stop and ask.

## Project metadata

Every Project has `project.md` at the Project folder root. The top bullet block
is parseable metadata used by this skill and `/scratchpad-sync`:

```markdown
- **Started**: YYYY-MM-DD
- **Status**: active
- **Project slug**: ads-data-migration
- **Project title**: 🚚 ads-data-migration
- **Cmux group**: 🚚 ads-data-migration
- **Project workspace**: 🧭 project
  - **Tabs**: 📝 neovim, 🤖 pi
```

Rules:

- Keep the bullet labels in bold exactly as shown.
- `Status` values for Projects: `active`, `upcoming`, `completed`.
- Suggest a project emoji when creating a Project and store it in `Project title`
  and `Cmux group`.
- `Cmux group` is a display title, not a Cmux runtime identifier.
- Project workspace tabs:
  - `📝 neovim`: cwd = Project folder; command = `nvim project.md`.
  - `🤖 pi`: cwd = Project folder; command = `pi`.

## Task metadata

Every Task has `plan.md` in the Task folder. The top bullet block is parseable
metadata used by this skill and `/scratchpad-sync`:

```markdown
- **Started**: YYYY-MM-DD
- **Status**: in progress
- **Project**: ads-data-migration
- **Task title**: 🧪 test-dbt-model-pipeline
- **Repository**: ads-data   (or `none`)
- **Worktree**: /abs/path/to/repo/.worktrees/<branch-or-task>   (or `none`)
- **Cmux workspace**: 🧪 test-dbt-model-pipeline
  - **Tabs**: 📝 neovim, 🤖 pi, 🐚 terminal
```

Rules:

- Keep the bullet labels in bold exactly as shown.
- `Status` values: `in progress`, `blocked`, `paused`, `in review`, `done`,
  `completed`. Only `done`/`completed` move the task folder to
  `tasks/completed/`.
- `Project` is the Project slug, not the emoji title.
- `Task title` and `Cmux workspace` are display titles. Suggest task emojis and
  store them here.
- `Repository` is either `none` or the short name accepted by `dev cd`.
- `Worktree` is either `none` or an absolute path to a git worktree.
- Worktrees remain task-scoped. Project workspaces do not own worktrees.
- New tasks default to exactly these tabs: `📝 neovim`, `🤖 pi`, `🐚 terminal`.
- Migrated tasks may preserve their old tab list, mapped to emoji display
  titles. Do not force-add missing defaults to migrated plans unless the user
  asks.

## Cmux conventions

Use Cmux Groups, Workspaces, and tab Surfaces as the scratchpad user interface:

- Project = Cmux Group.
- Project home = `🧭 project` Workspace inside the Group.
- Task = Cmux Workspace inside the Project Group.
- Tab = Cmux Surface inside the Workspace's main Pane.

Default task workspace tabs:

- `📝 neovim`: cwd = Task folder; command = `nvim plan.md`.
- `🤖 pi`: cwd = Worktree when present, otherwise Task folder; command = `pi`.
- `🐚 terminal`: cwd = Worktree when present, otherwise Task folder; plain shell.
- Extra historical or subagent tabs: cwd = Worktree when present, otherwise Task
  folder; plain shell unless the plan explicitly says otherwise.

Cmux command notes:

- Inspect Groups with `cmux workspace-group list --json`.
- Create a Workspace with `cmux new-workspace --name <title> --cwd <path> --command <command>`.
- Create a Group from a known Workspace with
  `cmux workspace-group create --name <group-title> --from <workspace-ref>`.
- Add a Workspace to a Group with
  `cmux workspace-group add --group <group-ref> --workspace <workspace-ref>`.
- Find the main Pane with `cmux list-panes --workspace <workspace-ref>`.
- Add a tab Surface with
  `cmux new-surface --type terminal --workspace <workspace-ref> --pane <pane-ref> --working-directory <path>`.
- Title tabs with `cmux rename-tab --workspace <workspace-ref> --surface <surface-ref> <title>`.
- Launch commands in new tabs with
  `cmux send --workspace <workspace-ref> --surface <surface-ref> <text>`.
- Never call `cmux workspace-group create` without `--from`; omitting `--from`
  uses the active sidebar selection and can group the wrong workspace.
- Never close or recreate a running user workspace unless the user explicitly
  asked for teardown.

## Phase 1: Discovery

Before writing anything, identify the Project and Task.

1. Ensure `active/`, `upcoming/`, and `completed/` exist under
   `<PROJECTS_ROOT>`.
2. List active Projects first, then upcoming Projects. Read each `project.md` so
   the choices show the display title and current context.
3. Ask the user to choose one Project, create a new Project, open Project-only
   mode, or view completed Projects.
4. If the user chooses an existing Project, read `project.md`, summarize the
   Project in one line, and run **Cmux Project setup**.
5. If the user chooses Project-only mode, stop after opening the Project
   workspace and updating `project.md` as needed.
6. If a Task is needed, list that Project's `tasks/active/` first, then
   `tasks/upcoming/`. Ask the user to choose a Task or create a new Task.
7. If the user chooses an existing Task, read `plan.md`, summarize it in one
   line, run **Repository and worktree setup**, run **Cmux Task setup**, then run
   **Agent todo review**.
8. If the user creates a new Task, confirm the readable name, slug, and
   suggested emoji title. Create `tasks/active/<slug>/plan.md` from
   `PLAN_TEMPLATE.md`, fill the metadata, run **Repository and worktree setup**,
   then run **Cmux Task setup**. Skip Agent todo review for fresh tasks.
9. If the user asks to view completed work, list matching Projects or Tasks.
   Viewing is read-only. Reopening requires confirmation and moves the Project
   or Task to the appropriate `active/` folder.

Skip prompts only when the user already named a Project/Task and it exact-or
fuzzy-matches an existing active folder.

## Cmux Project setup

Bring the Project's Cmux Group and `🧭 project` Workspace up when opening or
creating a Project.

1. Read `project.md` for `Cmux group`, `Project workspace`, and Project tabs.
2. If a Group with the same `Cmux group` display title already exists, leave it
   alone and use it.
3. If the Group is missing, create the Project workspace first, then create the
   Group from that workspace with `cmux workspace-group create --from`.
4. Ensure the Project workspace has the requested tabs:
   - `📝 neovim` opens `nvim project.md` in the Project folder.
   - `🤖 pi` runs `pi` in the Project folder.
5. Do not duplicate a tab that already exists.
6. Report the Group title and attach/focus hint in one line.

## Repository and worktree setup

Run this whenever opening or creating a Task that touches code.

1. Decide whether a repo applies. Research, planning, and docs-only tasks can
   use `Repository: none` and `Worktree: none`.
2. Ask for the short repo name accepted by `dev cd` when code or tests are
   involved. Record it in `**Repository**:`.
3. Decide whether a worktree applies. Quick exploration can use `Worktree: none`.
   Code-edit tasks that need isolation get a task-scoped worktree.
4. Default to deferring the branch name. Create detached worktrees at `main` so
   the branch can be named later from the actual work. Only create a branch up
   front if the user explicitly names one.
5. Build the default worktree path from the task slug:
   `<repo>/.worktrees/<task-slug>`.
6. Create on demand only when missing:
   - Detached on main: `git -C <repo> worktree add --detach <path> main`.
   - Explicit new branch: `git -C <repo> worktree add <path> -b <branch>`.
   - Explicit existing local branch: `git -C <repo> worktree add <path> <branch>`.
7. If the requested branch is checked out elsewhere, stop and ask. Never force.
8. Record the absolute path in `**Worktree**:` and verify with
   `git -C <repo> worktree list`.

When opening an existing Task whose `Worktree` path is missing, recreate it with
the same logic. If the plan says branch creation was deferred, recreate detached
at `main` rather than inventing a branch from the path.

Never remove a worktree here. Worktree removal only happens in task completion.

## Cmux Task setup

Bring the Task's Cmux Workspace up when opening or creating a Task.

1. Read `plan.md` for `Cmux workspace`, `Tabs`, `Repository`, and `Worktree`.
2. Ensure the Project Group exists by running **Cmux Project setup**.
3. If a Workspace with the same `Cmux workspace` title already exists in the
   Project Group, leave it running and do not disturb its tabs.
4. If it is missing, create a new Workspace and add it to the Project Group.
5. Create the default tabs for new tasks:
   - `📝 neovim`: cwd = Task folder; command = `nvim plan.md`.
   - `🤖 pi`: cwd = Worktree when present, otherwise Task folder; command = `pi`.
   - `🐚 terminal`: cwd = Worktree when present, otherwise Task folder.
6. For migrated tasks, create tabs from the recorded tab list. Preserve the
   plan's existing tab list rather than forcing defaults.
7. Verify the Workspace appears under the Project Group with `cmux tree --all`
   or `cmux workspace-group list --json`.

## Agent todo review

Run this every time an existing Task is opened, before any other work.

1. Read the `## Task list` → `### Agent` subsection.
2. Collect open Agent items (`[ ]`) that are not annotated as `status: running`.
3. If none exist, say so in one line and continue.
4. Ask the user which Agent todos to dispatch. Never start one without approval.
5. For approved todos, follow **Dispatching Agent todos**.

## Dispatching Agent todos

When an Agent todo is approved:

1. Prefer `superpowers_dispatch` or `subagent` so the lead session stays clean.
2. Create a Cmux tab Surface in the Task workspace for visibility, titled like
   `🕵️ subagent-pr-risk-critique`.
3. Start the tab in the Worktree when present, otherwise the Task folder.
4. Launch the agent invocation in that tab when practical. If the dispatch tool
   cannot be launched inside the tab, still create the tab for notes/logs and
   explain the fallback.
5. Update the plan immediately:
   - Annotate the todo: `— tab: 🕵️ subagent-foo, status: running`.
   - Append the tab title to the `**Tabs**:` metadata if it is not already there.
6. On completion, check off the todo and update `status: done`. On failure, set
   `status: blocked (<one-line reason>)` and add an Open Question if needed.

Rules:

- Never dispatch parallel agents that modify the same files.
- Never silently delete Agent todo annotations; they are the audit trail.

## Live updates

Update `plan.md` whenever:

1. A task item is completed.
2. A new task item is identified.
3. A decision is made.
4. A new open question surfaces.
5. A file is created or modified and not listed in Files Touched.
6. Status changes.
7. Cmux tabs are added, removed, renamed, or repurposed.
8. The task gains or changes a repo/worktree.
9. A subagent starts, finishes, or changes status.

Update `project.md` whenever:

1. Project status changes.
2. Project-level decisions or context change.
3. Tasks are added, moved, completed, reopened, or removed from the Project.
4. The Project emoji/title/Cmux Group title changes.

Use `edit` with small targeted edits. Preserve manual edits.

## Context syncing

Keep `project.md` and `plan.md` resumable.

- `project.md` should summarize the Project's purpose, current active tasks,
  important decisions, and next project-level move.
- `plan.md` should summarize the current task state, what just happened, and
  the immediate next step.
- Refresh `## Context Snapshot` instead of appending stale summaries.
- Move resolved Open Questions into Decisions.
- Keep Decisions, completed Task list history, and Files Touched append-only.

## Moving folders

- Create destination status folders first.
- Move whole Project or Task directories with `mv`; do not copy only markdown.
- If the destination path exists, stop and ask; never overwrite or merge.
- After a move, use the new path for the rest of the session.

## Task completion

Run this when the user explicitly confirms a Task is finished.

1. Restate the Project and Task names.
2. Run a task-scoped retrospective before teardown. Load the `retrospect` skill,
   scope it to this Task, and write `retro.md` beside `plan.md` plus a copy at
   `~/retrospectives/<YYYY-MM-DD>-<task-slug>.md` when there is useful content.
3. Set `**Status**:` to `done`.
4. Tear down the task worktree only if `**Worktree**:` is a path that exists:
   - Check `git -C <path> status --porcelain`; if dirty, stop and ask.
   - Check for unpushed commits; if any could be lost, stop and ask.
   - Remove with `git -C <repo> worktree remove <path>` only when safe or
     explicitly approved. Use `--force` only with explicit discard approval.
   - Run `git -C <repo> worktree prune`.
   - Never delete branches automatically.
5. Close only the Task's Cmux Workspace. Keep the Project Group and `🧭 project`
   Workspace open.
6. Move the Task folder to the Project's `tasks/completed/` folder.
7. Report worktree, Cmux workspace, folder move, and retro paths in three lines.

If teardown stops at a safety guard, leave the Task in `tasks/active/` and keep
its workspace running.

## Project completion

Run this only when the user explicitly confirms a Project is finished.

1. Refuse to complete the Project while any task remains in `tasks/active/`
   unless the user chooses how to handle those tasks.
2. Update `project.md` `**Status**:` to `completed`.
3. Move the whole Project folder to `<PROJECTS_ROOT>/completed/`.
4. Close the Project Group only after the folder move succeeds.
5. Report the new Project path and closed Group title.

Do not auto-complete a Project just because the last active Task completed.

## Execution rule

Before executing implementation work from a Task list, load and follow the
`tdd-implementation` skill from `~/.agents/skills/tdd-implementation/SKILL.md`.
Do not write code or tests outside that loop.

## Hard rules

- Never auto-create a Project or Task folder without explicit confirmation or an unambiguous discovery match.
- Never overwrite `project.md` or `plan.md` wholesale during normal use; use small targeted edits, except refreshing `## Context Snapshot`.
- Never delete Decisions, Files Touched, or completed Task list history.
- Never overwrite or merge Project or Task folders.
- Never run `git worktree remove` outside the **Task completion** flow.
- Never remove a worktree with uncommitted or unpushed work without asking.
- Never delete branches automatically.
- Never stage or commit scratchpad folders unless explicitly asked.
- Never call `cmux workspace-group create` without `--from`.
- Never close a Project Group as part of Task completion; Project completion is explicit.
- Keep entries terse, factual, and dated.

## Stop conditions

- "Stop tracking" or "close the scratchpad" for a Task → set the Task `Status` to `paused`; keep it in `tasks/active/` unless done is confirmed.
- User confirms a Task is done → run **Task completion**.
- User confirms a Project is done → run **Project completion**.
- New unrelated Project or Task starts → run **Phase 1: Discovery** before touching any markdown.
- A Cmux command would disturb an existing running workspace unexpectedly → stop and ask.
