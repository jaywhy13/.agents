# Pull request story guide

A useful story gives a reader enough context to participate in the codebase. It teaches in three complementary stages: background, intuition, then implementation evidence.

## 🌍 Build the background

Write `background` as Markdown in this order:

1. **Previous system:** describe how the relevant system behaved before the pull request.
2. **Vocabulary:** define only the domain terms needed to understand the problem.
3. **Motivating problem:** show where the old behaviour fails and why that matters.
4. **Constraints:** identify boundaries, invariants, risks, and trade-offs that shape a valid solution.
5. **Scope:** state what the pull request aims to change and what remains unchanged.

Do not explain the new implementation, narrate files or functions, or introduce the analogy that belongs in `intuition`. Do not treat a reasonable inference as a verified fact.

## 🧭 Build the intuition

Write `intuition` as required Markdown with at least one heading. Its job is to let the reader predict the shape of the solution before seeing code.

1. **Use one simple mental model:** lead with a concrete example or sustained analogy when it makes the change easier to reason about.
2. **Define every conceptual role first:** before relying on a service, class, data type, repository, client, state machine, callback, or similar concept, explain its plain-language purpose and place in the mental model.
3. **Connect the roles:** explain how information or control should move between them, without citing exact files, methods, or diff lines.
4. **Explore the model:** include a small Mermaid diagram when a flow, relationship, state transition, or before/after comparison materially improves understanding. Omit decorative diagrams.
5. **Make a prediction:** finish with the behaviour or design shape the reader should now expect the implementation to provide.

The intuition must explain every concept it relies on. Keep exact implementation narration and evidence for `code_story`.

## 🧩 Build the code story

Write `code_story` as conceptual chapters rather than file-by-file narration. Each chapter should follow this sequence:

1. **Question:** state the implementation question the excerpt answers.
2. **Evidence:** quote the smallest exact contiguous excerpt inside a fenced `diff` block.
3. **Mechanism:** explain how the shown code works using concepts already established in intuition.
4. **Consequence:** connect the mechanism to observable behaviour or a protected invariant.
5. **Trade-off and boundary:** explain material costs, risks, unchanged behaviour, or what the excerpt does not establish.

Example shape:

````markdown
## 🪪 Keep retries tied to the original operation

**Question this chapter answers:** How does a retry retain the identifier operators already know?

```diff
-const retry = createAttempt();
+const retry = createAttempt({ operationId });
```

The retry now carries the original operation identifier instead of creating a second identity.

**Consequence.** Logs and status pages can group every attempt under one operation without hiding that a retry occurred.
````

Every character in a quoted excerpt must come from the source diff. Never reconstruct omitted context, combine non-contiguous lines, improve a comment, or fabricate an unchanged line. Prefer representative excerpts over exhaustive coverage. Do not repeat the prior-system explanation or analogy from the earlier fields.

## 🖼️ Use diagrams and images safely

Prefer Mermaid in a fenced `mermaid` block because it remains editable and accessible alongside the text. Put a conceptual teaching diagram in `intuition`. Use a `code_story` diagram only when it explains implementation evidence that cannot be understood from the intuition diagram.

If a static image genuinely teaches better, upload it through Quick and embed it with Markdown:

```markdown
![Requests retain one operation identifier across retry attempts](https://organized.quick.shopify.io/files/retry-flow.png)
```

Use meaningful alt text that explains the information conveyed. Use only safe `http://` or `https://` URLs without embedded credentials. Do not use decorative images, invent URLs, or add unsupported top-level media fields.

## 🧠 End with a comprehension check

End `code_story` with exactly five medium-difficulty questions about causality, trade-offs, constraints, or observable behaviour. Then provide the answers under a visible Markdown heading:

```markdown
## 🧠 Check your understanding

1. Why does ...?
2. What would happen if ...?
3. Which boundary ...?
4. Why was ... chosen over ...?
5. What evidence ...?

## ✅ Answers

1. ...
2. ...
3. ...
4. ...
5. ...
```

Organized escapes raw HTML, so do not wrap answers in `<details>` or other HTML.

## 🔎 Verify before approval

- Confirm `background`, `intuition`, and `code_story` are complementary and appear in that teaching order.
- Trace important claims to pull request metadata, exact diff lines, surrounding code, tests, configuration, or review evidence.
- Label limitations and incomplete source coverage explicitly.
- Report only checks that actually ran, including failures or blocked local validation.
- Explain material risks and review findings without presenting the story as approval.
- Confirm every image has meaningful alt text and a safe URL.
- Confirm all three Markdown fields contain headings and no raw HTML.
- Preview the complete three-field story for approval before publishing.
