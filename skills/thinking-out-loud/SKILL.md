---
name: thinking-out-loud
description: Transforms rough exploratory thoughts into polished reusable fields while preserving uncertainty and voice. Use when the user invokes /thinking-out-loud, says "thinking out loud," or wants raw reflections structured without sending them anywhere.
---

# Thinking Out Loud

Turn rough thoughts into a clear, reusable draft. Return only `title`, `summary`, `body`, and `tags`; do not take any external action.

## Inputs

- Require the user's raw thought text. If it is missing, ask for it.
- Treat the source as authoritative. Do not add evidence, conclusions, confidence, or intent that the user did not express.
- Preserve uncertainty, nuance, exploratory framing, and first-person voice. Improve structure and readability without over-resolving an open thought.
- If the source names people, contains sensitive details, or could make exploration sound like a firm decision, flag the risk and ask how to handle it before finalizing. Do not silently erase nuance or identifying details.

## Output fields

- `title`: a short headline that frames the thought as exploration rather than certainty.
- `summary`: one sentence stating the tension, question, or idea without implying a resolution.
- `body`: polished Markdown in the user's voice, with sparse, helpful emoji.
- `tags`: `thoughts` first, followed by 1-5 relevant lowercase slug tags inferred from the source.

Return the exact fields in this shape:

```yaml
title: "..."
summary: "..."
body: |-
  ## 💭 The thought

  ...
tags:
  - thoughts
  - topic-a
```

## Body guidance

Use only the sections that fit the source:

```md
## 💭 The thought

[Clear version of the idea or tension.]

## 🧭 Why I’m circling it

[Context, motivation, or trade-off from the user's notes.]

## 🧪 What I’m wondering

[Open questions or next angles, only when present or strongly implied.]
```

Keep emoji sparse: at most one purposeful emoji in a heading and none added merely as decoration. Keep the result honest, readable, and exploratory.

## Tag guidance

Choose topic nouns supported by the source, such as `strategy`, `product`, `architecture`, `teamwork`, `leadership`, `writing`, `learning`, `workflow`, `ai`, `systems`, `communication`, or `shopify`. Lowercase and hyphenate multiword tags. Deduplicate tags. Do not add joke tags or unsupported broad tags.
