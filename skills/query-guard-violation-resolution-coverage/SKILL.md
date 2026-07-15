---
name: query-guard-violation-resolution-coverage
description: Verify Query Guard violation resolution coverage for ANC and Ads Channels-owned Yugabyte services. Use when checking whether current Query Guard warning fingerprints are fully represented in GitHub issues/sub-issues, mapping query_id fingerprints to SQL/call sites, finding gaps, creating or refreshing tracking issues, and checking related remediation PRs.
---

# Query Guard Violation Resolution Coverage

## What this skill verifies

Query Guard is a database safety guard that warns when a Yugabyte/PostgreSQL query plan uses a risky table or index scan. This workflow verifies whether every current Query Guard warning fingerprint is covered by a resolution issue.

The coverage bar is strict:

- Table-level coverage is not enough.
- SQL-family coverage is not enough.
- Every current Query Guard `query_id` fingerprint must be explicitly accounted for in an issue body or issue comment.
- If a `query_id` maps to the same SQL as another fingerprint, record that equivalence explicitly.
- If a `query_id` cannot be mapped, record it as unknown rather than silently treating it as covered.

Use this process for `Shopify/ad-network-connectivity` Query Guard work and for other Ads Channels-owned Yugabyte runtime services, especially Ads Bidify in `shop/world/areas/incubating/ads-bidify`.

## Key vocabulary

- A Query Guard warning is a PostgreSQL warning log line containing `WARNING:  shopify_query_guard`.
- A fingerprint is the `query_id` value in the Query Guard warning log. It identifies a normalized query plan family.
- A table family is a group of warnings touching the same table, such as `ads_anc.audiences`.
- Exact coverage means the issue lists the current `query_id`, not just the table name.
- Family coverage means an issue covers the table or SQL shape but does not print the current `query_id`.

## Start with teammates

For a complete audit, delegate parallel work before doing synthesis:

1. One teammate finds current Query Guard warnings from Observe and groups by service, table, reason, and `query_id`.
2. One teammate audits the parent GitHub issue and linked sub-issues for explicit `query_id` coverage.
3. One teammate maps owned repositories/services, including cross-repo Ads Channels services like Ads Bidify.
4. If gaps remain, spawn focused teammates for targeted SQL/call-site mapping.

Do not rely only on one data source. Current warnings, issue coverage, and code ownership are separate questions.

## Discover the service/repository scope

For ANC, include:

- Repository: `Shopify/ad-network-connectivity`
- Service: `ad-network-connectivity`
- Database user: `svc_ads_anc_2`
- Common schemas: `ads_anc`, plus some shared `shop.*` tables called by ANC

For Ads Bidify, include:

- Repository: `shop/world`
- Path: `areas/incubating/ads-bidify`
- Service/database user: `ads-bidify` / `svc_ads_bidify_1`
- Common tables: `shop.ads_publishers` and other `shop.*` tables used by the service

Do not include data-only repositories in Query Guard coverage unless they run Yugabyte/PostgreSQL production queries. For Ads Channels, repositories like `Shopify/ads-data`, `Shopify/shop-ml`, and `Shopify/ads-ds` may own data assets but are usually not Query Guard runtime services.

Useful discovery checks:

```bash
gh api /orgs/Shopify/teams/merchant-services-merchant-marketing-marketing-channels-ads-channels/repos
```

```bash
gh api /orgs/shop/teams/ads_channels/repos
```

Search code for Query Guard and Yugabyte evidence:

```text
shopify_query_guard
svc_ads_anc_2
svc_ads_bidify_1
yugabyte
```

## Query current Query Guard warnings

Use Observe's `yugabyte` dataset as the source of truth for warnings.

Always filter for the warning text, not just the token `shopify_query_guard`:

```text
message contains "WARNING:  shopify_query_guard"
```

This matters because allowlisted SQL comments also contain strings like `shopify_query_guard.allow_scan_tables`, and loose searches overcount non-warning statements.

Minimum filters:

```text
dataset = yugabyte
service = postgresql
sqlstate = 01000
message contains "WARNING:  shopify_query_guard"
username = svc_ads_anc_2 or svc_ads_bidify_1
yugabyte_cluster = gdb or apps, as appropriate
```

