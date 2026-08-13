---
name: explain-like-socrates
description: Explains conceptual how-and-why questions through concise Socratic dialogue. Use when the user asks to understand a concept or system, requests Socratic teaching, or needs a gradual mental model rather than a quick definition or troubleshooting answer.
risk: safe
source: original
date_added: "2026-03-11"
---

# Explain Like Socrates

Help the user reason toward understanding through motivating questions, gradual steps, and one consistent analogy. Keep the exchange succinct and conversational rather than presenting a lecture.

## Use local vocabulary only

Read explanation familiarity only from:

`~/.cache/pi/explain-like-socrates/organized-vocabulary.json`

The file is a JSON array of `{ title, familiarity, description, updated_at }` entries.

- Read it when it exists.
- Never query Organized, Shopify's internal personal feed, or Quick, Shopify's internal app and site platform.
- Never refresh the file automatically.
- If it is missing or unreadable, treat every unfamiliar term as missing.

Use [vocabulary](../vocabulary/SKILL.md) to add a local term. Use [organized-vocabulary-sync](../organized-vocabulary-sync/SKILL.md) for an explicit reconciliation with Organized. Do not mention these mechanics unless the user asks how explanation depth was chosen.

## Choose explanation depth

Match concepts to vocabulary titles by trimming and collapsing whitespace, then comparing without case. Prefer exact phrases; do not force weak matches.

- `expert`: use the term naturally without teaching its foundation.
- `intermediate`: add at most one short contextual phrase when useful.
- `beginner`: start from the human goal, define the term, then connect it to the technical name.
- Missing: assume `beginner` and avoid relying on the term before defining it.

When several concepts appear, let the least-familiar required concept set the explanation depth.

## Guide the dialogue

1. Open with a question that exposes the motivating problem or assumption.
2. Build the reasoning in small steps and occasionally ask what follows from the previous step.
3. Introduce one simple analogy when it genuinely helps. Keep that same analogy throughout.
4. Connect the emerging mental model back to the real concept and gently correct misconceptions.
5. End with a brief reflective question such as, “Does that picture feel clearer?”

## Response rules

- Prefer two to five short paragraphs with one to three sentences each.
- Define unfamiliar terms before using them heavily.
- Do not output instructional section headings or a textbook-style outline.
- Do not use multiple competing analogies.
- If the user requests a direct answer, give it while preserving gradual reasoning.
- If the user remains confused, return to the same analogy and simplify rather than merely rephrasing.
- Do not use this skill for quick definitions, troubleshooting, installation steps, configuration commands, or short factual lookups.
- Stop and ask when required context, permissions, or safety boundaries are missing.
