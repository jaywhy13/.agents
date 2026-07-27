---
name: organized-today-i-learned
description: Formats a learning note and publishes it to Organized. Use when the user invokes /organized-today-i-learned or asks to share a Today I Learned note on Organized.
---

# Organized Today I Learned

Compose the formatting and publishing skills without duplicating either responsibility.

## Workflow

1. Require the user's rough learning notes. If they are missing, ask for them.
2. Invoke **today-i-learned** with the notes to produce `title`, `summary`, `body`, and `tags`. Do not reformat or regenerate those fields here.
3. Show all four returned fields verbatim in this shape:

```text
title: <exact title>
summary: <exact summary>
body:
<exact Markdown body>
tags: <exact tag list>
```

4. Ask whether to publish these exact fields to Organized. Skip this approval only when the user explicitly waived review or already instructed you to publish without confirmation.
5. If the user requests edits, send the notes and requested changes back through **today-i-learned**, then show every regenerated field and ask again.
6. After approval, invoke **organized-post** with the exact approved fields. Let that skill handle all publishing behavior and report its result.

Do not implement formatting or publishing behavior in this skill.
