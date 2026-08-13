# Fingerprint Research Reference

## Standard teammate task template

Use this as the starting prompt when launching a teammate.

```text
Investigate and populate the ANC Query Guard audit record for the assigned fingerprint(s).

Assigned source:
- Parent issue: https://github.com/Shopify/ad-network-connectivity/issues/4766
- Source issue or context: <issue URL or source description>
- Fingerprint/query id(s): <ids or synthetic labels>
- Observed table(s): <tables>
- Known counts/window: <counts if known>

Quick site:
- Live URL: https://anc-query-guard-audit.quick.shopify.io
- Quick DB site name: anc-query-guard-audit
- Primary collection: fingerprints
- Schema source of truth: deployed Quick file `schema.js`
- Population guide: deployed Quick file `README.md`
- Legacy collections that should usually stay empty: fingerprint_comments, fingerprint_changes, fingerprint_llm_chats
- General page chat collection: llm_chats

Before researching:
1. Read the source issue/body/comments fully.
2. Read parent issue #4766 enough to understand shared context.
3. Read the deployed Quick site README and schema before writing:
   - `quick_get_file(site: "anc-query-guard-audit", path: "README.md")`
   - `quick_get_file(site: "anc-query-guard-audit", path: "schema.js")`
4. Confirm the deployed collection exists:
   - `quick_list_collections(site: "anc-query-guard-audit")`
5. Read `/Users/jeanmark.wright/.agents/skills/explain-like-socrates/SKILL.md` and use that style for rationale fields.

Research requirements:
- Search code for the model/table/job/service/controller related to the fingerprint.
- Use source issue evidence, Observe links, logs, traces, and code evidence where available.
- If exact normalized SQL is available, set `raw_fingerprint_sql` and `sql_confidence=raw`.
- If SQL is inferred, set `inferred_sql` and `sql_confidence=inferred`.
- Do not invent exact SQL.
- Runtime evidence is required research, not optional polish. Actively look for latency percentiles: p50, p90, p95.
- Actively look for database-time percentiles: p50, p90, p95.
- Actively look for row count. Explain whether it is rows returned, rows scanned, table row count, or scoped row count.
- If any latency, database-time, or row-count metric cannot be found, leave the numeric field `null` and write an explicit evidence note naming the sources checked and why the metric is unavailable. Do not silently omit these fields.
- If the source lists distinct query-id counts but not actual query ids, use synthetic `fingerprint_id`, leave `query_id` blank, set `query_id_confidence=unavailable`, and explain in `identifier_notes`.

Populate one `fingerprints` record per fingerprint/query id with the finalized schema. Update an existing matching record instead of creating a duplicate.

Quick database population workflow:
1. Query for likely duplicates before writing:
   - Filter by source issue, for example `quick_query_collection(site: "anc-query-guard-audit", collection: "fingerprints", filter: {"subissue_number": 4771}, limit: 100)`.
   - Compare `fingerprint_id`, `query_id`, and exact `raw_fingerprint_sql` locally because exact SQL strings can be long.
2. Choose the write mode:
   - If a matching `id` exists, update that object.
   - If no match exists, create one object in `fingerprints`.
   - The site import textarea can also create or update records; it matches by `id`, then `fingerprint_id`, then `query_id`.
3. Keep write scope narrow:
   - Write only your assigned fingerprint(s).
   - Do not write real data into `sample-fingerprints.json`.
   - Do not populate legacy collections unless the deployed `README.md` changes and explicitly requires it.
4. Populate runtime evidence deliberately:
   - Fill `observed_latency_p50_ms`, `observed_latency_p90_ms`, and `observed_latency_p95_ms` when available.
   - Fill `observed_db_time_p50_ms`, `observed_db_time_p90_ms`, and `observed_db_time_p95_ms` when available.
   - Fill `observed_row_count` when available and explain what the count means.
   - If any of these are unavailable, keep the numeric field `null` and add the unavailability evidence to `load_rationale`, `optimization_rationale`, `identifier_notes`, or an embedded comment/change.
5. Preserve unknowns honestly:
   - Unknown string fields should be `""`.
   - Unknown numeric metrics should be `null` only after the required runtime-evidence search above.
   - Unknown list fields should be `[]`.
   - If the issue provides only distinct query-id counts, leave `query_id` blank, set `query_id_confidence: "unavailable"`, and explain in `identifier_notes`.
6. Set timestamps:
   - Use ISO 8601 strings for `created_at` and `updated_at`.
   - Preserve existing `created_at` when updating; change `updated_at`.

Headless Quick write examples:

```bash
# Create one record. `quick curl` injects the Quick/IAP auth headers.
quick curl "https://anc-query-guard-audit.quick.shopify.io/api/db/fingerprints" \
  -X POST -H "Content-Type: application/json" --data @/tmp/fingerprint-record.json

