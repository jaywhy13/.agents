---
name: retrospect
description: Run a weekly retrospective over the past week's Claude Code conversations (and meeting transcripts if reachable via MCP). Extracts lessons & feedback, decisions, open action items, recurring friction, tradeoffs, a candid "Vent" critique, and meeting-improvement notes into a dated markdown file. Use when the user says "retrospect", "weekly retro", "review my week", "what did I learn this week", or asks to look back over recent conversations/meetings.
---

# Retrospect

A weekly look-back. It harvests the past week's conversations, then synthesises seven sections into one dated markdown file — written so the lessons still make sense six months from now, after the specifics have faded.

## Workflow

1. **Harvest the week.** Run the collector to get a condensed digest of every conversation touched in the window:
   ```bash
   python3 scripts/collect_conversations.py --days 7
   ```
   (`--days N` to widen the window; `--max-chars N` to change per-message truncation.)

2. **Check for meeting transcripts.** Run `ToolSearch` with a query like `meeting transcript notes` to see if an MCP tool exposes meetings. If one exists, pull the week's transcripts through it. **If none is reachable, skip the meeting section entirely** and note that it was skipped — never block or guess.

3. **Read and synthesise.** Read the digest (and meetings). Cluster recurring themes across sessions rather than transcribing each one. Then write the seven sections below.

4. **Write the file** to `~/retrospectives/<YYYY-MM-DD>.md` (today's date; create the directory if absent). Confirm the path back to the user.

5. **Offer to persist durable items.** After writing, ask whether to push the strongest Lessons & feedback / Tradeoffs into auto-memory (`~/.claude/projects/.../memory/`). Don't do it unprompted.

## The seven sections

Write each one. If a section has nothing real, say so plainly — don't pad.

1. **Lessons & feedback** — corrections, preferences, and "how to work with me" guidance worth keeping.
2. **Decisions made** — choices reached and *why*, so they aren't relitigated.
3. **Open action items** — unfinished work and follow-ups, with enough context to resume cold.
4. **Recurring friction** — mistakes, dead-ends, and repeated confusion. Name the pattern, not just the instance.
5. **Tradeoffs we explored** — the forks in the road: each option, what it bought, what it cost, and which way we went.
6. **Meeting review** — for each meeting, where the user could have been sharper, more prepared, or more precise. (Skip if no transcripts.)
7. **Vent** — candid, critical, and challenging. Where did the user's lack of detail-orientation create rework or ambiguity? Push them toward becoming the strongest Senior Engineer they can be. Be specific and direct, not cruel. This section earns its keep by saying the uncomfortable thing.

## Writing style (applies to every section)

- **High-level first.** Lead each item with a one-line takeaway a stranger could understand, using an analogy where it helps. Then add detail *underneath* for those who want it.
- **Write for your future self.** Assume the specifics (file names, branch names, ticket numbers) will be meaningless in six months. Encode the *lesson* so the high-level framing still lands without them.
- **Cluster, don't transcribe.** Three sessions hitting the same wall is one friction item, not three.
- **No filler.** Every line should carry a takeaway, a decision, or an action.
