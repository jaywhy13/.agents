---
name: auto-improve
description: Reviews the current conversation for corrections, clarity requests, pushback, and frustration, extracts generalizable lessons, and proposes edits to ~/.agents/AGENTS.md. Use when invoked via /auto-improve, when a session reaches a natural conclusion, or when the Stop hook nudges a self-review. Trigger on "review this conversation", "what did you learn", "improve how you work with me", "update AGENTS.md".
---

# Auto-Improve

Mine the **current conversation** for friction, turn it into durable, generalizable preferences, and propose edits to `~/.agents/AGENTS.md`. Always propose first; only write after the user approves.

## When to run

- Manually via `/auto-improve`, or when a task/session reaches a conclusion.
- When the Stop hook injects a nudge (see [hook setup](#automatic-trigger-stop-hook)).
- Skip trivial sessions (a single Q&A with no friction). Say so and stop.

## Workflow

1. **Scan the whole conversation** from first user message to the conclusion. Look aggressively for these signals:
   - **Corrections** — "no", "that's wrong", "not what I meant", redo/revert/undo requests, "do it this way instead".
   - **Clarity requests** — "what do you mean", "I don't understand", re-asking the same question, asking you to rephrase.
   - **Pushback** — "why did you…", "I disagree", challenging an assumption you made.
   - **Frustration** — terse replies, "again?", "I already said", repeated instructions, exasperation.
   - **Repeated instructions** — anything the user had to say more than once. These are the highest-value lessons.

2. **For each signal, extract the lesson.** Write the root cause, not the surface complaint. "User re-explained the layering twice" → "I default to fat models; user wants service-layer separation."

3. **Generalize and filter.** For each lesson decide:
   - **Generalizable preference** → candidate for AGENTS.md (how I should *always* behave).
   - **Project/one-off detail** → NOT for AGENTS.md (belongs in project memory or CLAUDE.md). Drop it and say why.
   - Strip secrets, file paths, and project-specific names. AGENTS.md holds global behaviour, not facts about one repo.

4. **Reconcile with existing AGENTS.md.** Read `~/.agents/AGENTS.md` first. For each candidate:
   - **Already covered** → skip, or propose sharpening the wording if the lesson reveals a gap.
   - **Conflicts** with existing guidance → flag the conflict explicitly; let the user resolve.
   - **New** → choose the right section (Defaults, Teaching Style, Code Conventions, etc.) or propose a new heading.

5. **Match the file's voice.** Prose, second-person ("you"), a short **Why** rationale, no abbreviations (the user's own rule — write "Finite State Machine", not "FSM"). Keep entries tight.

6. **Propose, then write.** Present a compact table — `signal → lesson → proposed AGENTS.md change` — followed by the exact diff for each edit. Wait for approval. On approval, apply with the Edit tool. On rejection of any item, drop it without argument.

## Output format

```
## Signals found
| Signal (quote) | Root-cause lesson | Generalizable? |
| ... | ... | yes/no — reason |

## Proposed AGENTS.md edits
<section> — <add | sharpen | conflict>
  <exact old → new text>

(N candidates dropped as project-specific: ...)
```

Then: *"Approve all, pick a subset, or edit the wording?"*

## Automatic trigger (Stop hook)

`scripts/detect_review_signals.py` scans the session transcript for friction keywords and, on substantive sessions, nudges Claude to run this review before stopping. It fires at most once per session and never loops. To enable, add a `Stop` hook in `settings.json` that runs the script — see [scripts/detect_review_signals.py](scripts/detect_review_signals.py) for the contract.
