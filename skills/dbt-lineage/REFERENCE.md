# dbt-lineage — Reference

## Tables and FQN conventions

| Table | Purpose | Ancestor/descendant format |
|---|---|---|
| `shopify-dw.infrastructure.data_catalog_lineage_current` (and `_v1`) | Closure table: every ancestor→descendant pair with `depth_level` (shortest-path hops). Current snapshot. | `bigquery:<project>.<dataset>.<table>` |
| `shopify-dw.mart_analytics_engineering.data_catalog_lineage_dependency_daily_summary` | Backs the **Direct Dependency Daily Summary** dashboard. Direct (depth-1) edges + governance `violations`, one row per edge per day. | `<project>.<dataset>.<table>` (NO `bigquery:` prefix) |

Two different FQN conventions — mind the `bigquery:` prefix on the closure table only.
`depth_level = 0` rows are self-links (filter `depth_level >= 1` to drop them).
`data_catalog_lineage_current` is a view over `..._daily_snapshot_v1`.

The dependency summary lives in `mart_analytics_engineering`, NOT `mart_infrastructure`
(older docs say `mart_infrastructure` / `mart__infrastructure` — both are wrong now).

## Resolve FQN (bare name → fully-qualified)

Preferred: inside a dbt repo, read `production_database_name` from `dbt_project.yml` and
`schema:` from the model's `schema.yml`, then `<db>.<schema>.<model>`.

Fallback: fuzzy-match the suffix in the snapshot and let the user disambiguate.
```sql
SELECT DISTINCT descendant
FROM `shopify-dw.infrastructure.data_catalog_lineage_current`
WHERE descendant LIKE '%.<bare_name>'
LIMIT 25
```

## Model metadata

Prefer `data_portal_get_entry_metadata('bigquery:<fqn>')` for owner / criticality / layer
/ deprecation / freshness. If that 403s, read owner+criticality from the dependency
summary struct fields (`ancestor.owner`, `ancestor.criticality`, `ancestor.layer`).

## Upstream ancestors (depth 1 + all)
```sql
SELECT ancestor, depth_level
FROM `shopify-dw.infrastructure.data_catalog_lineage_current`
WHERE descendant = 'bigquery:<fqn>' AND depth_level >= 1
ORDER BY depth_level, ancestor
```

## Farthest sources (roots of the upstream tree)
```sql
DECLARE target_model STRING DEFAULT 'bigquery:<fqn>';
WITH upstream_datasets AS (
  SELECT DISTINCT ancestor
  FROM `shopify-dw.infrastructure.data_catalog_lineage_current`
  WHERE descendant = target_model
)
SELECT DISTINCT u.ancestor
FROM upstream_datasets u
LEFT JOIN `shopify-dw.infrastructure.data_catalog_lineage_current` lc
  ON u.ancestor = lc.descendant AND lc.depth_level = 1
WHERE lc.ancestor IS NULL
ORDER BY 1
```

## Downstream (blast radius)
Direct consumers with owner + criticality from the governance table:
```sql
SELECT descendant_fully_qualified_name AS consumer,
       descendant.owner AS owner, descendant.criticality AS criticality, violations
FROM `shopify-dw.mart_analytics_engineering.data_catalog_lineage_dependency_daily_summary`
WHERE date = (SELECT MAX(date) FROM `shopify-dw.mart_analytics_engineering.data_catalog_lineage_dependency_daily_summary`)
  AND ancestor_fully_qualified_name = '<fqn>'   -- no bigquery: prefix
ORDER BY descendant.criticality DESC
```
Full transitive descendant set (depth-N) from the closure table:
```sql
SELECT descendant, depth_level
FROM `shopify-dw.infrastructure.data_catalog_lineage_current_v1`
WHERE ancestor = 'bigquery:<fqn>' AND depth_level >= 1
ORDER BY depth_level, descendant
```

## Violations (edges for this model as ancestor OR descendant)
```sql
-- NOTE: never alias a column `desc` — it is a reserved word in BigQuery.
SELECT date, ancestor_fully_qualified_name, descendant_fully_qualified_name,
       ancestor.owner AS anc_owner, ancestor.criticality AS anc_crit,
       descendant.owner AS dsc_owner, descendant.criticality AS dsc_crit,
       violations
FROM `shopify-dw.mart_analytics_engineering.data_catalog_lineage_dependency_daily_summary`
WHERE date = (SELECT MAX(date) FROM `shopify-dw.mart_analytics_engineering.data_catalog_lineage_dependency_daily_summary`)
  AND ('<fqn>' IN (ancestor_fully_qualified_name, descendant_fully_qualified_name))
  AND ARRAY_LENGTH(violations) > 0
ORDER BY ARRAY_LENGTH(violations) DESC
```

Violation meanings (the table computes these; just explain them):
- **mart** — a non-domain model is used directly in a mart.
- **criticality** — ancestor has higher criticality than descendant (critical data
  flowing into a less-protected model).
- **deprecation** — ancestor is deprecated but the descendant still consumes it.
- **ownership** — ancestor and descendant have different owners and the ancestor is not
  a domain model (cross-team coupling on a non-shared asset).
- **public** — a non-public model is consumed by a different owner.
- **timeliness** — descendant has stricter freshness requirements than its ancestor
  (descendant can't be fresher than what feeds it).

## dbt tooling (only when run inside a data-warehouse / dbt repo)

From the Vault "Lineage and Dependencies" page:
```bash
# Cross-platform downstreams (dbt + Looker + Data Portal):
dw-utils model list-downstreams <model_name>

# dbt selector: model plus N hops downstream (sources don't appear as nodes):
dbt ls --resource-type model --select <model_name>+3

# Manifest queries (DuckDB SQL over the parsed project):
dev manifest query "<sql>"
dev manifest validate --only models_must_respect_transitive_criticality
```
Transitive downstream walk via manifest (recursive DuckDB):
```sql
CREATE TABLE IF NOT EXISTS deps AS (
  SELECT node AS src, dbt_models.unique_id AS dest
  FROM dbt_models, unnest(depends_on.nodes) AS t(node)
);
WITH RECURSIVE paths AS (
  SELECT src AS node, dest, [dest] AS path FROM deps
  WHERE src = 'model.data_warehouse.<model_name>'
  UNION ALL
  SELECT p.node, deps.dest, list_append(p.path, deps.dest)
  FROM deps JOIN paths p ON deps.src = p.dest
)
SELECT split(node,'.')[-1], split(dest,'.')[-1], len(path) AS depth FROM paths
```

## Dashboard links

Base: `https://observe.shopify.io/d/aelw2qn5qptkwd/direct-dependency-daily-summary`
Key variables: `var-ancestorTable`, `var-descendantTable`, `var-ancestorOwner`,
`var-descendantOwner`, `var-ancestorCriticality` (repeatable), `var-violations` (repeatable).

- **Downstream impact view**: set `var-ancestorTable=<bare_table>` (descendantTable empty).
- **Upstream feeders view**: set `var-descendantTable=<bare_table>` (ancestorTable empty).

Generate URLs deterministically:
```bash
scripts/dashboard_url.sh downstream <bare_table>
scripts/dashboard_url.sh upstream   <bare_table>
```
`var-*Table` uses the bare table name (e.g. `base__sensitive_orders`), not the FQN.
