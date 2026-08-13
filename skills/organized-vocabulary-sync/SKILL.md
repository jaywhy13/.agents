---
name: organized-vocabulary-sync
description: Reconciles vocabulary bidirectionally between the local explanation cache and Organized. Use when the user invokes /organized-vocabulary-sync or explicitly asks to import Organized terms and publish local-only terms in one synchronization.
---

# Organized Vocabulary Sync

Keep explanation depth consistent across machines by reconciling the local vocabulary with Organized, Shopify's internal personal feed, only when the user requests synchronization.

## Availability

Quick is Shopify's internal app and site platform; `quick` is its command-line tool. Check for that Shopify-machine proxy first:

```bash
command -v quick >/dev/null 2>&1
```

If Quick is absent, report that synchronization was skipped and leave the local cache unchanged. Do not ask for installation or try a browser fallback.

## Reconciliation rules

- Import terms that exist only in Organized into the local cache.
- Publish terms that exist only in the local cache to Organized.
- When the same title differs, Organized wins and refreshes the local entry.
- Match titles by trimming and collapsing whitespace, then comparing without case.
- Never delete a term from either side.
- Stop rather than guessing when that matching rule produces duplicate titles on either side.

An explicit request for bidirectional synchronization authorizes creation of local-only terms in Organized. If the user asks only to refresh locally from Organized, disclose the reverse publication step and obtain approval before writing. Authentication, permission, network, and data errors remain failures rather than skips.

## Synchronize

Resolve `scripts/sync-organized-vocabulary.mjs` relative to this skill's loaded `SKILL.md`, then run `node <resolved-script-path>`.

Report:

- entries imported to the local cache;
- local-only entries published to Organized;
- conflicting local entries refreshed from Organized;
- final totals on both sides;
- the local cache path.

If synchronization fails after publishing some terms, report the completed titles and failing phase. A retry is safe and will not create duplicate normalized titles.
