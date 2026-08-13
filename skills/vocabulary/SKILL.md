---
name: vocabulary
description: Adds or updates a term in the local explanation vocabulary. Use when the user invokes /vocabulary, asks the agent to remember their familiarity with a concept, or wants explanation depth stored without Organized or Quick.
---

# Vocabulary

Save one term locally so `explain-like-socrates` can match future explanations to the user's familiarity.

## Local-only boundary

This skill never reads or writes Organized, Shopify's internal personal feed, and never requires Quick, Shopify's internal app and site platform. It writes only:

`~/.cache/pi/explain-like-socrates/organized-vocabulary.json`

Set `VOCABULARY_CACHE_PATH` only when testing or when the user explicitly chooses another cache.

## Entry

Require:

- `title`: the concept's canonical name;
- `familiarity`: how much explanation the user needs;
  - `beginner` — define the term and build from the human goal;
  - `intermediate` — add only a short contextual phrase when useful;
  - `expert` — use the term naturally without teaching its foundation;
- `description`: a concise definition used to recognize the concept.

Ask for missing fields. If you infer or substantially rewrite a field, show the exact entry and ask for approval. A complete entry supplied by the user authorizes the local write.

## Save

1. Create a collision-safe temporary JSON path with `mktemp` and write the three fields there.
2. Resolve `scripts/add-vocabulary.mjs` relative to this skill's loaded `SKILL.md`, then run `node <resolved-script-path> <temporary-json-path>`.
3. Delete the temporary input after a successful save.
4. Report whether the entry was `created`, `updated`, or `no_change`, plus the cache path.

Title matching trims leading and trailing whitespace, collapses internal whitespace, then compares without case. Adding a matching title updates one entry rather than creating a duplicate. Never edit the cache with ad hoc text replacement; use the script's validated, locked, atomic write.
