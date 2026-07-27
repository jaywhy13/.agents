---
name: morning-brief
description: Coordinates five parallel researchers, composes the next-workday brief and spoken script, renders audio, and immediately publishes to Organized. Use when the runner or user requests JM's morning brief.
compatibility: Requires the enabled Agent Teams Pi extension and its team_spawn, team_message, team_request_shutdown, and team_cleanup tools.
---

# Morning Brief

Act as the Agent Teams **lead**. Use the target workday supplied by the trusted runner, normally `MORNING_BRIEF_TARGET_DATE`. Never infer, replace, or reschedule that target.

## Preflight

- Require the Agent Teams extension tools named in `compatibility`. If any is absent, stop with a clear error; do not replace the team with sequential research.
- Set one absolute fan-in deadline from runner context. If none is supplied, use ten minutes after the fifth spawn.
- A skill is instructions, not a callable function. Every worker must use `read` on its assigned absolute `SKILL.md` path before researching.

## Spawn all five researchers

Call `team_spawn` for all five before waiting. Omit `model` so workers inherit the lead model.

| Worker | First instructions to read |
|---|---|
| `calendar-researcher` | `/Users/jeanmark.wright/.pi/agent/skills/summarize-calendar/SKILL.md` |
| `pr-researcher` | `/Users/jeanmark.wright/.pi/agent/skills/summarize-pr-status/SKILL.md` |
| `direct-message-researcher` | `/Users/jeanmark.wright/.pi/agent/skills/summarize-slack-direct-messages/SKILL.md` |
| `work-status-researcher` | `/Users/jeanmark.wright/.pi/agent/skills/summarize-work-status/SKILL.md` |
| `interest-researcher` | `/Users/jeanmark.wright/.pi/agent/skills/organized-interests/SKILL.md`, then `/Users/jeanmark.wright/.pi/agent/skills/research-interest/SKILL.md` when those instructions require it |

Give each worker the runner target and only its assigned source. Every task must require the worker to:

1. read its own global skill file first and follow it;
2. research independently without editing or composing the morning brief;
3. perform no Slack writes; only `interest-researcher` may make the narrow Organized research-record writes allowed by its skill;
4. send exactly one completion report with `team_message` to `team_lead`, beginning `[COMPLETED] ResearchDossierV1`, followed by:

```text
source, target_date, collected_at, status, warnings, facts[], evidence_links[]
```

The worker must send that protocol through `team_message`, not treat the `team_spawn` result as research output. It must then await lead shutdown without sending a second completion summary.

## Fan in without duplicating research

- Completion messages are the fan-in mechanism. Do not poll `team_status`, inspect panes, or repeat delegated research.
- Validate the prefix, version, target date, and required fields. Ask the same worker to correct an invalid report only if the deadline permits.
- After each valid dossier, call `team_request_shutdown` for that worker.
- At the deadline, add a short source warning for every missing or invalid dossier and call `team_request_shutdown` for each affected worker. Continue with partial sources.
- After all reports arrive or the deadline passes, call `team_cleanup` once. Do not wait indefinitely or leave a team behind.

## Compose from the dossiers

Use only grounded dossier facts. Produce:

1. a concise, **emoji-rich** Markdown body in clear work English with target-day shape, calendar, direct messages, interest radar, pull requests, active work, suggested focus, and source warnings;
2. a separate plain spoken script with the same material facts but conversational flow; never put the transcript in the Markdown body;
3. an explicit protected-facts list covering every name, date, time, number, link, ask, decision, commitment, owner, and negation in the spoken script.

### Emoji-rich written brief rules

Make the written post visibly lively and easy to scan. This is a requirement, not optional decoration:

- Start with `# 🌅 Morning Brief — <target date>`.
- Use an emoji in every major heading, such as `🧭 Day shape`, `📅 Calendar`, `💬 Direct messages`, `🛰️ Interest radar`, `🔀 Pull requests`, `🧰 Active work`, `🎯 Suggested focus`, and `⚠️ Source warnings`.
- Start each substantive bullet with a meaningful signal emoji: use `🔴` for a blocker or urgent risk, `🟡` for a decision or follow-up, `🟢` for clear/complete work, `⏳` for waiting, `✅` for completed work, and `➡️` for the next action.
- Give every focus item a numbered emoji such as `1️⃣`, `2️⃣`, and `3️⃣`.
- Use occasional emphasis emojis inside dense sections when they clarify priority, but never replace a name, fact, link, or sentence with an unexplained emoji.
- Keep the spoken script natural prose; emojis are for the written post, not text-to-speech.

Refer to the user as JM. Say when nothing relevant was found and never invent missing details.

## Style, audio, and immediate publication

1. Read `/Users/jeanmark.wright/.pi/agent/skills/jamaicanize/SKILL.md` and follow it in this lead context using the plain script and protected facts. If its check fails, retain the plain script exactly.
2. Read `/Users/jeanmark.wright/.pi/agent/skills/tts/SKILL.md` and follow it using the approved script. If audio fails, keep going without an audio path.
3. Read `/Users/jeanmark.wright/.pi/agent/skills/organized-morning-brief/SKILL.md` and follow it using the Markdown body and optional audio path. This is immediate publication for the runner-provided target, not a scheduling step.

Never use a generic Organized publisher or any Slack write tool as a fallback. Finish with the post identifier or URL, source statuses and warnings, voice style status, and audio status.