Extract these fields from the log message:

```text
query_id: query_id=([0-9-]+)
username: username=([^ ]+)
sqlstate: sqlstate=([^ ]+)
reason: shopify_query_guard: (.*)
application_name: application=([^ ]+)
```

Break down by:

```text
query_id
reason
application_name
```

Also run a table/reason aggregation to ensure no table family is missed.

For long windows, split the last 7 days into smaller chunks, usually 12-hour or 24-hour chunks, because older Observe data can be cold or expensive.

## Map `query_id` to SQL

Query Guard warning logs usually contain `query_id`, table/index, username, and warning reason, but not full normalized SQL.

To map `query_id` to SQL, try these sources in order:

1. `yugabyte_performance_query_id_fingerprints` in Observe for the specific `query_id` list.
2. Existing issue bodies and comments under the Query Guard parent issue.
3. The ANC Quick audit site, usually `anc-query-guard-audit` collection `fingerprints`.
4. Tracing spans for exact SQL, when available.
5. Code search for table name and predicate shape.
6. Raw PostgreSQL logs if they include plan or SQL text.

When mapping, record confidence:

- High: `query_id` maps directly to normalized SQL and a source line.
- Medium: SQL maps directly but multiple source lines can emit it.
- Low: only table/reason is known, no SQL mapping.

## Audit GitHub issue coverage

For ANC, start from the parent issue:

```bash
gh issue view 4766 --repo Shopify/ad-network-connectivity --json number,title,url,body,comments,labels,state,createdAt,updatedAt
```

Fetch linked sub-issues:

```bash
gh api repos/Shopify/ad-network-connectivity/issues/4766/sub_issues --paginate --jq '.[] | {number,title,url,state}'
```

Fetch issue bodies for all linked sub-issues:

```bash
SUBISSUES=$(gh api repos/Shopify/ad-network-connectivity/issues/4766/sub_issues --paginate --jq '.[].number' | tr '\n' ' ')
for issue_number in 4766 $SUBISSUES; do
  gh issue view "$issue_number" --repo Shopify/ad-network-connectivity --json number,title,url,state,body,comments,createdAt,updatedAt
done | jq -s '.' > /tmp/anc_query_guard_issues.json
```

Search for unlinked Query Guard issues too:

```bash
gh search issues "Query Guard repo:Shopify/ad-network-connectivity" --state open --limit 100 --json number,title,url,state
```

```bash
gh search issues "Query Guard repo:Shopify/ad-network-connectivity" --state closed --limit 100 --json number,title,url,state
```

Coverage classification:

- Explicitly covered: issue body or comment contains the exact current `query_id`.
- Family-covered only: issue covers the table/SQL shape but does not contain the exact current `query_id`.
- Not covered: no linked issue covers the table or SQL family.
- Unknown mapping: current `query_id` exists but no SQL mapping was found.

## Compare current warnings against issue coverage

Create a table grouped by repository, service, table, issue, and coverage status.

Required columns:

```text
repository/service
table or index reason
query_id
7-day warning count if available
mapped SQL or reason
issue number/state
coverage status
next action
```

Use this wording:

- `explicit` for exact `query_id` present.
- `family-only` for table/SQL coverage without exact `query_id`.
- `missing` for no issue coverage.
- `unknown-sql` when SQL/call-site mapping failed.

Call out closed issues that still have current warnings. Do not assume a closed issue means coverage is complete.

## Refresh issue bodies or comments

When an open issue exists but lacks exact `query_id` coverage, add a comment like:

```markdown
## Exact Query Guard query IDs missing from this issue body

I rechecked current Query Guard warnings over the last 7 days for `<database_user>`. This issue covers the `<table>` table/query family, but the issue body does not explicitly list these current `query_id` fingerprints.

Current warning IDs that are only table/family-covered:

```text
<query_id_1>
<query_id_2>
```

Coverage note: map these query IDs to normalized SQL/call sites or record why they are equivalent to already-covered fingerprints before treating exact fingerprint coverage as complete.
```

For a missing table family, create a new sub-issue and link it to the parent.

Create issue:

