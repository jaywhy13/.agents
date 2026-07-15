---
name: fingerprint-research
description: Launches and coordinates teammate agents to research Query Guard fingerprints and populate the ANC Quick audit site. Use when the user invokes /fingerprint-research or asks to investigate, populate, or audit a list of Query Guard fingerprints.
---

# Fingerprint Research

Use this skill to coordinate a team-based research pass over Query Guard fingerprints and populate the ANC fingerprint audit Quick site.

## Quick start

1. Read the detailed teammate prompt in [REFERENCE.md](REFERENCE.md).
2. Identify the input type:
   - explicit query ids/fingerprints,
   - a GitHub sub-issue URL,
   - a table family,
   - or a mixed list.
3. Use the ANC Query Guard audit Quick site:
   - Quick site: `https://anc-query-guard-audit.quick.shopify.io`
   - Quick database site name: `anc-query-guard-audit`
   - Primary collection: `fingerprints`
   - Schema source of truth: deployed Quick file `schema.js`
   - Population guide: deployed Quick file `README.md`
   - Do not use `fingerprint-research.quick.shopify.io`; that is not the audit site.
4. Confirm the deployed site shape before writing:
   - list collections for `anc-query-guard-audit`,
   - read `README.md` and `schema.js`,
   - confirm `fingerprints` is present,
   - treat `fingerprint_comments`, `fingerprint_changes`, and `fingerprint_llm_chats` as legacy collections that should stay empty unless the deployed README says otherwise.
5. Launch teammates in waves.
   - Use one teammate per high-volume or unclear fingerprint.
   - Batch low-volume siblings only when they clearly share a table family and source issue.
6. Wait for teammate completion reports, then summarize outcomes and launch the next wave if needed.

## Orchestration rules

- Do not personally redo the delegated fingerprint investigations while teammates are running.
- Start with source discovery if the user provides a GitHub issue instead of explicit query ids.
- Prefer waves of 6–10 teammates to avoid duplicate work and Quick database write confusion.
- Give each teammate a self-contained task with:
  - assigned fingerprint/query id or issue section,
  - source issue URL,
  - Quick site/collection,
  - schema path if known,
  - report output path,
  - the instruction to use product-concern-first rationales.
- After each wave, maintain a concise status list: completed, pending, blocked, and unresolved conflicts.

## Required teammate outputs

Each teammate must:

- create or update exactly the matching Quick `fingerprints` record for the assigned fingerprint,
- avoid duplicate records by checking existing records for the same `subissue_number`, `fingerprint_id`, `query_id`, and exact `raw_fingerprint_sql`,
- write a markdown report under `fingerprint-reports/`,
- state exact versus inferred SQL confidence,
- identify product concern before technical caller,
- fill assessment fields and rationale fields,
- populate runtime evidence fields for latency, database time, and row count when available,
- if latency, database time, or row count cannot be found, leave the numeric fields `null` and write an explicit evidence note naming the sources checked and why the metric is unavailable,
- report the Quick record id created or updated,
- report blockers and suggested schema/instruction improvements.

## Quick population workflow

Use the detailed commands and field checklist in [REFERENCE.md](REFERENCE.md). The short version:

1. Discover the current deployed instructions and schema from the Quick site before writing.
2. Build one JSON object per fingerprint using `FingerprintAuditSchema.defaultRecord()` as the mental default shape: use empty strings for unknown strings, `null` for unknown numeric metrics, and empty arrays for list fields.
3. Treat runtime evidence as required research, not optional polish: actively look for p50, p90, and p95 latency; p50, p90, and p95 database time; and row count. If any metric is unavailable, keep the numeric field `null` but populate the rationale with the source checked and the reason it is unavailable.
4. Preserve exact source data: exact normalized SQL goes in `raw_fingerprint_sql` with `sql_confidence: "raw"`; inferred SQL goes in `inferred_sql` with `sql_confidence: "inferred"`; do not invent exact SQL.
5. Use stable synthetic `fingerprint_id` values when official query ids are unavailable, for example `issue-4771-fp2-maintenance-tasks-created-at-max-by-task-name`.
6. Set `query_id_confidence: "unavailable"` and explain the missing official ids in `identifier_notes` when the source issue lists only distinct query-id counts.
7. Populate embedded `comments` and `changes` arrays only when needed; general page chats belong in `llm_chats`, not on fingerprint rows.
8. Update an existing record when `fingerprint_id`, `query_id`, or exact `raw_fingerprint_sql` matches; create only when no matching record exists.

## Rationale style

Before asking teammates to write rationale fields, require them to follow the `explain-like-socrates` skill style and use a two-part shape:

1. Start every rationale field with one short, high-level opening line that states the conclusion in plain language. This first line must be understandable without knowing Rails, Yugabyte, Query Guard, or the maintenance_tasks gem.
2. Add a blank line.
3. Then add the detailed evidence and technical explanation.

Bad rationale:

> Add the baseline index and validate Yugabyte layout with EXPLAIN.

Better rationale:

> This lookup should get an index because it asks for the latest run of one task.
>
> Operators need the Maintenance Tasks page to quickly show recent task runs. Today the database has to search too broadly because the table is missing the lookup path this page expects. The likely fix is to add that task-run lookup index, then use Yugabyte `EXPLAIN` to confirm the database really uses it.

Bad rationale:

> The allowlist itself is straightforward with the existing query-tag mechanism, but the source is inside the maintenance_tasks gem, so ANC likely needs a small override around TaskDataIndex.available_tasks or the engine action rather than a direct one-line change at the call site.

Better rationale:

> We cannot allow this query directly at the call site because the query lives inside a shared gem.
>
> The allowlist itself is straightforward with the existing query-tag mechanism, but the source is inside the maintenance_tasks gem, so ANC likely needs a small override around `TaskDataIndex.available_tasks` or the engine action rather than a direct one-line change at the call site.

## Reference

Use [REFERENCE.md](REFERENCE.md) for the full teammate prompt template and schema checklist.
