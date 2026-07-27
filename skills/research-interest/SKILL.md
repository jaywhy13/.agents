---
name: research-interest
description: "Researches one Organized interest across its named Slack channels and linked first-party sources, producing a dated evidence-backed update without saving or changing anything. Use when the user asks what changed around one tracked interest, requests an interest briefing, or when an interests workflow needs one read-only research record."
---

# Research Interest

Research one interest and leave a reusable, evidence-backed update in the current conversation.

## Read-only boundary

This skill only reads. Do not post or react in Slack, change the interest, publish to Organized, write a document, update an issue, or modify source code. A caller that wants persistence must handle approval and publishing outside this skill.

## Input

Require one unambiguous interest with:

- `id` when available;
- `title` and `summary`;
- `team_name` when available;
- `slack_channels`, which may be empty; and
- an optional research window.

If only an identifier or title is supplied, read the matching Organized interest first. Ask rather than guess when multiple records match. Default to the last 24 hours; broaden to 7 days only when the first pass has too little signal, and disclose the change.

## Research from leads to evidence

1. Turn the title and summary into two to five strong search phrases. Keep established project names and domain terms; discard generic words.
2. Search each named Slack channel with explicit date bounds. Search the exact topic and the strong phrases separately so one long query does not hide relevant results.
3. Fetch high-signal messages and full threads. Capture decisions, scope changes, launches, blockers, risks, owners, dates, and explicit asks.
4. Follow first-party links from those threads when they affect the update: GitHub pull requests or issues, Vault or GSD pages, internal documentation, Google documents, dashboards, and source code. Use the matching read/search tools. Treat Slack as a lead; verify durable claims at the owning source when practical.
5. If there are no channels, use the interest summary to search relevant first-party sources and state that Slack coverage was unavailable.
6. Do not turn absence into “nothing happened.” Say what was searched and that no meaningful evidence was found in that coverage.

Prefer sources from the requested window. A recently discussed older decision is context, not a new change. Preserve exact dates and links, distinguish fact from interpretation, and name the owner only when the source does.

## Return

```text
INTEREST_RESEARCH
interest_id: <id or unavailable>
interest: <title>
team: <team or unavailable>
researched_at: <absolute timestamp>
window: <absolute start and end>
what_changed:
- <change — why it matters — source>
decisions:
- <decision, owner, and date — source>
risks_or_blockers:
- <risk/blocker and current owner — source>
actions_for_user:
- <explicit or clearly labelled suggested action>
people:
- <person — role in this update>
sources:
- <title — URL — source date>
gaps:
- <searched coverage, ambiguity, or []>
```

Keep this block in the same session. Skills are instructions, not callable functions; do not claim a separate skill process returned it, and do not save it from this read-only skill.
