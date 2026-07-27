---
name: organized-interests
description: "Reads the Organized interest radar, researches selected topics, and optionally publishes approved dated interest-research posts through the established Organized publisher. Use when the user asks for an interest radar, research across tracked interests, or to save interest research in Organized."
---

# Organized Interests

Turn the manually maintained Organized interest radar into current research while keeping reading separate from optional publishing.

## Load interests

Run the existing read-only collector with `bash`:

```bash
node /Users/jeanmark.wright/code/ai-workflows/morning-brief/collect-organized-interests.mjs
```

It prints normalized interest records from `https://organized.quick.shopify.io` with identifiers, titles, summaries, teams, Slack channels, update times, and search text. If it fails, report the error and stop rather than using remembered interests. If it returns none, say that no interests are configured.

Honor a requested identifier or title. Ask when a title matches more than one record. Otherwise research every returned interest, subject to any caller-supplied limit.

## Research in the same session

Pi skills are instructions, not callable functions. Load and follow the registered `/skill:research-interest` instructions in this same session, once per selected interest, and keep every `INTEREST_RESEARCH` block in the conversation. Do not invoke it as a tool, claim a function return value, or start another session unless the user explicitly asks for delegation.

Synthesize the blocks into:

```text
ORGANIZED_INTERESTS
as_of: <absolute timestamp>
high_signal:
- <interest — most important change → action, if any>
quiet_or_uncertain:
- <interest — no meaningful evidence found and searched coverage>
source_issues:
- <failure or gap; [] when none>
```

Reading and research must not change Slack, Organized, GitHub, documents, or local files.

## Optional dated persistence

Persist only when the user asks to save, publish, or record the research, or when the calling workflow explicitly pre-authorizes that write.

Organized currently has no documented `interest_research` collection or exact interest-research write application programming interface. Do not invent a collection, endpoint, or schema. The safe available representation is one dated Organized **post** per interest:

```text
title: Interest research — <interest title> — <YYYY-MM-DD>
summary: <one-sentence material change or “No meaningful change found in the searched window.”>
body: <Markdown rendering of the exact INTEREST_RESEARCH block>
tags: [interest-research, interests, <normalized team/topic tag when useful>]
```

1. Query recent Organized `posts` read-only and avoid silently duplicating the exact title/date.
2. Show the exact title, summary, body, and tags. Ask for approval unless the user or caller already approved publishing these exact fields.
3. Load and follow `/skill:organized-post` in this same session with the approved fields. It is the established publisher; do not reproduce its write mechanism here.
4. Report its post identifier and Organized link. If `/skill:organized-post` or its authenticated Quick mechanism is unavailable, return the proposed fields and a clear not-saved status. Do not fall back to a guessed HTTP write.

Never edit the source interest as part of saving research. A post records what was learned on a date; the interest remains the durable topic definition.
