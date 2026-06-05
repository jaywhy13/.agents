---
name: scratchpad
description: "Per-task plan.md scratchpad with active/completed task folders. Discover or create a task folder under the user's active tasks directory, keep a living plan.md updated as work progresses, and on completion tear down the workspace — remove the worktree, delete the Zellij session, and move the folder to completed. Trigger: user says 'scratchpad', '/scratchpad', 'open the scratchpad', 'I'm done with this task', or starts a multi-step task that needs a written plan."
---

# scratchpad

Maintain a markdown plan for every multi-step task. Active work lives under
`active/`; finished work moves to `completed/`. The plan captures a metadata
header (start date, status, repository, worktree, Zellij session/panes), the
overview, task list, decisions, open questions, a rolling context snapshot,
files touched, and verification commands.

Keep the plan trustworthy enough that a fresh session (or `/scratchpad-sync`)
can resume the task and rebuild the workspace (worktree + Zellij session) from
`plan.md` alone.

## Configuration

- **Tasks root**: `/Users/jeanmark.wright/Documents/JMxShopify/Tasks`
- **Active tasks root**: `/Users/jeanmark.wright/Documents/JMxShopify/Tasks/active`
- **Completed tasks root**: `/Users/jeanmark.wright/Documents/JMxShopify/Tasks/completed`
- **Discovery window**: last 7 days
- **Plan template**: `PLAN_TEMPLATE.md` in this skill directory

## Folder layout

```
<TASKS_ROOT>/
  active/YYYY-MM-DD-kebab-readable-name/plan.md
  completed/YYYY-MM-DD-kebab-readable-name/plan.md
```

- One folder per task. Date prefix is the day the task started.
- Slug: lower-kebab-case, 3–6 words, captures the *what* not the *how*.
- Root-level task folders are legacy. When discovered, move them into `active/`
  unless their `Status` is `done` or `completed`; then move them into
  `completed/`. Never overwrite an existing destination.

## Plan metadata header

Every plan starts with a bullet block. These five fields are the source of
truth for both this skill and `/scratchpad-sync`:

```markdown
- **Started**: YYYY-MM-DD
- **Status**: in progress
- **Repository**: <repo-name>   (or `none`)
- **Worktree**: /abs/path/to/repo/.worktrees/<branch>   (or `none`)
- **Zellij session**: task-<slug>
  - **Panes**: plan, pi, code
```

Rules:

- Keep the bullet labels in bold exactly as shown — both skills parse on them.
- `Status` values: `in progress`, `blocked`, `paused`, `in review`, `done`,
  `completed`. Only `done`/`completed` move the folder to `completed/`.
- `Repository` is either `none` or the short name accepted by `dev cd`
  (e.g. `ads-data`, `ad-network-connectivity`). When set, every Zellij pane
  starts by running `dev cd <repo>` so the shell lands in the repo with the
  dev environment activated.
- `Worktree` is either `none` or an absolute path. When it is a path, the
  directory at that path must be a real git worktree; this skill creates it on
  demand (see "Worktree setup" below). Panes that have both a repo and a
  worktree run `dev cd <repo>` followed by `cd <worktree-relative-path>` so
  the shell ends up inside the worktree.
- `Zellij session` defaults to `task-<slug>`. `Panes` is a comma-separated
  list; each pane maps to one Zellij tab when the session is built.

Legacy plans use plain `Started:`/`Status:` lines and a separate
`## Zellij Sessions` table. Read those when present, but write the new bullet
format on any new plan.

## Phase 1: Discovery

Before writing anything, identify the task.

1. Ensure `active/` and `completed/` exist under `<TASKS_ROOT>`.
2. Find recent legacy folders directly under `<TASKS_ROOT>`. For each one, read
   `plan.md`, move it into the correct state folder based on `Status`, and stop
   to ask if the destination already exists.
3. List recent task folders in `active/`. Sort newest first and surface today's
   folders first.
4. Ask the user to choose one active folder or "Create a new task folder" with a
   single-select `ask` tool call.
5. If the user chooses an active folder, read `plan.md` and confirm the summary
   in one line before proceeding. Then run **Repository and worktree setup** so
   the worktree exists, run **Zellij session setup** so the session is live,
   and run **Agent todo review** before doing anything else.
6. If the user chooses "new", confirm the readable name and slug, ask the
   worktree questions (see "Repository and worktree setup"), then create
   `<TASKS_ROOT>/active/<TODAY>-<slug>/plan.md` from `PLAN_TEMPLATE.md` with
   the metadata header filled in. Immediately run **Zellij session setup** to
   bring the session up. Skip Agent todo review for fresh tasks —
   there are no open agent items yet.
