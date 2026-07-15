---
name: query-guard-violations-audit
description: Audit ANC Query Guard violation sub-issues and save fingerprint recommendations in the anc-query-guard-audit Quick site. Use when researching open sub-issues under Shopify/ad-network-connectivity issue #4766, classifying fingerprints, recording evidence and recommendations, or handing off Query Guard fingerprint audit work to teammates.
---

# Query Guard Violations Audit

## What this workflow produces

This workflow turns each Query Guard fingerprint into a reviewable Quick database record. Query Guard is a database safety guard that warns when a Yugabyte/PostgreSQL query plan uses a risky table or index scan. The audit explains what each query does, why it matters, how risky it appears, and what the next recommendation should be.

The output is not a code change. The output is a populated record in the ANC Query Guard audit Quick site plus a short teammate report.

- Parent GitHub issue: `https://github.com/Shopify/ad-network-connectivity/issues/4766`
- Quick site: `https://anc-query-guard-audit.quick.shopify.io`
- Quick database site name: `anc-query-guard-audit`
- Primary collection: `fingerprints`
- General page chat collection: `llm_chats`
- Legacy collections that should usually stay empty: `fingerprint_comments`, `fingerprint_changes`, `fingerprint_llm_chats`

Do not use `fingerprint-research.quick.shopify.io`; that is not the audit site.

## Start by confirming the live site shape

Before writing records, confirm the current deployed instructions and schema. The Quick site is the source of truth because the user interface only accepts the choices in `schema.js`.

Use these Quick tools when available:

```text
quick_get_file(site: "anc-query-guard-audit", path: "README.md")
quick_get_file(site: "anc-query-guard-audit", path: "schema.js")
quick_list_collections(site: "anc-query-guard-audit")
```

Equivalent command-line checks:

```bash
quick curl https://anc-query-guard-audit.quick.shopify.io/README.md
quick curl https://anc-query-guard-audit.quick.shopify.io/schema.js
quick curl https://anc-query-guard-audit.quick.shopify.io/metadata.json
```

If local site source is needed, the latest scratchpad found for this workflow was:

```text
/Users/jeanmark.wright/src/github.com/Shopify/ad-network-connectivity/tmp/anc-query-guard-audit-site
```

The known local report directory was:

```text
/Users/jeanmark.wright/src/github.com/Shopify/ad-network-connectivity/.worktrees/2026-06-24-resolve-shopify-query-guard-violations/fingerprint-reports
```

## Source discovery for issue #4766

When the user asks to audit open sub-issues under issue #4766:

1. Fetch the parent issue and linked sub-issues.

```bash
gh issue view 4766 --repo Shopify/ad-network-connectivity --json number,title,url,body,comments,labels,state,createdAt,updatedAt

gh api repos/Shopify/ad-network-connectivity/issues/4766/sub_issues --paginate \
  --jq '.[] | {number,title,url,state}'
```

2. Fetch each open sub-issue body and comments before researching. Treat issue text as source evidence, not as final truth.

```bash
SUBISSUES=$(gh api repos/Shopify/ad-network-connectivity/issues/4766/sub_issues --paginate --jq '.[].number' | tr '\n' ' ')
for issue_number in 4766 $SUBISSUES; do
  gh issue view "$issue_number" --repo Shopify/ad-network-connectivity --json number,title,url,state,body,comments,createdAt,updatedAt,closedAt
 done | jq -s '.' > /tmp/anc_query_guard_issues.json
```

3. For each open sub-issue, identify every fingerprint/query family listed in the issue. Create or update one `fingerprints` record per fingerprint/query shape, not just one record per table.

4. Check existing Quick records before creating anything. Avoid duplicates by comparing `subissue_number`, `fingerprint_id`, `query_id`, and exact `raw_fingerprint_sql`.

```text
quick_query_collection(site: "anc-query-guard-audit", collection: "fingerprints", filter: {"subissue_number": 4771}, limit: 100)
```

## Research requirements for each fingerprint

A complete record should explain the human purpose first, then the technical evidence.

For each assigned fingerprint:

1. Read the source sub-issue and comments fully.
2. Read enough of parent issue #4766 to understand shared Query Guard context.
3. Search code for the model, table, job, controller, service, and scopes related to the fingerprint.
4. Preserve exact SQL honestly:
   - Use `raw_fingerprint_sql` and `sql_confidence: "raw"` only when exact normalized SQL is available from the issue, Observe, or another direct source.
   - Use `inferred_sql` and `sql_confidence: "inferred"` when reconstructing SQL from code.
   - Use `summarized_sql` and `sql_confidence: "summary_only"` when only the shape is known.
   - Do not invent exact SQL.
5. Map callers to product concerns before naming implementation details.
6. Look for runtime evidence, including warning counts, latency percentiles, database-time percentiles, and row counts.
7. If a metric is unavailable, leave the numeric field `null` and write the source checked plus why the metric was unavailable in a rationale, comment, or evidence note.
8. Check the source issue state and associated pull requests. Closed issues can be marked closed only when the issue state and remediation evidence support it.

Useful evidence sources:

