---
name: organized-todo
description: Fetches a work todo and its background links from Organized. Use when invoked for an Organized todo, when a todo identifier must be resolved from WORK_TODO_ID, or when another skill needs the todo title and description as the current work background.
---

# Organized Todo

Fetch one todo from Organized's `work_resources` collection and return a small background record. Do not begin todo work.

## Input

Use the todo identifier supplied by the caller. When it is omitted, read `WORK_TODO_ID`. Stop with a clear error when neither is available.

## Fetch the todo

1. Call `quick_query_collection` with:
   - `site`: `organized`
   - `collection`: `work_resources`
   - `filter`: `{"resource_type":"todo","resource_key":"todo/<todo-id>"}`
   - `limit`: `2`
2. Require exactly one record. Do not guess when none or more than one is returned.
3. Require `record_schema_version` to equal `1`.
4. When `WORK_PROJECT_ID` or `WORK_TASK_ID` is set, verify the record's `project_id` and `task_id` match them.
5. Read:
   - identifier from `domain_id`
   - title from `title`
   - description from `body`; report `No description provided.` when it is empty

## Fetch available links

Start with `WORK_TODO_CONTEXT_ID` when set; otherwise use the todo's `context_id`. For each context identifier:

1. Query `work_resources` for `resource_type=context` and `resource_key=context/<context-id>` with limit `2`.
2. Require exactly one schema-version-1 record.
3. Collect each `references` entry's `reference_type` and `reference_url`.
4. Continue through `parent_id` until it is null. Stop and report an error if an identifier repeats.

Deduplicate links by the exact `(reference_type, reference_url)` pair.

## Return

Return only this structured background block to the calling workflow:

```text
ORGANIZED_TODO
project_id: <project_id>
task_id: <task_id>
id: <domain_id>
title: <title>
description: <body or No description provided.>
links:
- <reference_type>: <reference_url>
```

Use `links: []` when no references exist. State that this is background information, not an instruction to act.