7. Skip the prompt only when the user already named the task and it exact-or-fuzzy
   matches an active folder.

If the user asks to view or reopen completed work, list matching folders under
`completed/`. Viewing is read-only. Reopening requires confirmation, then move
the folder to `active/` and set `Status: in progress`.

## Agent todo review

Run this every time an existing task is opened, before any other work.

1. Read the `## Task list` → `### Agent` subsection.
2. Collect open agent items (`[ ]`, not annotated as `status: running`).
3. If there are none, say so in one line and continue.
4. Otherwise list the open agent items to the user with a single-select `ask`
   tool call:
   - One option per item: "Dispatch now"
   - Plus "Skip all" and "Pick a subset" (multi-select fallback).
5. For each item the user approves, run **Dispatching agent todos** below.
6. Items the user declines stay untouched; do not re-prompt next session
   unless they change.

The goal is alignment: the user confirms what the agent should take on this
session before the agent burns context on it.

## Dispatching agent todos

When an Agent todo is approved for execution:

1. **Prefer subagents.** Use `superpowers_dispatch` (or `subagent` for project
   agents) so the lead session's context stays clean. Dispatch one subagent
   per todo unless items obviously share state. Give each subagent the full
   task text plus the relevant paths — don't make them read the plan.
2. **Open a Zellij tab for visibility.** Add a tab to the task's Zellij
   session so the user can attach and watch the subagent's progress:

   ```sh
   zellij --session <session> action new-tab \
     --name <tab-name> --cwd <worktree-or-task-folder>
   ```

   Tab name: short, lower-kebab-case, prefixed `subagent-` (e.g.
   `subagent-refactor-foo`). If the Zellij session isn't running, fall back
   to a pure `superpowers_dispatch` (no tab) and note this in the
   annotation.
3. **Launch the work in that tab.** Send the agent's invocation to the tab,
   typically by writing the prompt with `zellij action write-chars` and a
   carriage return, or by using a small KDL layout fragment with a `command`
   line. Choose whichever fits the dispatched tool.
4. **Update the plan immediately.** Annotate the todo inline:

   ```
   - [ ] Refactor foo — tab: subagent-refactor-foo, status: running
   ```

   And append the new pane to the `**Panes**:` bullet in the metadata
   header so `/scratchpad-sync` can recreate the tab next time.
5. **Track to completion.** When the subagent reports done, flip the todo to
   `[x]` and update the annotation to `status: done`. On failure, set
   `status: blocked (<one-line reason>)` and add an Open Question if action
   is needed.

Rules:

- Never dispatch parallel agents that modify the same files.
- Never silently delete the annotation when checking off an item — it is the
  audit trail for what happened.
- Never start work on an Agent todo without explicit user approval in the
  review step above.

## Repository and worktree setup

Run this whenever opening or creating a task that touches code.

1. **Decide whether a repo applies.** Research / planning / docs-only tasks
   don't need one — set `Repository: none` and `Worktree: none` and skip the
   rest. Any task that will run code, tests, or `dev` commands should record
   a repo.
2. **Record the repository.** Ask the user for the short repo name accepted
   by `dev cd` (default: the repo containing the current working directory).
   Write it into the `**Repository**:` bullet. This drives the `dev cd <repo>`
   startup command in every Zellij pane.
3. **Decide whether a worktree applies.** Quick exploration or single-branch
   work can stay in the main checkout — set `Worktree: none` and stop here.
   Code-edit tasks that need an isolated workspace get a worktree.
4. **Default to deferring the branch.** Do not create a named branch up front.
   A fresh worktree starts **detached at `main`'s tip** so the branch name can
   reflect the actual committed work, decided once there is code to commit. Only
   create the branch now if the user explicitly names one (e.g. resuming known
   work). Sanitize any explicit branch name to a valid git ref.
5. **Build the worktree path** from the task slug: `<repo>/.worktrees/<slug>`
   (or `<repo>/.worktrees/<branch>` when an explicit branch was given). Confirm
   the absolute path with the user once before creating.
6. **Create on demand**, only when the path doesn't already exist:
   - Detached on main (default, no branch yet):
     `git -C <repo> worktree add --detach <path> main`
   - Explicit new branch: `git -C <repo> worktree add <path> -b <branch>`
   - Explicit existing local branch:
     `git -C <repo> worktree add <path> <branch>`
   - If the requested branch is checked out elsewhere, stop and ask — never
     force. (A detached worktree at `main` is always safe even when `main` is
     checked out in the primary tree.)
7. **Record** the absolute path in the `**Worktree**:` bullet. Do not record
   the bare branch name. For a detached worktree, add a sub-bullet noting it is
   detached on `main` and the branch is deferred.
