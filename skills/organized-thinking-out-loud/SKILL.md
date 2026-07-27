---
name: organized-thinking-out-loud
description: Formats exploratory thoughts and publishes the approved fields to Organized. Use when the user invokes /organized-thinking-out-loud or asks to share a thinking-out-loud reflection on Organized.
---

# Organized Thinking Out Loud

Compose the formatter and publisher without duplicating either one's logic.

## Workflow

1. Require the user's raw thought text. If it is missing, ask for it.
2. Invoke `/thinking-out-loud` with the raw text. Treat its `title`, `summary`, `body`, and `tags` as authoritative; do not reformat them or infer replacements.
3. Show all four exact fields without truncation:

   ```yaml
   title: "..."
   summary: "..."
   body: |-
     ...
   tags:
     - thoughts
     - topic-a
   ```

4. Ask the user to approve those exact fields. Skip this only when the user explicitly waives review, such as "publish without review" or "no confirmation."
5. If the user requests edits, send the requested changes back through `/thinking-out-loud`, show the complete revised fields, and ask again unless review was explicitly waived.
6. After approval or an explicit waiver, invoke `/organized-post` with the four exact fields to publish them to Organized. Let that skill own validation, authentication, persistence, error handling, and result reporting.

Do not implement formatting or publishing here, and do not call the publisher's scripts directly.
