---
name: organized-vocabulary
description: Saves a vocabulary term locally, then mirrors it to Organized when Shopify's Quick tooling is available. Use when the user invokes /organized-vocabulary or asks to save explanation familiarity both locally and to Organized.
---

# Organized Vocabulary

Keep the local explanation vocabulary useful first, then copy the same approved entry to Organized, Shopify's internal personal feed.

## Save locally first

1. Gather the `title`, `familiarity`, and `description` required by [vocabulary](../vocabulary/SKILL.md).
2. Read that skill and carry out its workflow in this session with those exact fields.
3. Stop if the local save fails. Do not publish a value that is absent locally.

## Add to Organized when Quick is installed

Quick is Shopify's internal app and site platform; `quick` is its command-line tool. Use the installed command as the Shopify-machine proxy:

```bash
command -v quick >/dev/null 2>&1
```

If it is absent, keep the successful local entry and report `Organized: skipped because Quick is not installed.` Do not ask for Quick installation or attempt a browser fallback.

When it is present:

1. Create a collision-safe temporary JSON path with `mktemp` and write the same approved fields there.
2. Resolve `scripts/add-organized-vocabulary.mjs` relative to this skill's loaded `SKILL.md`, then run `node <resolved-script-path> <temporary-json-path>`.
3. Delete the temporary input after success.
4. Report the local action and the Organized action: `created`, `updated`, or `no_change`.

The publisher trims and collapses title whitespace, then compares without case. It updates an existing Organized record rather than creating a duplicate. A Quick authentication, permission, network, or data error remains a real publication failure; report it while making clear that the local save succeeded.
