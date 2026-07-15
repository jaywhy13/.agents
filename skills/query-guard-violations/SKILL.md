---
name: query-guard-violations
description: Investigates Shopify Query Guard SQL fingerprints for ANC and classifies which ones still need fixes. Use when checking ad-network-connectivity Query Guard violations, active SQL fingerprints, last warning times, or whether fixes have stopped Query Guard warnings.
---

# Query Guard Violations

Use this skill to identify which Ad Network Connectivity (ANC) database-query fingerprints still need a code fix.

## Core idea

A Query Guard warning proves the fingerprint was violating at that timestamp. If that warning is the latest observed event, treat the fingerprint as still needing a fix unless it is dormant and has not run recently.

## Required data sources

Observe Investigate API is Shopify’s observability query API for logs and performance datasets. Use Observe data, not code search alone.

1. `yugabyte` logs — source of Query Guard warning events.
2. `yugabyte_performance_merge_view` — source of `pg_stat_statements` execution observations and normalized SQL fingerprints.

In the Observe agent docs, read `/llms.txt`, `/agents/playbooks/query`, `/agents/dataset/yugabyte`, and `/agents/dataset/yugabyte_performance_merge_view` before constructing queries.

## Standard filters

For ANC production Query Guard warnings:

- `service = postgresql`
- `yugabyte_cluster = gdb`
- `message contains WARNING:  shopify_query_guard`
- `message contains username=svc_ads_anc_2`

For ANC production execution observations:

- `source = pg_stat_statements`
- `shopify.labels.environment = production`
- `common.username = svc_ads_anc_2`

Default recent window: any warning in the last 1 hour. Also check the last 30 minutes to spot currently firing fingerprints.

## Workflow

1. **Find the fingerprint set.** Query `yugabyte` over the requested window, usually 24 hours. Extract `query_id` from `query_id=([-0-9]+)` and table from `table '([^']+)'`. For 24-hour checks, split into 6-hour windows if the cost check is not low.
2. **Check current activity.** Run the same warning query over `now-30m` and `now-1h` to identify actively firing fingerprints.
3. **Compare warning time to clean execution time.** For each table / `query_id` pair, query `yugabyte_performance_merge_view` for latest `MAX(timestamp)`, `common.tables`, and `common.fingerprint`.
4. **Classify each fingerprint.** Use the classification rules below.
5. **Use teammates for large sets when available.** If teammates are available and there are more than 20 fingerprints, split by table or query-id groups. Ask each teammate for warning count, latest warning, latest execution, classification, notes, and Observe query URLs.
6. **Report the result.** Lead with counts, then a prioritized `still_needs_fix` table, then `appears_fixed`, then `dormant_unclear`.

## Classification rules

| Classification | Rule |
|---|---|
| `still_needs_fix` | The latest observed run is a Query Guard warning, or a recent warning has no later clean execution observation. |
| `appears_fixed` | A clean `pg_stat_statements` observation exists after the latest warning, and no warning exists after that clean observation. |
| `dormant_unclear` | The last observed event was a warning, but the fingerprint has not warned in the recent window and has no later clean execution observation. |

## Output shape

Use separate sections for each status.

For `still_needs_fix`:

| Priority | Table | Query ID | Window warnings | Last warning | Last clean execution | Next action |
|---:|---|---:|---:|---|---|---|

For `appears_fixed`:

| Table | Query ID | Last warning | Last clean execution | Post-clean warnings |
|---|---:|---|---|---:|

For `dormant_unclear`:

| Table | Count | Query IDs |
|---|---:|---|

Also include a short “How I found this” section with the Observe query IDs or URLs used.

## Query templates

See [REFERENCE.md](REFERENCE.md) for copy-paste Observe query templates.
