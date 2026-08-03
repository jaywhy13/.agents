---
name: scratchpad
description: "Project/task/todo scratchpad organized around Zellij and workctl. Projects live under the Projects root and map to workctl projects; tasks live under projects, map to top-level workctl tasks, and are resumed as Zellij sessions; nested todos live inside tasks and map to workctl todos, not child tasks. Maintains project.md and per-task plan.md, keeps workctl records current, attaches/jumps with workctl Zellij commands, and maintains a .scratchpad symlink in task or todo worktrees. Trigger: user says 'scratchpad', '/scratchpad', 'open the scratchpad', 'I'm done with this task', or starts a multi-step task that needs a written plan."
---

# scratchpad

Maintain markdown scratchpads for project-level context and task-level plans.
The markdown files are the durable human-readable record, and `workctl` is the
local task index and resume system. Zellij is the active workspace interface.

Use this mapping:

- **Project**: a body of work. It has one scratchpad Project folder with
  `project.md` and one `workctl` project.
- **Task**: a concrete slice of work inside a Project. It has one scratchpad
  Task folder with `plan.md`, one fully qualified `workctl` task ID
  `<project_id>/<task_id>`, and one Zellij session for focused work.
- **Todo**: a nested checklist item inside a Task. It has one fully qualified
  `workctl` todo ID `<project_id>/<task_id>/<todo_id>`. Todos may be nested
  under other todos without becoming tasks.
- **Worktree scratchpad link**: when a Task or Todo has a git worktree, the
  worktree must contain `.scratchpad` as a symlink to the owning scratchpad
  folder. If a Todo does not set repository, directory, or worktree metadata,
  it inherits those values from its parent Task.

Cmux was the previous scratchpad workspace model. Treat old Cmux metadata as
historical compatibility only; do not create new Cmux Groups or Workspaces for
scratchpad flow unless the user explicitly asks for legacy Cmux handling.

## Configuration

- **Projects root**: `/Users/jeanmark.wright/Documents/JMxShopify/Projects`
- **workctl command**: `/Users/jeanmark.wright/.local/bin/workctl`
- **workctl source**: `/Users/jeanmark.wright/code/workctl/workctl.py`
- **Task plan template**: `PLAN_TEMPLATE.md` in this skill directory.

The old `/Users/jeanmark.wright/Documents/JMxShopify/Tasks` tree is not a normal
source of truth after migration. Do not create new work there and do not scan it
for active work.

## Folder layout

```
<PROJECTS_ROOT>/
  ads-data-migration/
    project.md
    tasks/
      test-dbt-model-pipeline/
        plan.md
      validate-dashboard-counts/
        plan.md
  job-deferrer/
    project.md
    tasks/
      verify-rerun-behavior/
        plan.md
```

Rules:

- Project and Task folder names are ASCII lower-kebab-case slugs.
- Todo IDs are ASCII lower-kebab-case slugs and live in the task plan rather than separate task folders.
- Project status lives only in the top metadata block of `project.md`.
- Task status lives only in the top metadata block of `plan.md`.
- Do not create `active/`, `upcoming/`, `completed/`, or `closed/` status
  folders under Projects or under `tasks/`.
- Never overwrite or merge folders. If a destination exists, stop and ask.

## Project metadata

Every Project has `project.md` at the Project folder root. The top bullet block
is parseable metadata used by this skill, `/scratchpad-sync`, and workctl sync:

```markdown
- **Started**: YYYY-MM-DD
- **Status**: active
- **Project slug**: ads-data-migration
- **Project title**: 🚚 ads-data-migration
- **Workctl project**: ads-data-migration
- **Scratchpad path**: /Users/jeanmark.wright/Documents/JMxShopify/Projects/ads-data-migration
- **Repository**: ads-data   (or `none`)
```

Rules:

- Keep the bullet labels in bold exactly as shown.
- `Status` values for Projects: `active`, `upcoming`, `completed`.
- `Project slug` is the filesystem folder slug and the default workctl project ID.
- `Project title` is the human display title. Suggest an emoji when creating a
  Project and store it here.
