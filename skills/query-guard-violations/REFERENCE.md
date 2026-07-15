# Query Guard violation Observe templates

Use these request bodies to gather warning counts, latest warnings, latest clean executions, and post-clean warning checks for Query Guard fingerprints.

Always run `POST /api/v3/explain` before any query over more than 6 hours, any query without exact `query_id` / table filters, or any query against a dataset you have not used in this session.

## Placeholder legend

- `<QUERY_ID>`: the Yugabyte `query_id` string from the Query Guard warning, including a leading `-` when present.
- `<TABLE>`: the exact guarded table string from the warning, for example `ads_anc.audiences`.
- `<CLEAN_EXECUTION_TIMESTAMP>`: an ISO 8601 UTC timestamp from the latest clean `pg_stat_statements` observation, for example `2026-07-08T02:08:10Z`.

## 1. Group Query Guard warnings by fingerprint

Use this against `POST /api/v3/query`. For 24 hours, split into 6-hour windows if the explain result is not low.

To check active firing, rerun this template with `start_time` set to `now-30m` and `now-1h`.

```json
{
  "datasets": ["yugabyte"],
  "filter_group": {
    "filter_groups": [
      {
        "conjunction": "AND",
        "filters": [
          {"column": "service", "op": "=", "value": "postgresql"},
          {"column": "yugabyte_cluster", "op": "=", "value": "gdb"},
          {"column": "message", "op": "contains", "value": "WARNING:  shopify_query_guard"},
          {"column": "message", "op": "contains", "value": "username=svc_ads_anc_2"}
        ]
      }
    ]
  },
  "derived_fields": [
    {
      "type": "regex-extract",
      "alias_to": "query_id",
      "options": {"source_field": "message", "regex": "query_id=([-0-9]+)"}
    },
    {
      "type": "regex-extract",
      "alias_to": "guard_table",
      "options": {"source_field": "message", "regex": "table '([^']+)'"}
    }
  ],
  "calculations": [{"op": "COUNT"}],
  "breakdowns": ["query_id", "guard_table"],
  "orders": [{"op": "COUNT", "order": "desc"}],
  "limit": 500,
  "start_time": "now-6h",
  "end_time": "now",
  "result_type": "summary",
  "raw_data_mode": true,
  "persist_results": true
}
```

## 2. Latest warning for one fingerprint

Add exact query and table filters to reduce scan cost.

```json
{
  "datasets": ["yugabyte"],
  "filter_group": {
    "filter_groups": [
      {
        "conjunction": "AND",
        "filters": [
          {"column": "service", "op": "=", "value": "postgresql"},
          {"column": "yugabyte_cluster", "op": "=", "value": "gdb"},
          {"column": "message", "op": "contains", "value": "WARNING:  shopify_query_guard"},
          {"column": "message", "op": "contains", "value": "username=svc_ads_anc_2"},
          {"column": "message", "op": "contains", "value": "query_id=<QUERY_ID>"},
          {"column": "message", "op": "contains", "value": "table '<TABLE>'"}
        ]
      }
    ]
  },
  "calculations": [
    {"op": "COUNT"},
    {"op": "MAX", "column": "timestamp"}
  ],
  "limit": 10,
  "start_time": "now-24h",
  "end_time": "now",
  "result_type": "summary",
  "raw_data_mode": true,
  "persist_results": true
}
```

## 3. Latest clean execution observation

Use this to decide whether a warning has been superseded by a later clean `pg_stat_statements` observation.

Set `start_time` to the start of the warning investigation window, or earlier than the earliest warning being classified. Do not leave it at `now-24h` for longer lookbacks.

```json
{
  "datasets": ["yugabyte_performance_merge_view"],
  "filter_group": {
    "filter_groups": [
      {
        "conjunction": "AND",
        "filters": [
          {"column": "source", "op": "=", "value": "pg_stat_statements"},
          {"column": "shopify.labels.environment", "op": "=", "value": "production"},
          {"column": "common.username", "op": "=", "value": "svc_ads_anc_2"},
          {"column": "common.queryid", "op": "in", "value": ["<QUERY_ID_1>", "<QUERY_ID_2>"]}
        ]
      }
    ]
  },
  "calculations": [
    {"op": "MAX", "column": "timestamp"},
    {"op": "ANY", "column": "common.fingerprint"}
  ],
  "breakdowns": ["common.queryid", "common.tables"],
  "orders": [{"column": "timestamp", "op": "MAX", "order": "desc"}],
  "limit": 500,
  "start_time": "now-24h",
  "end_time": "now",
  "result_type": "summary",
  "raw_data_mode": true,
  "persist_results": true
}
```

## 4. Warning check after a clean execution

Use this after a candidate `appears_fixed` fingerprint. Set `start_time` to the clean execution timestamp.

```json
{
  "datasets": ["yugabyte"],
  "filter_group": {
    "filter_groups": [
      {
        "conjunction": "AND",
        "filters": [
          {"column": "service", "op": "=", "value": "postgresql"},
          {"column": "yugabyte_cluster", "op": "=", "value": "gdb"},
          {"column": "message", "op": "contains", "value": "WARNING:  shopify_query_guard"},
          {"column": "message", "op": "contains", "value": "username=svc_ads_anc_2"},
          {"column": "message", "op": "contains", "value": "query_id=<QUERY_ID>"},
          {"column": "message", "op": "contains", "value": "table '<TABLE>'"}
        ]
      }
    ]
  },
  "calculations": [{"op": "COUNT"}],
  "limit": 10,
  "start_time": "<CLEAN_EXECUTION_TIMESTAMP>",
  "end_time": "now",
  "result_type": "summary",
  "raw_data_mode": true,
  "persist_results": true
}
```

Interpretation: `COUNT = 0` supports `appears_fixed`; `COUNT > 0` means the fingerprint still needs a fix.
