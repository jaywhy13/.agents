---
name: summarize-work-status
description: "Summarizes current projects, tasks, todos, blockers, and next moves from Organized Work and local work plans without changing either source. Use when the user asks what they are working on, what is blocked, or for a read-only work-status roundup."
---

# Summarize Work Status

Explain current work by outcome, present state, blocker, and next concrete move.

## Read-only boundary

This skill only reads. Do not edit local work-plan files or create, update, complete, archive, reorder, or delete Organized Work records. Do not run worktree commands.

## Select the work

- If `WORK_PROJECT_ID`, `WORK_TASK_ID`, or `WORK_TODO_ID` is set, summarize that selected hierarchy first.
- Otherwise summarize active and blocked work, not every historical record.
- Honor an explicit project, task, todo, or date window from the user.

## Gather Organized context

Pi skills are instruction documents, not callable functions. In this same session, load and follow the relevant registered instructions:

- `/skill:organized-project` for the selected project;
- `/skill:organized-task` for the selected task;
- `/skill:organized-todo` for the selected todo.

Retain their background blocks in the conversation. Do not describe these skills as function calls, subprocesses, or cross-session return values. For a broader roundup, use read-only Quick collection queries against `organized` / `work_resources`, scope them to the current owner, require schema version `1`, and keep Project → Task → Todo relationships explicit.

## Read local work plans

1. Use `/Users/jeanmark.wright/Documents/JMxShopify/Projects` as the current project root.
2. Read relevant `project.md` and `tasks/**/plan.md` files. Use their stated status and task lists rather than directory names alone.
3. Capture the outcome, completed evidence, unchecked next steps, blockers, decisions, and linked artifacts. Treat `general` as low priority unless it contains an urgent or blocked item.
4. When Organized and local work plans disagree, show both timestamps/states and label the discrepancy. Do not silently choose one.

## Return

```text
WORK_STATUS
as_of: <absolute timestamp>
summary: <one sentence about the work portfolio>
active:
- <project / task — intended outcome — evidence of current state → next move>
blocked:
- <project / task — blocker — owner or dependency → smallest unblock step>
waiting:
- <project / task — review, decision, or external event>
recently_completed:
- <outcome and linked evidence, only when relevant to the requested window>
source_discrepancies:
- <Organized versus local work-plan mismatch; [] when none>
source_issues:
- <failure or coverage caveat; [] when none>
```

Keep uncertainty visible. An unchecked item is a planned move, not proof that it is the current priority.