- `Workctl project` is the project ID passed to `workctl project add`.
- `Scratchpad path` is the absolute Project folder path.
- `Repository` is either `none` or the short name accepted by `dev cd`.
- Existing Projects may still contain `Cmux group`, `Project workspace`, or
  `Tabs`. Leave them alone unless you are already editing that metadata block;
  when you touch the block, add the workctl fields and stop treating Cmux fields
  as active instructions.

## Task metadata

Every Task has `plan.md` in the Task folder. The top bullet block is parseable
metadata used by this skill, `/scratchpad-sync`, workctl sync, and Zellij resume:

```markdown
- **Started**: YYYY-MM-DD
- **Status**: in progress
- **Project**: ads-data-migration
- **Task title**: 🧪 test-dbt-model-pipeline
- **Workctl task**: ads-data-migration/test-dbt-model-pipeline
- **Repository**: ads-data   (or `none`)
- **Worktree**: /abs/path/to/repo/.worktrees/<branch-or-task>   (or `none`)
- **Scratchpad path**: /Users/jeanmark.wright/Documents/JMxShopify/Projects/ads-data-migration/tasks/test-dbt-model-pipeline
- **Zellij session**: ads-data-migration/test-dbt-model-pipeline
  - **Tabs**: plan, code, pi, terminal
```

Rules:

- Keep the bullet labels in bold exactly as shown.
- `Status` values in scratchpad: `upcoming`, `in progress`, `blocked`, `paused`,
  `in review`, `done`, `completed`.
- `Status` values in workctl are `todo`, `in_progress`, `blocked`, `done`, and
  `archived`. Map scratchpad `upcoming`/`paused`/`in review` to the closest
  workctl state and keep the richer scratchpad status in `plan.md`.
- Task status changes update only the `**Status**:` metadata line; they never
  move the Task folder into a status directory.
- `Project` is the Project slug, not the emoji title.
- `Task title` is the human display title. Suggest task emojis and store them here.
- `Workctl task` is the fully qualified task ID `<project_id>/<task_id>`.
- Tasks are always top-level under a Project. Do not create child workctl Tasks.
- `Repository` is either `none` or the short name accepted by `dev cd`.
- `Worktree` is either `none` or an absolute path to a git worktree.
- `Scratchpad path` is the absolute Task folder path.
- `Zellij session` defaults to the fully qualified task ID.
- `Tabs` are Zellij tab titles for local working surfaces. New tasks default to
  `plan, code, pi, terminal`. `workctl zellij sync` also creates one tab for each active Todo in the Task session.
- Existing Tasks may still contain `Cmux workspace` or old emoji tab lists.
  Leave them alone unless you are already editing that metadata block; when you
  touch the block, add workctl/Zellij fields and treat Cmux fields as historical.

## workctl sync

Keep workctl populated whenever you create, open, rename, or materially update a
Project or Task.

Project create/open flow:

1. Compute `project_id` from `Workctl project` or `Project slug`.
2. If the workctl Project does not exist, create it:

   ```sh
   workctl project show <project_id> >/dev/null 2>&1 || \
     workctl project add <project_id> \
       --title "<Project title>" \
       --directory "<absolute Project folder>"
   ```

3. If the Project exists but metadata drifted, use `workctl project edit
   <project_id>` and update the generated markdown, or record the mismatch as an
   Open Question if a noninteractive update is not available.

Task create/open flow:

1. Compute `qualified_task_id` from `Workctl task` or `<Project>/<task-folder>`.
2. If the workctl Task does not exist, create it:

   ```sh
   workctl task show <project_id>/<task_id> >/dev/null 2>&1 || \
     workctl task add <project_id>/<task_id> \
       --title "<Task title>" \
       --summary "<one-line task summary>" \
       --status in_progress \
       --priority medium \
       --directory "<absolute Task folder>" \
       --open-with terminal
   ```

   Include `--repository <repo>` and `--worktree <absolute worktree>` when those
   values are not `none`.