- GitHub source issue body and comments.
- GitHub parent issue #4766.
- Repository code and migrations.
- Observe Query Guard warning logs for `WARNING:  shopify_query_guard`.
- Observe `yugabyte_performance_query_id_fingerprints` for query-id-to-SQL mapping.
- Observe tracing spans for exact SQL timing.
- BigQuery/metadata or safe catalog sources for row counts when available.
- Pull requests that close or reference the issue.

## Query Guard warning source of truth

Only count true Query Guard warnings. A SQL comment containing `shopify_query_guard.allow_scan_tables` is not a violation by itself.

Minimum warning evidence:

```text
message contains "WARNING:  shopify_query_guard"
sqlstate = 01000
username = svc_ads_anc_2
service = postgresql
```

Extract when available:

```text
query_id: query_id=([0-9-]+)
reason: shopify_query_guard: (.*)
application_name: application=([^ ]+)
```

If warning logs contain candidate query IDs but no SQL text, do not mark the `query_id` as official for a fingerprint unless you can safely map it to the exact SQL shape. Use `query_id_confidence: "candidate"` only when the record explains why the mapping is plausible but not official. Use `query_id_confidence: "unavailable"` when the source lists only distinct query-id counts.

## Quick site data model

The deployed site uses one primary Quick database collection:

```javascript
quick.db.collection("fingerprints")
```

Comments, changes, and per-fingerprint Large Language Model conversations are embedded arrays on each fingerprint record. General page chats go in `llm_chats`; they are not required for audit population.

Known choice values from the deployed `schema.js` at the time this skill was written:

```text
decision: undecided, fix, add_index, allow, close_stale
decision_status: new, triaging, needs_owner, in_review, ready_for_decision, decided, closed
intentionality: unclear, intentional, unintentional
scope_boundedness: unclear, bounded, unbounded
load_level: unclear, low, medium, high
hot_request_path: unclear, yes, no
optimization_opportunity: unclear, none, query_rewrite, existing_index, new_index, allowlist
complexity_level: unclear, low, medium, high
sql_confidence: unknown, raw, inferred, summary_only
query_id_confidence: unavailable, candidate, official
source_issue_state: unknown, open, closed
```

Do not write unsupported machine values into choice fields. If the live `schema.js` has changed, follow the live schema over this list.

## Recommendation categories

Use one of these human-facing recommendation labels at the start of `initial_recommendation` and explain it in `recommendation_rationale`:

- `Fix Now`: the query shape is likely wrong, request-time broad, or can be corrected with an existing access path.
- `Add Index`: the access pattern is legitimate and recurring, but the database lacks a matching index.
- `Allow`: the scan is understood, intentional, bounded or operationally acceptable, and should be narrowly allowlisted.
- `Close Stale`: the warning is historical or already remediated, with issue/pull-request/runtime evidence.
- `Fix Later`: the query should eventually be improved, but current volume/risk is low enough that immediate remediation is not required. This must include the condition that would trigger revisiting it.
- `Undecided`: evidence is insufficient; name the missing evidence.

Machine-field mapping:

- `Fix Now` usually maps to `decision: "fix"`.
- `Add Index` maps to `decision: "add_index"`.
- `Allow` maps to `decision: "allow"`.
- `Close Stale` maps to `decision: "close_stale"`.
- `Undecided` maps to `decision: "undecided"`.
- `Fix Later` is a new audit recommendation category. At the time this skill was written, the deployed schema did not include a `fix_later` value in `choiceOptions.decision`. Until the live schema adds one, do not invent `decision: "fix_later"`. Record `initial_recommendation: "Fix Later — ..."`, write a clear `recommendation_rationale`, and choose the closest supported `decision` only when the reviewer has explicitly decided it. If no final decision has been made, keep `decision: "undecided"` and move the row to `decision_status: "ready_for_decision"` or `needs_owner`.

For `Fix Later`, always write:

- why it is safe to defer now,
- what evidence would make it urgent,
- who or what should revisit it,
- whether any temporary allowlist is being proposed or merely considered.

## Required fields for a useful fingerprint record

The schema has many optional fields, but each production audit record should populate the following whenever possible.

Identity and source:

- `query_id`
- `fingerprint_id`
- `parent_issue_url`
- `subissue_url`
- `subissue_number`
- `observe_url`
- `source_window`
- `source_warning_count`
- `source_distinct_query_id_count`
- `query_id_confidence`
- `identifier_notes`
- `first_seen_at`
- `last_seen_at`

GitHub evidence:

- `associated_pull_requests`
- `source_issue_state`
- `source_issue_closed_at`
- `source_issue_state_verified_at`
- `source_issue_verification_note`

Query text and anatomy:

- `raw_fingerprint_sql`
- `inferred_sql`
- `summarized_sql`
- `sql_confidence`
- `human_explanation`
- `tables_touched`
- `joins`
- `selected_columns`
- `predicate_columns`
- `order_by_columns`
- `limit_offset`
- `query_diagram_mermaid` or `query_diagram`

Product concern and caller evidence:

- `product_concern`
- `callers` with `caller_product_concern`, `caller_summary`, and `caller_usage_link`
- `caller_evidence`
- `use_cases`

