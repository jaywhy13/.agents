---
name: dbt-lineage
description: Report data lineage, downstream impact, and governance violations for one or more dbt / data-warehouse models. Use when the user invokes /dbt-lineage, names model(s) and asks for lineage, upstream/ancestors, downstream/descendants, dependencies, blast radius, who consumes a model, or whether it's safe to change/delete a table.
---

# dbt Lineage & Dependency Report

Produces an impact report for one or more models using Shopify's BigQuery lineage
snapshot, the governance-violation summary that backs the **Direct Dependency Daily
Summary** dashboard, and (when run inside a dbt repo) dbt-level dependency tooling.

Two layers of lineage exist — always be clear which one a finding comes from:
- **Data platform** (BigQuery tables, Looker reports): the lineage snapshot. Reflects
  *observed* job runs, so it can lag and miss edges.
- **dbt project** (models, sources, macros): the dbt manifest. Reflects *code*, so it's
  exact for in-project deps but blind to non-dbt consumers (Looker, notebooks, apps).

## Quick start

1. Take the model name(s) from the user. Accept a bare name (`audience_customers_pool`)
   or a fully-qualified name (`sdp-prd-ads.ads.audience_customers_pool`).
2. **Resolve the fully-qualified name.** Bare names are ambiguous. In priority order:
   - If inside a dbt repo, read `dbt_project.yml` (`production_database_name`) + the
     model's `schema.yml` (`schema:`) to build `<project>.<dataset>.<model>`.
   - Else fuzzy-match the table suffix in the snapshot (see REFERENCE.md "Resolve FQN").
   - If still ambiguous, list candidates and ask the user to pick (use the `ask` tool).
3. Run the report queries in [REFERENCE.md](REFERENCE.md) via `data_portal_query_bigquery`
   (or `query_bigquery`). Run the independent ones in one batch.
4. Cross-check the snapshot against the model's dbt `ref()`/`source()` calls to flag
   false negatives (see Workflow step 5).
5. Emit the report (template below) plus pre-filtered dashboard deep-links.

## Workflow (per model)

1. **Identity & metadata** — owner, criticality, layer, deprecation, freshness.
   See REFERENCE.md "Model metadata".
2. **Upstream** — direct ancestors (depth 1) and farthest source tables.
   REFERENCE.md "Upstream ancestors" + "Farthest sources".
3. **Downstream** — direct consumers and the full transitive descendant set, with each
   consumer's owner + criticality (this is the blast radius). REFERENCE.md "Downstream".
4. **Governance violations** — query the dashboard's backing table for this model as
   ancestor *and* descendant. Report each violation with its meaning (REFERENCE.md
   "Violations"). Empty `violations` array = clean edge.
5. **False-negative cross-check** — grep the model SQL for `ref(...)` / `source(...)`.
   Any source/ref NOT present in the snapshot ancestors is a likely false negative
   (job not observed in the window, or not captured by the catalog). Call these out —
   they matter most before deleting a table.
6. **dbt-level deps (only inside a dw/dbt repo)** — run the commands in REFERENCE.md
   "dbt tooling": `dw-utils model list-downstreams`, `dbt ls --select <model>+`, and
   `dev manifest query` for transitive walks.

## Report template

```
## Lineage report: <fqn>
Owner: <owner> | Criticality: <n> | Layer: <layer> | Deprecated: <y/n>

Upstream (what it depends on)
  Direct (depth 1): <list>
  Farthest sources: <list>

Downstream (blast radius — what breaks if this changes)
  Direct consumers (depth 1): <count> — <list with owner/criticality>
  Transitive total: <count>; criticality-5 consumers: <list>

Governance violations (dashboard table)
  <edge> — <violation(s)> — <plain-language meaning>
  ...or "none"

False-negative check
  Declared in SQL but missing from snapshot: <list or none>

dbt project deps (if available)
  <dw-utils / dbt ls / manifest output summary>

Dashboard
  Downstream view: <url>   Upstream view: <url>
```

Build dashboard links with `scripts/dashboard_url.sh` (see REFERENCE.md "Dashboard links").
Set `ancestorTable` to see downstream impact; `descendantTable` to see upstream feeders.

## Multiple models

Loop the workflow per model. Then add a short **cross-model** section: shared upstreams,
and whether any model is a direct/transitive dependency of another in the set.

## Notes & caveats

- The snapshot favors recall but still misses edges (Spark jobs, custom report queries,
  app reads). Never declare "no downstreams, safe to delete" from the snapshot alone —
  confirm with the dbt manifest and step-5 cross-check.
- The governance table starts 2025-06-01 and tracks **direct (depth-1)** edges only.
- Criticality scale: higher number = higher criticality. The table computes `violations`
  for you — surface them, don't recompute.

See [REFERENCE.md](REFERENCE.md) for all SQL templates, table names, FQN conventions, and
dashboard variable details.
