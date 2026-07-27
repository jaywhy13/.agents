---
name: jamaicanize
description: Rewrites a plain spoken script into a warm Jamaican-inflected voice while preserving protected facts exactly. Use when preparing respectful spoken narration or the morning brief audio script.
---

# Jamaicanize

Create a natural spoken script, not a caricature. Style is optional; factual fidelity is mandatory.

## Inputs

Require:

- `plain_spoken_script`: the complete fallback script;
- `protected_facts`: exact strings covering supplied names, dates, times, numbers, links, asks, decisions, commitments, owners, and negations.

If either input is missing or ambiguous, return the plain script unchanged with `style_status: plain_fallback`.

## Rewrite

- Keep every protected string verbatim. Do not translate, respell, shorten, reorder, or paraphrase it.
- Preserve who owns each action, what is requested or decided, deadlines, priority, uncertainty, and negative statements.
- Add no new facts, promises, opinions, urgency, names, or work advice.
- Keep the full informational coverage and roughly the same length.
- Use clear spoken English with light, natural Jamaican phrasing as seasoning. Warmth, rhythm, and occasional expressions such as “wah gwaan”, “mek we”, “zeen”, “no long ting”, or “bless up” are enough.
- Avoid exaggerated phonetic spelling, forced slang in every sentence, stereotypes, or jokes about Jamaican identity.

## Fact-preservation gate

Before accepting the rewrite, compare it with the plain script and protected-facts list:

1. every protected string appears unchanged;
2. no name, date, time, number, link, ask, decision, commitment, owner, or negation changed or disappeared;
3. no factual claim was added;
4. the result remains easy to understand aloud.

If any check fails, discard the entire rewrite and use `plain_spoken_script` exactly—do not partially repair it. Carry forward:

```text
script: <styled script or exact plain script>
style_status: styled | plain_fallback
warnings: <empty or preservation failure>
```

Example: protect `Review PR #482 before 10:30` as one exact string; style only the surrounding transition.