Index and runtime evidence:

- `indexes_in_use`
- `existing_indexes_relevant`
- `warning_count_30m`
- `warning_count_4h`
- `warning_count_24h`
- `observed_latency_p50_ms`
- `observed_latency_p90_ms`
- `observed_latency_p95_ms`
- `observed_db_time_p50_ms`
- `observed_db_time_p90_ms`
- `observed_db_time_p95_ms`
- `observed_row_count`
- `table_row_counts`

Assessment and recommendation:

- `scope_boundedness`
- `scope_rationale`
- `intentionality`
- `intentionality_rationale`
- `load_level`
- `load_rationale`
- `hot_request_path`
- `hot_request_path_rationale`
- `optimization_opportunity`
- `optimization_rationale`
- `complexity_level`
- `complexity_rationale`
- `initial_recommendation`
- `recommendation_rationale`
- `decision`
- `decision_rationale`
- `decision_status`
- `related_query_ids`
- `created_at`
- `updated_at`

Use empty strings for unknown string fields, `null` for unknown numeric metrics after evidence search, and empty arrays for unknown list fields.

## Accessible explanation style

Every explanation should help a reader understand the user or operator need before the implementation details.

For `human_explanation`, `product_concern`, caller concerns, and all rationale fields:

1. Start with the visible purpose or operational outcome.
2. Define technical terms before using them.
3. Then name code paths, database tables, indexes, and logs.
4. Avoid opening with Rails, Yugabyte, Query Guard, or gem internals unless the reader already asked about that implementation.

Rationale fields should use this two-part shape:

```text
This lookup should get an index because it asks for the latest run of one task.

Operators need the Maintenance Tasks page to quickly show recent task runs. Today the database has to search too broadly because the table is missing the lookup path this page expects. The likely fix is to add that task-run lookup index, then use Yugabyte EXPLAIN to confirm the database really uses it.
```

The first line must be understandable without knowing Rails, Yugabyte, Query Guard, or the relevant gem.

## Save results to Quick

Preferred duplicate check before writing:

```text
quick_query_collection(site: "anc-query-guard-audit", collection: "fingerprints", filter: {"subissue_number": 4771}, limit: 100)
```

Browser write pattern when the site is open and authenticated:

```javascript
const fingerprints = quick.db.collection("fingerprints");
const existing = await fingerprints.where({ subissue_number: 4771 }).find();
const matching = existing.find((record) =>
  record.fingerprint_id === newRecord.fingerprint_id ||
  (newRecord.query_id && record.query_id === newRecord.query_id) ||
  record.raw_fingerprint_sql === newRecord.raw_fingerprint_sql
);

if (matching) {
  await fingerprints.update(matching.id, {
    ...newRecord,
    created_at: matching.created_at,
    updated_at: new Date().toISOString(),
  });
} else {
  await fingerprints.create({
    ...newRecord,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}
```

Headless create example:

```bash
quick curl "https://anc-query-guard-audit.quick.shopify.io/api/db/fingerprints" \
  -X POST -H "Content-Type: application/json" --data @/tmp/fingerprint-record.json
```

The site import text area also accepts a JSON array or an object with a `records` array. Import matching order is `id`, then `fingerprint_id`, then `query_id`, then create.

Keep write scope narrow:

- Write only the assigned fingerprint or sub-issue records.
- Do not write real data into `sample-fingerprints.json`.
- Do not populate legacy collections unless the live README explicitly changes that instruction.
- Append `changes` entries when scripts make meaningful updates.
- Preserve existing `created_at` when updating; refresh `updated_at`.

## Teammate handoff expectations

When coordinating teammates, assign one sub-issue or one high-volume/unclear fingerprint per teammate. Batch low-volume siblings only when they clearly share a table family and source issue.

Each teammate prompt should include:

- parent issue URL,
- assigned sub-issue URL,
- exact fingerprint/query identifiers or synthetic labels,
- observed table(s),
- known counts/window,
- Quick site URL and collection,
- instruction to read live `README.md` and `schema.js` before writing,
- instruction to check duplicates before writing,
- report output path,
- instruction to use accessible product-concern-first explanations,
- instruction not to modify application Ruby code.

Each teammate report must include:

- Quick record ids created or updated,
- duplicate check result,
- query ids or synthetic fingerprint ids,
- exact/raw versus inferred SQL status,
- caller mapping and product concern,
- runtime evidence found and metrics that remain unavailable,
- row count source and what the count means,
- recommendation label and supported machine `decision` value,
- decision status,
- source issue state and associated pull requests,
- unresolved questions or blockers,
- report path.

## Final response shape for an audit pass

Finish with:

1. Short verdict: complete, incomplete, or blocked.
2. Sub-issues audited and Quick record ids changed.
3. Recommendation counts grouped by `Fix Now`, `Add Index`, `Allow`, `Close Stale`, `Fix Later`, and `Undecided`.
4. Open questions and missing evidence.
5. Commands/tools used to find the evidence.

Do not claim an issue is safe to close solely because a Quick record exists. Closure requires source issue state, remediation pull request state, and/or current warning evidence.