# Update an existing record by id. Prefer the browser quick.db API or the site import box
# if the deployed HTTP method is unclear in your environment.
```

Browser write examples when the site is open and authenticated:

```javascript
const fingerprints = quick.db.collection("fingerprints");
const existing = await fingerprints.where({ subissue_number: 4771 }).find();
const matching = existing.find((record) =>
  record.fingerprint_id === newRecord.fingerprint_id ||
  (newRecord.query_id && record.query_id === newRecord.query_id) ||
  record.raw_fingerprint_sql === newRecord.raw_fingerprint_sql
);

if (matching) {
  await fingerprints.update(matching.id, { ...newRecord, created_at: matching.created_at, updated_at: new Date().toISOString() });
} else {
  await fingerprints.create({ ...newRecord, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
}
```

Write report:
- Path: `fingerprint-reports/<fingerprint-or-issue>.md` inside the repository working directory (`WORK_WORKING_DIRECTORY` when set).
- Include source issue summary, evidence, exact/inferred SQL status, caller mapping, product concern, classification, recommendation, unresolved questions, and schema/instruction improvement suggestions.

Report back with:
- Quick site URL
- Quick DB site and collection
- Quick DB record ids created/updated
- Query ids/fingerprint ids
- Duplicate check result
- Decisions and statuses
- Exact SQL found or inferred SQL status
- Latency/row count findings or gaps
- Report path
- Blockers
```

## Final fingerprint schema checklist

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
- `query_id_confidence`: `official | candidate | unavailable`
- `identifier_notes`
- `first_seen_at`
- `last_seen_at`

Query text:

- `raw_fingerprint_sql`
- `inferred_sql`
- `summarized_sql`
- `sql_confidence`: `raw | inferred | summary_only | unknown`
- `human_explanation`

Query anatomy:

- `tables_touched`
- `joins`
- `selected_columns`
- `predicate_columns`
- `order_by_columns`
- `limit_offset`
- `query_diagram_mermaid`
- `query_diagram`

Product concern and caller:

- `product_concern`
- `callers`: array of objects:
  - `caller_product_concern`
  - `caller_summary`
  - `caller_usage_link`
- `caller_evidence`
- `use_cases`

Index evidence:

- `indexes_in_use`
- `existing_indexes_relevant`

Assessment fields:

- `scope_boundedness`
- `scope_rationale`
- `intentionality`
- `intentionality_rationale`
- `load_level`
- `load_rationale`
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
- `hot_request_path`
- `hot_request_path_rationale`
- `optimization_opportunity`
- `optimization_rationale`
- `complexity_level`
- `complexity_rationale`

Recommendation and decision:

- `initial_recommendation`
- `recommendation_rationale`
- `decision`: `fix | add_index | allow | close_stale | undecided`
- `decision_rationale`
- `decision_status`: `new | triaging | needs_owner | in_review | ready_for_decision | decided | closed`
- `related_query_ids`

Embedded activity:

- `comments`: array of comment objects
- `changes`: array of change objects
- `llm_conversations`: array of per-fingerprint LLM conversations
- `created_at`
- `updated_at`

General LLM chats are stored separately in `llm_chats`; they are not required for teammate population.

## Decision guidance

- `fix`: the query asks for data in the wrong way, does request-time full-scope work, or can use an existing access path with a code change.
- `add_index`: the access pattern is legitimate and recurring, but no existing index supports it.
- `allow`: the scan is understood, intentional, bounded, and operationally acceptable.
- `close_stale`: the fingerprint is no longer applicable or only historical, with evidence.
- `undecided`: evidence remains insufficient.

## Rationale checklist

Every rationale field must start with a high-level, accessible opening line:

- First line: one short sentence with the conclusion in plain language.
- Then a blank line.
- Then the detailed evidence and technical explanation.

The first line must be understandable without knowing Rails, Yugabyte, Query Guard, or the maintenance_tasks gem. Avoid implementation names in the first line unless they are the user's own object of review.

Good first lines:

- `This lookup should get an index because it asks for the latest run of one task.`
- `We cannot allow this query directly at the call site because the query lives inside a shared gem.`
- `This dashboard scan is probably safe to allow because it is internal and low frequency.`

After the opening line and blank line, each rationale should answer, in this order:

1. What product or operator need does this query support?
2. What is the database doing that may be too broad or risky?
3. Why is the chosen recommendation appropriate?
4. What evidence would change the decision?

Use plain language. Define jargon before using it.
