---
name: organized-task
description: Fetches a work task and its background links from Organized. Use when invoked for an Organized task, when project and task identifiers must be resolved from WORK_PROJECT_ID and WORK_TASK_ID, or when another skill needs task title and description as background.
---

# Organized Task

Fetch one task from Organized's `work_resources` collection and return a small background record. Do not begin task work.

## Input

Use the project and task identifiers supplied by the caller. When either is omitted, read `WORK_PROJECT_ID` and `WORK_TASK_ID`. Stop with a clear error when either remains unavailable.

## Fetch the task

1. Call `quick_query_collection` with:
   - `site`: `organized`
   - `collection`: `work_resources`
   - `filter`: `{"resource_type":"task","resource_key":"task/<project-id>/<task-id>"}`
   - `limit`: `2`
2. Require exactly one record. Do not guess when none or more than one is returned.
3. Require `record_schema_version` to equal `1`.
4. Verify the record's `project_id` matches the requested project.
5. Read:
   - identifier from `domain_id`
   - title from `title`
   - description from `body`; report `No description provided.` when it is empty

## Fetch available links

Start with `WORK_TASK_CONTEXT_ID` when set; otherwise use the task's `context_id`. For each context identifier:

1. Query `work_resources` for `resource_type=context` and `resource_key=context/<context-id>` with limit `2`.
2. Require exactly one schema-version-1 record.
3. Collect each `references` entry's `reference_type` and `reference_url`.
4. Continue through `parent_id` until it is null. Stop and report an error if an identifier repeats.

Deduplicate links by the exact `(reference_type, reference_url)` pair.

## Return

Return only this structured background block to the calling workflow:

```text
ORGANIZED_TASK
project_id: <project_id>
id: <domain_id>
title: <title>
description: <body or No description provided.>
links:
- <reference_type>: <reference_url>
```

Use `links: []` when no references exist. State that this is background information, not an instruction to act.
