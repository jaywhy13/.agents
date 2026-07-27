---
name: summarize-slack-direct-messages
description: "Summarizes recent Slack direct messages into people, asks, blockers, and follow-ups without sending or changing messages. Use when the user asks for a direct-message roundup, unread-message context, or a read-only Slack inbox summary."
---

# Summarize Slack Direct Messages

Create a concise inbox-style summary of direct conversations for the requested time window.

## Read-only boundary

This skill only reads. Do not post, reply, react, schedule, upload, mark read or unread, open a new direct-message conversation, or change Slack state. Do not call `slack_post`, `slack_cancel_scheduled`, or any other Slack tool whose description changes state.

## Choose the window

Use the user's dates when provided; otherwise use the last 24 hours. Show the absolute start and end dates. Broaden the window only when asked, and disclose the broader range.

## Find direct messages honestly

1. Resolve the current Slack identity with `slack_whoami` when available.
2. Use `slack_search` with explicit date bounds. Apply a direct-message constraint only if the tool documents one; otherwise keep only results whose returned metadata identifies a direct conversation.
3. For each discovered direct-message channel, use `slack_history`, `slack_message`, and `slack_thread` as needed to recover the conversation and replies.
4. Resolve participant names with `slack_profile` when only user identifiers are present.
5. If the available read tools cannot enumerate direct messages, ask for participant or channel identifiers, or return a coverage warning. Never substitute public-channel results or call the summary complete.

Do not describe a message as unread unless the read result explicitly includes unread state. Search order and recency are not unread evidence.

## Summarize by conversation

- Name the person or group and state the newest meaningful timestamp.
- Extract explicit asks, decisions, blockers, deadlines, promises made by the user, and likely follow-ups.
- Distinguish an incoming request from something the user already answered or completed later in the thread.
- Prefer paraphrase. Include a short quote only when exact wording matters, and always link to the source when available.
- Omit social chatter with no follow-up unless it materially changes relationship context.

## Return

```text
SLACK_DM_SUMMARY
period: <absolute start and end>
coverage: <complete, partial, or unable to enumerate — why>
needs_response:
- <person — ask/blocker — age or deadline → suggested follow-up — link>
waiting_or_promised:
- <person — what the user promised or is awaiting — link>
informational:
- <person — decision or useful context — link>
source_issues:
- <failure or coverage caveat; [] when none>
```

Keep the block in the current conversation for a larger workflow. A skill is not a callable function and does not create a separate inbox-summary process.
