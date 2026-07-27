---
name: today-i-learned
description: Transforms rough learning notes into polished, reusable fields. Use when the user invokes /today-i-learned, says "today I learned" or "TIL", or asks to polish a learning note.
---

# Today I Learned

Turn rough learning notes into four reusable fields without changing their meaning.

## Inputs

- Require the raw learning notes. If they are missing, ask for them.
- Preserve the user's meaning and first-person voice. Improve clarity and structure, but never invent facts, context, or follow-up actions.
- If the notes identify people or may contain sensitive information, pause and ask what may be retained. Do not expose or infer confidential details.

## Output

Return exactly these fields:

- `title`: a short, specific headline without a trailing period.
- `summary`: a one-sentence, plain-language takeaway.
- `body`: concise, skimmable Markdown with sparse, helpful emoji.
- `tags`: `today-i-learned` first, followed by 1–5 relevant tags inferred from the notes.

Use only body sections supported by the source. A suitable shape is:

```md
## 🌱 What I learned

[The core learning in the user's voice.]

## 🧠 Why it clicked

[Context, contrast, or a mental model present in the notes.]

## 🔁 How I’ll use it

[A practical follow-up, only when present or strongly implied.]
```

## Example

For notes saying, “I learned that naming a concept consistently makes code easier to follow,” return fields like:

```yaml
title: Consistent names make code easier to follow
summary: I learned that using one name per concept removes unnecessary interpretation.
body: |-
  ## 🌱 What I learned

  When I use one consistent name for a concept, I spend less time checking whether two terms mean the same thing.
tags: [today-i-learned, naming, code-quality]
```

## Tag rules

- Keep every tag lowercase and slug-shaped, using words separated by hyphens.
- Prefer specific domain nouns such as `ruby`, `testing`, `debugging`, `leadership`, `product`, `writing`, `architecture`, `databases`, `communication`, `workflow`, `ai`, or `shopify` when supported by the notes.
- Deduplicate tags. Do not add joke tags or unsupported broad tags.
