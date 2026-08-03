---
name: scratchpad-sync
description: "Sync the project/task scratchpad with workctl and Zellij resume metadata. Reads Projects under the Projects root whose `project.md` status is active, ensures matching workctl projects and active-status tasks exist, verifies or recreates task worktrees, ensures each worktree has a safe .scratchpad symlink to its task folder, and runs `workctl zellij sync` to create/focus the active task sessions model. Trigger: user says 'scratchpad-sync', '/scratchpad-sync', 'rebuild my sessions', or wants to restore scratchpad work after a disconnect/restart."
---

# scratchpad-sync

Rebuild the active scratchpad resume model from disk.

This skill reads Project and Task metadata, then makes workctl and Zellij resume
points match the active scratchpad structure:

- Project folder → workctl Project.
- Active-status Task folder → workctl Task with fully qualified ID
  `<project_id>/<task_id>`.
- Todo item → workctl Todo with fully qualified ID `<project_id>/<task_id>/<todo_id>`.
- Task or Todo worktree → `.scratchpad` symlink pointing to the owning scratchpad folder.
- Zellij session → created by `workctl zellij sync` for each active top-level Task.
- Zellij tab → created by `workctl zellij sync` for each active Todo inside the Task session; manual tabs are working surfaces.
- Zellij target → stored by `workctl zellij sync`, `workctl zellij attach`, or
  `workctl task attach` from inside the relevant Zellij pane.

It only syncs active-status Projects and active-status Tasks. Upcoming and
completed work is left on disk and not opened automatically.

Cmux was the previous scratchpad workspace model. Do not rebuild Cmux Groups or
Workspaces during this sync unless the user explicitly asks for legacy Cmux
recovery.

## Configuration

- **Projects root**: `/Users/jeanmark.wright/Documents/JMxShopify/Projects`
- **workctl command**: `/Users/jeanmark.wright/.local/bin/workctl`

The old `/Users/jeanmark.wright/Documents/JMxShopify/Tasks` tree is not scanned.
After migration, `/Projects` is the only source of truth.

## Metadata it reads

From each Project's `project.md`:

```markdown
- **Started**: YYYY-MM-DD
- **Status**: active
- **Project slug**: ads-data-migration
- **Project title**: 🚚 ads-data-migration
- **Workctl project**: ads-data-migration
- **Scratchpad path**: /Users/jeanmark.wright/Documents/JMxShopify/Projects/ads-data-migration
- **Repository**: ads-data
```

From each Task's `plan.md`:

```markdown
- **Started**: YYYY-MM-DD
- **Status**: in progress
- **Project**: ads-data-migration
- **Task title**: 🧪 test-dbt-model-pipeline
- **Workctl task**: ads-data-migration/test-dbt-model-pipeline
- **Repository**: ads-data
- **Worktree**: /abs/path/to/repo/.worktrees/test-dbt-model-pipeline
- **Scratchpad path**: /Users/jeanmark.wright/Documents/JMxShopify/Projects/ads-data-migration/tasks/test-dbt-model-pipeline
- **Zellij session**: ads-data-migration/test-dbt-model-pipeline
  - **Tabs**: plan, code, pi, terminal
```

Rules:

- Missing `Workctl project` falls back to `Project slug`.
- Missing Project `Scratchpad path` falls back to the Project folder path.
- Missing Project `Repository` means `none`.
- Missing `Workctl task` falls back to `<Project>/<task-folder-name>`.
- Missing Task `Repository` means the Project repository, then `none`.
- Missing `Worktree` means `none`.
- Missing Task `Scratchpad path` falls back to the Task folder path.
- Missing `Zellij session` falls back to the fully qualified workctl Task ID.
- Missing Task tabs fall back to `plan, code, pi, terminal`.
- Legacy `Cmux group`, `Project workspace`, `Cmux workspace`, and emoji tab
  fields are compatibility data only. Do not use them to create Cmux resources.

## Procedure

1. **List active-status Projects.** Enumerate immediate subdirectories of
   `<PROJECTS_ROOT>`. Each directory with `project.md` is a Project. Skip
   directories without `project.md`, and only sync Projects whose `**Status**:`
   is `active`.

2. **Parse Project metadata.** Extract `Status`, `Project slug`, `Project title`,
   `Workctl project`, `Scratchpad path`, and `Repository`.

3. **Ensure the workctl Project exists.**
   - Run `workctl project show <project_id>`.
   - If missing, create it:

     ```sh
     workctl project add <project_id> \
       --title "<Project title>" \
       --directory "<absolute Project folder>"
     ```

   - Include `--repository <repo>` when the Project repository is not `none`.
   - If the Project exists but metadata differs, report the drift. Do not run a
     blind create command; use `workctl project edit <project_id>` only when the
     user approves updating the existing record.

4. **List active-status Tasks for the Project.** Enumerate
   `<project-dir>/tasks/*/plan.md`. Do not use status folders. Open only tasks
   whose `Status` is active: `in progress`, `in review`, `blocked`, or `paused`.
   Skip `upcoming`, `done`, and `completed`.

5. **Parse Task metadata.** Extract `Status`, `Workctl task`, `Repository`,
   `Worktree`, `Scratchpad path`, `Zellij session`, and `Tabs`. Parse nested
   todos from the task plan when present and map them to workctl Todos.

6. **Ensure each workctl Task exists.**
   - Run `workctl task show <project_id>/<task_id>`.
   - If missing, create it:

     ```sh
     workctl task add <project_id>/<task_id> \
       --title "<Task title>" \
       --summary "<one-line task summary>" \
       --status in_progress \
       --priority medium \
       --directory "<absolute Task folder>" \
       --open-with terminal
     ```

   - Include `--repository <repo>` when the Task repository is not `none`.
   - Include `--worktree <absolute worktree>` when the Task worktree is not `none`.
   - Never include `--parent` for Tasks. Tasks are top-level under Projects.
   - If the Task exists but metadata differs, report the drift. Use
     `workctl task edit <project_id>/<task_id>` or `workctl task status` only
     when the user approves updating the existing record.