```bash
gh issue create --repo Shopify/ad-network-connectivity \
  --title 'Address Query Guard violations for `<schema.table>`' \
  --body-file /tmp/query_guard_issue.md
```

Link as sub-issue:

```bash
NUM_ID=$(gh api repos/Shopify/ad-network-connectivity/issues/<new_issue_number> --jq .id)
gh api -X POST repos/Shopify/ad-network-connectivity/issues/4766/sub_issues -F sub_issue_id=$NUM_ID
```

## Check remediation pull requests and commits

Search for the table, query ID, Query Guard strings, and likely call site.

Useful GitHub searches:

```bash
gh search prs "shopify_query_guard repo:Shopify/ad-network-connectivity" --state closed --limit 100 --json number,title,url,state
```

```bash
gh search prs "<query_id> repo:Shopify/ad-network-connectivity" --state open --limit 20 --json number,title,url,state
```

```bash
gh search issues "<schema.table> Query Guard repo:Shopify/ad-network-connectivity" --state open --limit 20 --json number,title,url,state
```

For code provenance, use `git blame` or GitHub commits by path:

```bash
git blame -L <start>,<end> -- <path>
```

```bash
gh api 'repos/Shopify/ad-network-connectivity/commits?path=<path>&sha=main&per_page=30'
```

Then search pull requests by commit hash:

```bash
gh search prs "<commit_sha> repo:Shopify/ad-network-connectivity" --state closed --merged --limit 10 --json number,title,url,closedAt
```

## Special pitfall: allowlist comments are not warnings

If a query is correctly allowlisted, raw PostgreSQL logs may include SQL text containing:

```sql
shopify_query_guard.allow_scan_tables='schema.table'
```

or:

```sql
shopify_query_guard.full_index_scan_mode='allow'
```

Do not count these as violations unless the log line also contains:

```text
WARNING:  shopify_query_guard
sqlstate=01000
```

A successfully allowlisted query may have `sqlstate=00000` and should not be treated as a violation.

## Special case: hash-bucket scans

Intentional Yugabyte hash-bucket scans often use `yb_hash_code(...) BETWEEN ? AND ?`. These may be acceptable if they are deliberate background scans and carry the right Query Guard allow comment.

Verify both:

1. The SQL includes a Query Guard allowlist comment with a fully qualified table name.
2. Strict warning logs do not still show `WARNING:  shopify_query_guard` for the same `query_id`.

If a loose search found the query only because of the comment, reclassify it as non-violating.

## Special case: Ads Bidify

For Ads Bidify in `shop/world`, use the database user `svc_ads_bidify_1`.

Known pattern from the July 2026 audit:

- One active issue family: `shop.ads_publishers`.
- Query IDs: `-2181997492682131125`, `7969538519133758262`.
- SQL family:

```sql
SELECT uuid, shop_id, status, is_draft,
       typ_enabled, osp_enabled,
       sfr_collections_enabled, sfr_search_enabled
FROM shop.ads_publishers
WHERE shop_id = $1
  AND is_draft = $2
  AND (is_not_deleted IS NULL OR is_not_deleted = $3)
  AND deleted_at IS NULL
```

Likely source:

```text
shop/world/areas/incubating/ads-bidify/crates/common/src/repositories/ad_publisher_yb_repo.rs
```

Known remediation context:

- `shop/world#823528` added Query Guard allow comments for intentional datastore hash scans.
- That PR did not fix the single publisher lookup above.
- The single lookup likely misses a partial index because the index predicate is `is_not_deleted = true` while the query accepts `is_not_deleted IS NULL OR is_not_deleted = true`.

When checking Ads Bidify, search both `shop/world` and `shop/issues-advertising`.

## Final response format

Finish with:

1. A short verdict: complete, incomplete, or table-covered but exact-ID incomplete.
2. New issues created and linked.
3. Issues refreshed with missing IDs.
4. Missing or family-only fingerprints grouped by table.
5. Cross-repo findings for Ads Bidify or other Ads Channels Yugabyte services.
6. A brief "How I found this" section with key commands and Observe filters.

Use concise but explicit language. If exact coverage is incomplete, say so directly.
