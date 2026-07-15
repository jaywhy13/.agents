# Pull request story guide

A useful story gives a reader enough context to participate in the codebase. It teaches the system and motivating problem before it asks the reader to interpret implementation details.

## Build the background

Write `background` as Markdown in this order:

1. **Reader-facing outcome:** explain what becomes possible and why it matters.
2. **Previous behaviour:** describe the smallest relevant system model before the change.
3. **Vocabulary and intuition:** define unfamiliar terms before using them. Use one concrete example or analogy when it makes the mechanism easier to reason about.
4. **Problem and constraints:** show where the old behaviour fails and identify important boundaries, invariants, or trade-offs.
5. **Intended flow:** add a small Mermaid diagram only when it clarifies a relationship, flow, state transition, or before/after model.
6. **Scope:** state what changes and what remains unchanged.

Do not open with file names, class names, or a list of edits. Do not treat a reasonable inference as a verified fact.

## Build the code story

Write `code_story` as conceptual chapters rather than file-by-file narration. Each chapter should follow this sequence:

1. **Question:** state the implementation question the excerpt answers.
2. **Evidence:** quote the smallest exact contiguous excerpt inside a fenced `diff` block.
3. **Mechanism:** explain how the shown code works at the reader's current level of context.
4. **Consequence:** connect the mechanism to observable behaviour, a protected invariant, or a trade-off.
5. **Boundary:** say what the excerpt does not establish when that distinction matters.

Example shape:

````markdown
## Keep retries tied to the original operation

**Question this chapter answers:** How does a retry retain the identifier operators already know?

```diff
-const retry = createAttempt();
+const retry = createAttempt({ operationId });
```

The retry now carries the original operation identifier instead of creating a second identity.

**Consequence.** Logs and status pages can group every attempt under one operation without hiding that a retry occurred.
````

Every character in a quoted excerpt must come from the source diff. Never reconstruct omitted context, combine non-contiguous lines, improve a comment, or fabricate an unchanged line. Prefer representative excerpts over exhaustive coverage.

## Use diagrams and images safely

Prefer Mermaid in a fenced `mermaid` block because it remains editable and accessible alongside the text. If a static image genuinely teaches better, upload it through Quick and embed it with Markdown:

```markdown
![Requests retain one operation identifier across retry attempts](https://organized.quick.shopify.io/files/retry-flow.png)
```

Use meaningful alt text that explains the information conveyed. Use only safe `http://` or `https://` URLs without embedded credentials. Do not use decorative images, invent URLs, or add unsupported top-level media fields.

## End with a comprehension check

End `code_story` with exactly five medium-difficulty questions about causality, trade-offs, constraints, or observable behaviour. Then provide the answers under a visible Markdown heading:

```markdown
## Check your understanding

1. Why does ...?
2. What would happen if ...?
3. Which boundary ...?
4. Why was ... chosen over ...?
5. What evidence ...?

## Answers

1. ...
2. ...
3. ...
4. ...
5. ...
```

Organized escapes raw HTML, so do not wrap answers in `<details>` or other HTML.

## Verify before approval

- Trace important claims to pull request metadata, exact diff lines, surrounding code, tests, configuration, or review evidence.
- Label limitations and incomplete source coverage explicitly.
- Report only checks that actually ran, including failures or blocked local validation.
- Explain material risks and review findings without presenting the story as approval.
- Confirm every image has meaningful alt text and a safe URL.
- Confirm the story contains no raw HTML.