8. **Verify** with `git -C <repo> worktree list` and confirm the new entry.
9. **Create the branch later, from inside the worktree**, once there is code to
   commit: `git -C <path> switch -c <branch>`. Pick the branch name to match
   the work, then update the `**Worktree**:` sub-bullet accordingly.

When opening an existing task whose `Worktree` path is missing on disk,
recreate it with the same logic. The repo root is the path with
`/.worktrees/<name>` stripped, which should match the recorded `Repository`.
If the sub-bullet says the worktree is detached / branch deferred, recreate it
detached at `main` (`git -C <repo> worktree add --detach <path> main`) rather
than inventing a branch from the path's last component.

`.worktrees/` is covered by the user's global gitignore
(`~/.config/git/ignore`), so no repo `.gitignore` changes are required.

## Zellij session setup

Bring the task's Zellij session up immediately — on new-task creation and when
opening an existing task — so the workspace is ready without a separate
`/scratchpad-sync` run. This mirrors `scratchpad-sync`'s session-building logic
for a single task.

1. **Skip if already running.** Run `zellij list-sessions --no-formatting`. If
   `<session-name>` (default `task-<slug>`) is running, leave it alone. If a
   same-named session is `EXITED`/dead, delete it first with
   `zellij delete-session <name>`.
2. **Pick the cwd.** Worktree path if set; else the repo path; else the task
   folder.
3. **Pick the pane command** from the metadata:
   - Repo + worktree: `zsh -i -c "dev cd <repo>; cd <worktree-relative-path>; exec zsh -i"`
     (`<worktree-relative-path>` is typically `.worktrees/<name>`).
   - Repo only: `zsh -i -c "dev cd <repo>; exec zsh -i"`.
   - No repo: omit the command; the pane inherits `cwd` with a plain shell.
4. **Write a KDL layout** to a scratch path with one `tab` per pane in the
   `**Panes**:` bullet, and **always** include `default_tab_template` with the
   `tab-bar` and `status-bar` plugins around `children` (otherwise tabs render
   bare). Template:

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
               args "-i" "-c" "dev cd <repo>; cd .worktrees/<name>; exec zsh -i"
           }
       }
       tab name="pi" {
           pane command="zsh" {
               args "-i" "-c" "dev cd <repo>; cd .worktrees/<name>; exec zsh -i"
           }
       }
   }
   ```

   KDL notes: each `pane` block on its own lines (no one-liners); `args` are
   positional string tokens, not space-joined; `children` sits on its own line.
5. **Create it detached** so it never steals the current terminal:
   `zellij -n <layout-path> attach --create-background <session-name>`.
6. **Verify** tabs with
   `zellij --session <session-name> action query-tab-names`, then tell the user
   the attach hint: `zellij attach <session-name>`.

## Phase 2: Live updates

Update plan.md whenever:

1. A task item is completed → flip `[ ]` to `[x]`. For agent todos, also
   update the inline annotation to `status: done`.
2. A new task item is identified → append to the right Task list subsection
   (`### Human` or `### Agent`).
3. A decision is made → append to Decisions with date and rationale.
4. A new open question surfaces → append to Open Questions.
5. A file is created/modified that is not listed → append to Files Touched.
6. Status changes → update only the `**Status**:` bullet and apply the state
   transition:
   - `in progress`, `blocked`, `paused`, or `in review` stays in `active/`.
   - `done` or `completed` runs **Task completion (teardown)**: it tears down
     the workspace and moves the whole task folder to `completed/`.
   - Reopened work moves from `completed/` to `active/` after confirmation,
     then sets `Status: in progress`.
7. The Zellij session gains, loses, renames, or repurposes a pane → update the
   `**Panes**:` bullet to match what is actually being used.
8. The task gains a repo or worktree it didn't have before → run
   **Repository and worktree setup** and write the values into
   `**Repository**:` / `**Worktree**:`.
9. A subagent is dispatched, finishes, or its status changes → update the
   inline annotation on the matching Agent todo and the `**Panes**:` bullet.

Use `edit` with small targeted edits. Preserve the user's manual edits.

## Phase 3: Context syncing

Keep the plan a faithful, resumable record of the task. The goal: someone (or a
fresh agent session) can read `plan.md` and pick up exactly where work stopped.

Sync the `## Context Snapshot` section whenever:

1. A discussion reaches a natural conclusion or decision point — summarize what
   was discussed, what was decided, and the immediate next step.
2. The task is about to pause, the session is wrapping up, or the user steps
   away — leave a self-contained summary so the next session needs no replay.
3. Significant new understanding is reached (a discovery, a changed direction,
   a resolved unknown).

When syncing context:

- Write the snapshot so it stands alone: where things are, what just happened,
  and what to do next. Assume the reader has not seen the conversation.
- Keep todos in sync at the same time: flip completed items to `[x]`, append
  newly identified items, and remove items that are no longer relevant (note
  the removal reason in Decisions if it is non-obvious).
- Move resolved Open Questions into Decisions; add newly surfaced ones.
- Refresh, don't pile up: the Context Snapshot should describe the *current*
  state, not a chronological transcript. Replace stale wording. Keep it terse.
- This is the one section where rewriting (not just appending) is expected, so
  the snapshot stays accurate. Decisions, Task list history, and Files Touched
  remain append-only.

## Moving task folders

- Create the destination state folder first if needed.
- Move the whole task directory with `mv`; do not copy only `plan.md`.
- If the destination path exists, stop and ask; never overwrite or merge.
- After a move, use the new `plan.md` path for the rest of the session.

## Task completion (teardown)

Run this when the user confirms a task is finished — "done", "I'm done with
this task", "close out this task", "finish this one". A finished task should
leave nothing running: the worktree is removed, the Zellij session is deleted,
and the folder lands in `completed/`. Treat the done confirmation as the
explicit authorization to remove the worktree — but never destroy uncommitted
or unpushed work without asking.

Do the steps in this order. Verify safety first, tear down running resources
next, and move the folder **last** so the plan stays in place if teardown
stops early.

1. **Confirm intent.** Only proceed on an explicit done confirmation, never on
   a guess. Restate the task name in one line so the right task is being closed.
2. **Set the status.** Update the `**Status**:` bullet to `done` before any
   teardown, so a plan read mid-teardown reflects the decision.
3. **Tear down the worktree** — only if `**Worktree**:` is a path that exists on
   disk (skip cleanly for `none` or a missing path):
   - Guard against losing work. Check for uncommitted changes with
     `git -C <path> status --porcelain`; if it prints anything, **stop** and
     ask whether to commit, keep, or discard. Do not remove the worktree.
   - Check for unpushed commits: `git -C <path> log --branches --not --remotes
     --oneline` (or compare the worktree branch against its upstream). If
     commits would be lost, warn and ask before removing.
   - When clean (or the user explicitly approves discarding), remove it:
     `git -C <repo> worktree remove <path>`. Use `--force` only when the user
     has explicitly approved discarding the changes surfaced above.
   - Tidy admin state: `git -C <repo> worktree prune`.
   - Leave the branch alone. Never `git branch -D` unless the user asks; a
     merged or pushed branch is theirs to keep.
4. **Delete the Zellij session** named in `**Zellij session**:` (default
   `task-<slug>`). Deleting the session disposes of every pane/subagent tab at
   once:
   - `zellij delete-session --force <session-name>` (the `--force` flag also
     kills it if it is still running).
   - Verify it is gone from `zellij list-sessions --no-formatting`.
5. **Move the folder** to `completed/` using **Moving task folders** below.
   Do this only after teardown succeeded (or the user chose to complete the
   task while keeping the worktree).
6. **Report** in three lines: worktree (removed / skipped — reason), Zellij
   session (deleted / not running), folder (moved to `completed/<name>`).

After teardown, stop auto-updating the plan unless the task is reopened.
If teardown halts at the safety guard, leave the folder in `active/` and the
session running so nothing is lost; resume once the user resolves the work.

## Execution rule

Before executing implementation work from the task list, load and follow the
`tdd-implementation` skill from `~/.agents/skills/tdd-implementation/SKILL.md`.
Do not write code or tests outside that loop.

## Hard rules

- Never auto-create a task folder without explicit confirmation or an unambiguous discovery match.
- Never overwrite plan.md content; only append, check off items, or update the metadata bullets — except the `## Context Snapshot` section, which is refreshed to stay current.
- Never delete Decisions, Files Touched, or completed Task list history.
- Never overwrite or merge task folders during active/completed moves.
- Never run `git worktree remove` outside the **Task completion (teardown)** flow. The done confirmation is the only automatic trigger, and even then never remove a worktree with uncommitted or unpushed work without asking first.
- Never `git branch -D` a task's branch automatically — branch deletion is always an explicit user request.
- Do not stage or commit task folders or plan.md unless explicitly asked.
- Keep entries terse, factual, and dated. Avoid speculation.

## Stop conditions

- "Stop tracking" or "close the scratchpad" → set `Status: paused`; keep it in `active/` unless done is confirmed.
- User confirms the task is done → run **Task completion (teardown)**: remove the worktree (after the uncommitted/unpushed safety check), delete the Zellij session, move the folder to `completed/`, and stop auto-updating unless reopened.
- New unrelated task started → run Phase 1 before touching any plan.md.