7. **Ensure each workctl Todo exists.** For each parsed Todo:
   - Use the fully qualified ID `<project_id>/<task_id>/<todo_id>`.
   - If missing, create it:

     ```sh
     workctl todo add <project_id>/<task_id>/<todo_id> \
       --title "<Todo title>" \
       --status todo \
       --priority medium
     ```

   - For nested Todos, include `--parent <project_id>/<task_id>/<parent_todo_id>`.
   - Include repository, directory, and worktree only when the Todo overrides the
     parent Task. Missing values inherit from the parent Task.
   - Use `workctl todo status` for approved Todo status changes.

8. **Ensure task and todo worktrees exist.** For each Task or Todo whose `Worktree` is a path:
   - If the path exists and `git -C <path> rev-parse --is-inside-work-tree`
     succeeds, report `existed`.
   - Otherwise infer the repo root by stripping `/.worktrees/<name>` from the
     path. If that repo root is not a git repo, skip worktree creation and
     report the inconsistency.
   - If the plan says branch creation was deferred or detached at `main`, run
     `git -C <repo> worktree add --detach <path> main`.
   - Otherwise inspect `git -C <repo> worktree list --porcelain`.
     - Branch checked out elsewhere → skip and report. Never force.
     - Branch exists locally → `git -C <repo> worktree add <path> <branch>`.
     - Branch does not exist → `git -C <repo> worktree add <path> -b <branch>`.
   - Report each worktree as created, existed, or skipped with reason.

9. **Ensure `.scratchpad` symlink exists for each task or todo worktree.** Use
   the owning scratchpad folder as the expected target:

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

   Never replace an existing nonmatching `.scratchpad` path without asking.

10. **Sync active work into Zellij sessions.** Use the purpose-built sync command
   after workctl projects, tasks, worktrees, and `.scratchpad` symlinks are in
   place:

   ```sh
   workctl zellij sync
   ```

   What this does:

   - Creates one detached Zellij session for each active top-level workctl Task.
   - Creates one Zellij tab in that session for each active Todo.
   - Saves Zellij targets back into workctl so `workctl task jump` can switch to
     the session/tab later.
   - Confirms or creates `.scratchpad` symlinks for task worktrees when a
     `Scratchpad folder` reference exists.
   - Skips existing Zellij sessions by default. Do not pass `--recreate` unless
     the user explicitly asks to rebuild running sessions.

   Useful safe forms:

   ```sh
   workctl zellij sync --dry-run
   workctl zellij sync --project <project_id>
   workctl zellij sync --status in_progress --status todo
   ```

   Only use this with approval because it may create many detached Zellij
   sessions at once. Start with `--dry-run` when the user asks to inspect or
   preview the rebuild.

10. **Attach or jump to a specific live pane when needed.** If the current pane
    is already the right Task pane, attach it:

   ```sh
   workctl zellij attach <project_id>/<task_id>
   ```

   Otherwise, open or focus the Task from Zellij with:

   ```sh
   workctl task jump <project_id>/<task_id>
   ```

   `workctl task jump` detects Zellij, switches to the stored session/tab when
   present, and recreates a Zellij tab/pane when needed. `workctl zellij todos`
   opens the todo dashboard in a Zellij floating pane; the installed
   `Ctrl Super t` binding runs this command.

11. **Report.** For each Project, summarize:
    - workctl Project: created / existed / drifted / skipped with reason.
    - Each active-status Task: workctl Task status, worktree status,
      `.scratchpad` symlink status, and Zellij sync status/session name.
    - Whether `workctl zellij sync` was run, dry-run only, skipped, or blocked.

Close with the Zellij resume hint: `workctl zellij todos` for the dashboard,
`workctl zellij sync --dry-run` to preview session rebuilds, or
`workctl task jump <project_id>/<task_id>` for a specific Task.

## Hard rules

- Never scan or recreate the old `Tasks` tree.
- Never open upcoming, done, or completed tasks automatically.
- Never run `workctl project add` or `workctl task add` blindly; check whether
  the record exists first.
- Never recreate, close, or rename a running Zellij session, tab, or pane that
  already exists without user approval. `workctl zellij sync` is safe by default
  because it skips existing sessions; `--recreate` requires explicit approval.
- Never create, close, or modify Cmux Groups or Workspaces unless the user
  explicitly asks for legacy Cmux recovery.
- Never run `git worktree remove`, `git branch -D`, `git reset`, or any other
  destructive git command.
- Never force-check-out a branch that is already checked out at another path.
- Never replace an existing `.scratchpad` path that is not the expected symlink
  without asking.
- Do not modify `project.md` or `plan.md` unless the user explicitly asks sync
  to add missing workctl/Zellij metadata; normal sync reads markdown only.

## Stop conditions

- No active-status Projects → report nothing to do.
- Project directory has no `project.md` → skip and report.
- Task directory has no `plan.md` → skip and report.
- Worktree path's inferred repo is not a git repo → skip worktree creation for
  that Task, still keep the workctl Task pointed at the scratchpad folder.
- `Repository` is set but `dev cd <repo>` cannot resolve it → still keep the
  workctl Task pointed at the Worktree or Task folder and report the inconsistency.
- A workctl, Zellij, symlink, or git operation would disturb or overwrite a
  running user workspace or existing path unexpectedly → stop and ask.