3. For nested work inside a Task, create a workctl Todo, not a child Task:

   ```sh
   workctl todo add <project_id>/<task_id>/<todo_id> \
     --title "<Todo title>"
   ```

   For a nested Todo, include the parent todo ID:

   ```sh
   workctl todo add <project_id>/<task_id>/<child_todo_id> \
     --parent <project_id>/<task_id>/<parent_todo_id> \
     --title "<Todo title>"
   ```

   Include `--repository <repo>`, `--directory <path>`, and `--worktree <path>`
   only when the Todo intentionally overrides the parent Task. Otherwise let the
   Todo inherit those fields.

4. When only status changes, also update workctl status when a safe mapping
   exists, for example:

   ```sh
   workctl task status <project_id>/<task_id> in_progress
   workctl task status <project_id>/<task_id> blocked
   workctl task status <project_id>/<task_id> done
   workctl todo status <project_id>/<task_id>/<todo_id> in_progress
   workctl todo status <project_id>/<task_id>/<todo_id> blocked
   workctl todo status <project_id>/<task_id>/<todo_id> done
   ```

5. Use `workctl task edit <project_id>/<task_id>` for richer task metadata edits
   when the command-line flags cannot update an existing row.

Do not run `workctl project add` or `workctl task add` blindly; both are create
commands and can fail if the record already exists.

## Zellij workflow

Use Zellij as the primary scratchpad runtime:

- Open the todo dashboard from Zellij with `workctl zellij todos`. The installed
  binding `Ctrl Super t` runs this in a floating pane.
- Attach the current Zellij pane to a Task with either command:

  ```sh
  workctl zellij attach <project_id>/<task_id>
  workctl task attach <project_id>/<task_id>
  ```

  `workctl task attach` detects Zellij and stores a Zellij target.

- Resume a Task from inside Zellij with:

  ```sh
  workctl task jump <project_id>/<task_id>
  workctl task jump <project_id>/<task_id> --with nvim
  workctl task jump <project_id>/<task_id> --with pi
  workctl task jump <project_id>/<task_id> --with terminal
  ```

  `workctl task jump` focuses the Task's dedicated Zellij session when it exists,
  or creates that session when needed.

- Treat each Task as the Zellij session-level unit. `workctl zellij sync` creates
  one tab for the Task and one tab for each active Todo in that Task. Manual tabs
  like `plan`, `code`, `pi`, and `terminal` are working surfaces; Todo tabs are
  derived from workctl Todos.
- When you add, remove, rename, or repurpose a durable working-surface tab,
  update the Task's `**Tabs**:` metadata. Do not create child workctl Tasks for
  tabs.

## Repository, worktree, and `.scratchpad` setup

Run this whenever opening or creating a Task that touches code.

1. Decide whether a repo applies. Research, planning, and docs-only tasks can
   use `Repository: none` and `Worktree: none`.
2. Ask for the short repo name accepted by `dev cd` when code or tests are
   involved. Record it in `**Repository**:` and the workctl Project/Task.
3. Decide whether a worktree applies. Quick exploration can use `Worktree: none`.
   Code-edit tasks that need isolation get a task-scoped worktree.
4. Default to deferring the branch name. Create detached worktrees at `main` so
   the branch can be named later from the actual work. Only create a branch up
   front if the user explicitly names one.
5. Build the default worktree path from the Task slug:
   `<repo>/.worktrees/<task-slug>`.
6. Create on demand only when missing:
   - Detached on main: `git -C <repo> worktree add --detach <path> main`.
   - Explicit new branch: `git -C <repo> worktree add <path> -b <branch>`.
   - Explicit existing local branch: `git -C <repo> worktree add <path> <branch>`.
7. If the requested branch is checked out elsewhere, stop and ask. Never force.
8. Record the absolute path in `**Worktree**:` and in workctl with
   `workctl task edit` or by setting it during `workctl task add`.
