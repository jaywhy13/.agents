---
name: scratchpad-sync
description: "Rebuild Cmux Groups and Workspaces from the project/task scratchpad. Reads active Projects under the Projects root, opens each Project's Cmux Group and project workspace, ensures active task worktrees exist, and opens active task Cmux Workspaces with their recorded tabs. Trigger: user says 'scratchpad-sync', '/scratchpad-sync', 'rebuild my sessions', or wants to restore scratchpad workspaces after a disconnect/restart."
---

# scratchpad-sync

Rebuild the active scratchpad workspace from disk.

This skill reads Project and Task metadata, then makes Cmux match the active
scratchpad structure:

- Project folder → Cmux Group.
- Project `project.md` → `🧭 project` Workspace inside the Group.
- Active Task folder → Cmux Workspace inside the Project Group.
- Task tab list → Cmux tab Surfaces inside that Workspace.

It only opens active Projects and active Tasks. Upcoming and completed work is
left on disk and not opened automatically.

## Configuration

- **Projects root**: `/Users/jeanmark.wright/Documents/JMxShopify/Projects`
- **Active projects root**: `/Users/jeanmark.wright/Documents/JMxShopify/Projects/active`

The old `/Users/jeanmark.wright/Documents/JMxShopify/Tasks` tree is not scanned.
After migration, `/Projects` is the only source of truth.

## Metadata it reads

From each active Project's `project.md`:

```markdown
- **Started**: YYYY-MM-DD
- **Status**: active
- **Project slug**: ads-data-migration
- **Project title**: 🚚 ads-data-migration
- **Cmux group**: 🚚 ads-data-migration
- **Project workspace**: 🧭 project
  - **Tabs**: 📝 neovim, 🤖 pi
```

From each active Task's `plan.md`:

```markdown
- **Started**: YYYY-MM-DD
- **Status**: in progress
- **Project**: ads-data-migration
- **Task title**: 🧪 test-dbt-model-pipeline
- **Repository**: ads-data
- **Worktree**: /abs/path/to/repo/.worktrees/test-dbt-model-pipeline
- **Cmux workspace**: 🧪 test-dbt-model-pipeline
  - **Tabs**: 📝 neovim, 🤖 pi, 🐚 terminal
```

Rules:

- Missing `Repository` or `Worktree` means `none`.
- Missing `Cmux group` falls back to `Project title`.
- Missing `Project workspace` falls back to `🧭 project`.
- Missing `Cmux workspace` falls back to `Task title`.
- Missing Project tabs fall back to `📝 neovim, 🤖 pi`.
- Missing Task tabs fall back to `📝 neovim, 🤖 pi, 🐚 terminal`.
- Strip optional parenthetical descriptions from tab names when matching tabs.

## Procedure

1. **List active Projects.** Enumerate immediate subdirectories of
   `<PROJECTS_ROOT>/active`. Each directory with `project.md` is an active
   Project. Skip directories without `project.md` and report them.

2. **Parse Project metadata.** Extract `Project slug`, `Project title`,
   `Cmux group`, `Project workspace`, and Project tabs.

3. **Ensure the Project Group and project workspace exist.**
   - Inspect existing Groups with `cmux workspace-group list --json`.
   - If the Group title already exists, reuse it. Never recreate or disturb it.
   - If the Group is missing, create the project workspace first:
     `cmux new-workspace --name "🧭 project" --cwd <project-dir> --command "nvim project.md" --focus false`.
   - Capture the new workspace ref and create the Group from it:
     `cmux workspace-group create --name <cmux-group-title> --from <workspace-ref> --json`.
   - Never call `cmux workspace-group create` without `--from`.
   - Ensure the project workspace has Project tabs:
     - `📝 neovim`: cwd = Project folder; command = `nvim project.md`.
     - `🤖 pi`: cwd = Project folder; command = `pi`.

4. **List active Tasks for the Project.** Enumerate
   `<project-dir>/tasks/active/*/plan.md`. Ignore `tasks/upcoming` and
   `tasks/completed`.

5. **Parse Task metadata.** Extract `Status`, `Repository`, `Worktree`,
   `Cmux workspace`, and `Tabs`. Skip tasks whose `Status` is `done` or
   `completed` even if they are accidentally under `tasks/active`.

6. **Ensure task worktrees exist.** For each Task whose `Worktree` is a path:
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

7. **Ensure task Cmux Workspaces exist.**
   - If a Workspace with the same title already exists inside the Project Group,
     skip it. Never disturb a live workspace.
   - If missing, create it with the first recorded tab. For new/default tabs,
     the first tab is usually `📝 neovim` with cwd = Task folder and command
     `nvim plan.md`.
   - Add the new Workspace to the Project Group with
     `cmux workspace-group add --group <group-ref> --workspace <workspace-ref>`.
   - Use `cmux list-panes --workspace <workspace-ref>` to find its main Pane.
   - Create the remaining tabs with `cmux new-surface` and title them with
     `cmux rename-tab`.

8. **Choose each task tab's cwd and command.**
   - `📝 neovim`: cwd = Task folder; command = `nvim plan.md`.
   - `🤖 pi`: cwd = Worktree when present and healthy, otherwise Task folder;
     command = `pi`.
   - `🐚 terminal`: cwd = Worktree when present and healthy, otherwise Task
     folder; command = plain shell.
   - Historical/subagent tabs: cwd = Worktree when present and healthy,
     otherwise Task folder; command = plain shell unless metadata says otherwise.

9. **Verify.** Use `cmux workspace-group list --json` and `cmux tree --all` to
   confirm each active Project Group and active Task Workspace exists.

10. **Report.** For each Project, summarize:
    - Project Group: created / existed / skipped with reason.
    - Project workspace: created / existed.
    - Each active Task: worktree status and Cmux workspace status.

Close with the focus hint: `cmux workspace-group focus <group-ref>` for each
created or reused Project Group.

## Hard rules

- Never scan or recreate the old `Tasks` tree.
- Never open upcoming or completed tasks automatically.
- Never recreate, close, or rename a running Workspace that already exists.
- Never call `cmux workspace-group create` without `--from`.
- Never use `cmux workspace-group delete` during sync; it is destructive.
- Never run `git worktree remove`, `git branch -D`, `git reset`, or any other
  destructive git command.
- Never force-check-out a branch that is already checked out at another path.
- Do not modify `project.md` or `plan.md`; sync reads only.

## Stop conditions

- No active Projects → report nothing to do.
- Active Project has no `project.md` → skip and report.
- Active Task has no `plan.md` → skip and report.
- Worktree path's inferred repo is not a git repo → skip worktree creation for
  that Task, still create the Workspace using the Task folder as cwd.
- `Repository` is set but `dev cd <repo>` cannot resolve it → still create the
  Workspace using the Worktree or Task folder and report the inconsistency.
- Any Cmux command would disturb a running user workspace → stop and ask.
