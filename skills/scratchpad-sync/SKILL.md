---
name: scratchpad-sync
description: "Recreate worktrees and Zellij sessions for every active scratchpad task. Reads each task folder under the active tasks directory, parses its plan.md metadata header, ensures the git worktree exists, and creates a detached Zellij session per task with the recorded panes. Trigger: user says 'scratchpad-sync', '/scratchpad-sync', 'rebuild my sessions', or wants to restore task workspaces after a disconnect/restart."
---

# scratchpad-sync

Rebuild the workspace from the scratchpad. For each active task folder this:

1. Ensures the git worktree recorded in the plan exists on disk; creates it if
   missing.
2. Creates a detached Zellij session whose tabs match the panes recorded in the
   plan's metadata header.

Run it after a reboot, a Zellij crash, a fresh checkout, or any time the
session list / worktree state no longer reflects the active tasks.

This skill is the recreate side of the `scratchpad` skill, which records
worktree paths and pane layouts as work happens.

## Configuration

- **Active tasks root**: `/Users/jeanmark.wright/Documents/JMxShopify/Tasks/active`
- **Layout scratch dir**: `/tmp/scratchpad-sync-layouts` (generated KDL, safe to delete)

## Plan metadata it reads

The bullet block at the top of each `plan.md`:

```markdown
- **Started**: YYYY-MM-DD
- **Status**: in progress
- **Repository**: <repo-name>   (or `none`)
- **Worktree**: /abs/path/to/repo/.worktrees/<branch>   (or `none`)
- **Zellij session**: task-<slug>
  - **Panes**: plan, pi, code
```

If a plan uses the legacy format (plain `Status:` line plus a
`## Zellij Sessions` table), parse that instead. Treat missing `Repository`
or `Worktree` bullets as `none`.

## Naming convention

- Session name comes from the `**Zellij session**:` bullet when present.
- Otherwise default to `task-<slug>`, where `<slug>` is the folder name with
  the leading `YYYY-MM-DD-` date prefix removed.
  - `2026-05-25-ads-data-migration` → `task-ads-data-migration`
- Folders without a date prefix use the folder name verbatim
  (`general` → `general`).

## Procedure

1. **List active tasks.** Enumerate immediate subdirectories of the active
   tasks root. Each directory with a `plan.md` is a task. Skip directories
   whose `plan.md` `Status` is `done`/`completed` (those belong in
   `completed/`).

2. **Parse the metadata header.** For each `plan.md`, read the bullet block at
   the top. Extract:
   - `Status` — to filter out done tasks.
   - `Repository` — short repo name accepted by `dev cd`, or `none`.
   - `Worktree` — absolute path or `none`.
   - `Zellij session` — session name.
   - `Panes` — comma-separated list of pane names; strip any parenthetical
     descriptions (`plan (todos)` → `plan`).

   If a `## Zellij Sessions` section exists and the top metadata is missing,
   fall back to the table format used by older tasks. Each `### Session:` block
   becomes one session; tab names in the markdown table become panes.

   If there is no session info anywhere, fall back to a single pane named
   `plan` and the derived session name.

3. **Ensure the worktree exists.** For each task whose `Worktree` is a path
   (not `none`):
   - If the path exists and `git -C <path> rev-parse --is-inside-work-tree`
     succeeds → skip, worktree is healthy.
   - Otherwise infer:
     - `branch` = last path component
     - `repo` = path with `/.worktrees/<branch>` stripped (must itself be a
       git repo; if not, report the inconsistency and skip).
   - Verify the branch's checkout state with
     `git -C <repo> worktree list --porcelain`.
     - Branch already checked out at a different path → report and skip; do
       not move or duplicate worktrees.
     - Branch exists locally but not checked out →
       `git -C <repo> worktree add <path> <branch>`.
     - Branch does not exist →
       `git -C <repo> worktree add <path> -b <branch>`.
   - Report each worktree as: created / existed / skipped (with reason).

4. **Check what already exists in Zellij.** Run
   `zellij list-sessions --no-formatting`.
   - If a session with the target name is already **running** (not `EXITED`),
     skip it — never disturb a live session.
   - If a same-named session exists but is `EXITED`/dead, delete it first with
     `zellij delete-session <name>` so the new one can be created cleanly.