9. Verify with `git -C <repo> worktree list`.
10. Ensure the `.scratchpad` symlink exists inside the worktree and points to the
    Task scratchpad folder:

    ```sh
    worktree_path="<absolute worktree>"
    scratchpad_path="<absolute Task scratchpad folder>"
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

When opening an existing Task whose `Worktree` path is missing, recreate it with
the same logic. If the plan says branch creation was deferred, recreate detached
at `main` rather than inventing a branch from the path.

Never remove a worktree here. Worktree removal only happens in Task completion.

## Phase 1: Discovery

Before writing anything, identify the Project and Task.

1. Ensure `<PROJECTS_ROOT>` exists. Do not create status folders under it.
2. List Projects by reading each immediate child directory's `project.md` and
   grouping by `**Status**:`: active first, then upcoming, then completed.
3. Ask the user to choose one Project, create a new Project, open Project-only
   mode, or view completed Projects.
4. If the user chooses an existing Project, read `project.md`, summarize the
   Project in one line, and run **workctl sync** for the Project.
5. If the user chooses Project-only mode, stop after the Project workctl sync and
   updating `project.md` as needed.
6. If a Task is needed, list that Project's `tasks/*/plan.md` entries grouped by
   `**Status**:`: active statuses first (`in progress`, `in review`, `blocked`,
   `paused`), then `upcoming`, then `done`/`completed`.
7. If the user chooses an existing Task, read `plan.md`, summarize it in one
   line, run **workctl sync**, run **Repository, worktree, and `.scratchpad`
   setup**, then run **Zellij workflow** and **Agent todo review**.
8. If the user creates a new Task, confirm the readable name, slug, and
   suggested emoji title. Create `tasks/<slug>/plan.md` from
   `PLAN_TEMPLATE.md`, fill the metadata, run **workctl sync**, run
   **Repository, worktree, and `.scratchpad` setup**, then attach or jump with
   workctl/Zellij. Skip Agent todo review for fresh Tasks.
9. If the user asks to view completed work, list matching Projects or Tasks.
   Viewing is read-only. Reopening requires confirmation and updates the
   Project or Task `**Status**:` metadata instead of moving folders.

Skip prompts only when the user already named a Project/Task and it exact-or
fuzzy-matches an existing folder with an active status.

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
2. Create or reuse a Zellij tab in the Task session for visibility, titled like
   `subagent-pr-risk-critique`.
3. Create a workctl Todo for the Agent todo when it is more than a short
   one-off command:

   ```sh
   workctl todo add <project_id>/<task_id>/<agent_todo_id> \
     --title "<Agent todo title>"
   ```

   Include `--repository <repo>`, `--directory <path>`, and `--worktree <path>`
   only when the Agent todo needs to override the parent Task. Otherwise inherit
   those values.

4. Start the tab in the Worktree when present, otherwise the Task folder.
5. Launch the agent invocation in that tab when practical. If the dispatch tool
   cannot be launched inside the tab, still create the tab for notes/logs and
   explain the fallback.
6. Attach the tab/pane to the parent workctl Task when a persistent Zellij
   target is useful:

   ```sh
   workctl zellij attach <project_id>/<task_id>
   ```

7. Update the plan immediately:
   - Annotate the todo: `— tab: subagent-foo, status: running`.
   - Append the tab title to the `**Tabs**:` metadata if it is not already there.
8. On completion, check off the todo and update `status: done`. On failure, set
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
7. Zellij tabs are added, removed, renamed, or repurposed.
8. The task gains or changes a repo/worktree.
9. The `.scratchpad` symlink is created or corrected.
10. A subagent starts, finishes, or changes status.

Update `project.md` whenever:

1. Project status changes.
2. Project-level decisions or context change.
3. Tasks are added, renamed, completed, reopened, or removed from the Project.
4. The Project emoji/title/workctl project ID changes.

Keep matching workctl records current whenever these changes affect project/task
title, status, directory, repository, worktree, parent, or resume behavior.

Use `edit` with small targeted edits. Preserve manual edits.

## Context syncing

Keep `project.md` and `plan.md` resumable.

- `project.md` should summarize the Project's purpose, current active-status Tasks,
  important decisions, and next project-level move.
- `plan.md` should summarize the current Task state, what just happened, and
  the immediate next step.
- Refresh `## Context Snapshot` instead of appending stale summaries.
- Move resolved Open Questions into Decisions.
- Keep Decisions, completed Task list history, and Files Touched append-only.

## Moving folders

Folders move only for renames or explicit reorganization, never for status
changes.

- Do not create status folders such as `active/`, `upcoming/`, `completed/`, or
  `closed/`.
- Rename whole Project or Task directories with `mv`; do not copy only markdown.
- If the destination path exists, stop and ask; never overwrite or merge.
- After a move, update affected links in `project.md` or `plan.md`, update the
  workctl Project/Task directory fields, correct any `.scratchpad` symlink that
  points at the old Task path, and use the new path for the rest of the session.

## Task completion

Run this when the user explicitly confirms a Task is finished.

1. Restate the Project and Task names.
2. Run a task-scoped retrospective before teardown. Load the `retrospect` skill,
   scope it to this Task, and write `retro.md` beside `plan.md` plus a copy at
   `~/retrospectives/<YYYY-MM-DD>-<task-slug>.md` when there is useful content.
3. Always publish the retro to Organized. Load the `organized-retro` skill, pass
   it the Task's `retro.md` and the Project/Task slugs, and post it (the user has
   already confirmed task closure, so no separate publish approval is needed).
   Skip only when there is no useful retro content or the user explicitly opts
   out. If Organized is not signed in, ask the user to sign in and retry rather
   than silently dropping the post; record the post link for the final report.
4. Set `**Status**:` to `done` and run `workctl task status <project_id>/<task_id> done`.
5. Leave the Task folder in place; status is represented only by metadata.
6. Tear down the task worktree only if `**Worktree**:` is a path that exists:
   - Check `git -C <path> status --porcelain`; if dirty, stop and ask.
   - Check for unpushed commits; if any could be lost, stop and ask.
   - Remove with `git -C <repo> worktree remove <path>` only when safe or
     explicitly approved. Use `--force` only with explicit discard approval.
   - Run `git -C <repo> worktree prune`.
   - Never delete branches automatically.
   - The `.scratchpad` symlink disappears with the worktree; do not delete the
     Task scratchpad folder.
7. Leave Zellij session/tab teardown to the user unless they explicitly ask to
   close it. Do not close unrelated Zellij sessions or panes.
8. Report worktree handling, workctl status, Zellij handling, unchanged Task
   folder path, retro paths, and the Organized post link.

If teardown stops at a safety guard, keep the Task status unchanged and keep its
Zellij session running.

## Project completion

Run this only when the user explicitly confirms a Project is finished.

1. Refuse to complete the Project while any Task has an active status (`in progress`,
   `in review`, `blocked`, or `paused`) unless the user chooses how to handle
   those Tasks.
2. Update `project.md` `**Status**:` to `completed`.
3. Leave the Project folder in place; status is represented only by metadata.
4. Ensure all non-completed workctl Tasks are either done or intentionally left
   with their current status; record any mismatch as an Open Question.
5. Report the Project path and workctl project ID.

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
- Never create new Cmux scratchpad Groups or Workspaces unless the user explicitly asks for legacy Cmux behavior.
- Never replace an existing `.scratchpad` path that is not the expected symlink without asking.
- Never close a Project or Task Zellij session unless the user explicitly asks.
- Keep entries terse, factual, and dated.

## Stop conditions

- "Stop tracking" or "close the scratchpad" for a Task → set the Task `Status` to `paused`; leave the folder in place and map workctl status only if the user wants a coarser status.
- User confirms a Task is done → run **Task completion**.
- User confirms a Project is done → run **Project completion**.
- New unrelated Project or Task starts → run **Phase 1: Discovery** before touching any markdown.
- A workctl or Zellij command would disturb an existing running workspace unexpectedly → stop and ask.