5. **Generate a layout per session.** Write a KDL layout to the scratch dir
   with one `tab` per recorded pane.

   Choose `cwd` per task:
   - If the task has a usable worktree → `cwd` is the worktree path.
   - Else if the task has a repo but no worktree → `cwd` is the repo path
     (resolved by checking for `<repo-path>` registered with `dev`).
   - Otherwise → `cwd` is the task folder.

   Choose the pane command per task:
   - **Repo + worktree**: launch each pane with
     `zsh -i -c "dev cd <repo>; cd <worktree-relative-path>; exec zsh -i"`
     so the shell activates the dev environment and lands inside the
     worktree. `<worktree-relative-path>` is the worktree path with the repo
     path prefix stripped (typically `.worktrees/<branch>`).
   - **Repo only, no worktree**: launch each pane with
     `zsh -i -c "dev cd <repo>; exec zsh -i"`.
   - **No repo**: omit the pane command; the pane inherits the layout's
     `cwd` and starts a plain interactive shell.

   **Always include `default_tab_template`** so every tab gets the
   `tab-bar` plugin at the top and the `status-bar` plugin at the bottom.
   Launching a session with `zellij -n <layout>` fully replaces
   `~/.config/zellij/layouts/default.kdl`, so the bars must be baked into
   every generated layout — otherwise tabs render bare. See
   `concepts/zellij-default-tab-template.md` in the wiki for background.

   Template (repo + worktree case):

   ```kdl
   layout {
       default_tab_template {
           pane size=1 borderless=true {
               plugin location="tab-bar"
           }
           children
           pane size=1 borderless=true {
               plugin location="status-bar"
           }
       }
       cwd "/abs/path/to/worktree"
       tab name="plan" {
           pane command="zsh" {
               args "-i" "-c" "dev cd <repo>; cd .worktrees/<branch>; exec zsh -i"
           }
       }
       tab name="pi" {
           pane command="zsh" {
               args "-i" "-c" "dev cd <repo>; cd .worktrees/<branch>; exec zsh -i"
           }
       }
   }
   ```

   KDL notes:
   - Each `pane` block must be on its own line(s); no `{ pane }` one-liners.
   - `args` values are positional strings, one per token — do not collapse
     them into a single space-joined string.
   - The `default_tab_template` block must use the `children` keyword on its
     own line — that's where each tab's actual panes are inserted.

6. **Create the detached session.** For each session:

   ```sh
   zellij -n <layout-path> attach --create-background <session-name>
   ```

   `-n` forces a new session from the layout; `attach --create-background`
   (`-b`) leaves it detached so nothing steals the current terminal.

7. **Verify.** Confirm tabs with:

   ```sh
   zellij --session <session-name> action query-tab-names
   ```

8. **Report.** Summarize per task with two lines:
   - Worktree: created / existed / skipped (reason).
   - Zellij: created / skipped (already running) / rebuilt (replaced dead
     session), with the pane list.

   Close with the attach hint: `zellij attach <session-name>`.

## Hard rules

- Never attach in the foreground or detach the user's current session — always
  use `--create-background`.
- Never kill or recreate a session that is currently running.
- Never run `git worktree remove`, `git branch -D`, or `git reset` — this skill
  only creates worktrees on demand.
- Never force-check-out a branch that is already checked out at another path.
- Do not modify any `plan.md`; this skill only reads the scratchpad. Recording
  worktrees and panes is the `scratchpad` skill's job.
- Only act on folders under the active tasks root; ignore `completed/`.
- Generated layout files are disposable; regenerate rather than reuse stale
  ones.

## Stop conditions

- No active task folders → report nothing to do.
- A folder has no `plan.md` → skip it and note it in the report.
- A worktree path's inferred repo isn't a git repo → skip the worktree step
  for that task (still build the Zellij session, with `cwd` = task folder) and
  note the inconsistency.
- `Repository` is set but `dev cd <repo>` cannot resolve it → still build the
  session, but launch panes with a plain shell (no `dev cd`) and note the
  inconsistency.
