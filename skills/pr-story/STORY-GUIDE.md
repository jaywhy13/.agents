# Pull request story guide

A useful story gives a reader enough context to participate in the codebase without burying the change in explanation. It teaches in five complementary stages: concise background, concise intuition, implementation narrative, practical code samples, then a comprehension check.

## 🌍 Build a concise background

Write `background` as Markdown in this order:

1. **Previous system:** briefly describe how the relevant system behaved before the pull request.
2. **Vocabulary:** define only the domain terms needed to understand the problem.
3. **Motivating problem:** show where the old behaviour fails and why that matters.
4. **Constraints and scope:** identify the boundaries that shape a valid solution, what changes, and what remains unchanged.
5. **Essential files:** list only the files the reader must recognize, with one plain-language purpose for each.
6. **Essential symbols:** list only the classes, functions, data types, configuration keys, or other symbols the reader must recognize, with one plain-language purpose for each.

The file and symbol walkthroughs are a map of the relevant system, not an implementation narration. Keep the whole field succinct. Do not introduce the analogy that belongs in `intuition`, explain the new code path step by step, or treat an inference as verified fact.

## 🧭 Build concise intuition

Write `intuition` as required Markdown with at least one heading. Its job is to let the reader predict the solution before seeing code.

1. **Use one simple mental model:** lead with a concrete example or sustained analogy when it makes the change easier to reason about.
2. **Define only necessary roles:** explain the plain-language purpose of each concept the mental model depends on, without repeating the Background file and symbol maps.
3. **Connect the roles:** show how information or control should move between them without citing exact files, symbols, methods, or diff lines.
4. **Use one useful visual when needed:** include a small Mermaid diagram only when a flow, relationship, state transition, or before/after comparison materially improves understanding.
5. **Make a prediction:** finish with the behaviour or design shape the reader should expect.

Prefer one strong idea over several partial analogies. Keep exact implementation narration and evidence for the following fields.

## 🧩 Tell the code story

Write `code_story` as a concise conceptual implementation narrative. Each chapter should answer:

1. **Question:** what implementation problem does this step solve?
2. **Mechanism:** how do the concepts established earlier cooperate?
3. **Consequence:** what observable behaviour or invariant follows?
4. **Trade-off and boundary:** what does this cost, leave unchanged, or fail to establish?
5. **Evidence location:** which file, symbol, test, configuration, or pull request evidence supports the explanation?

Do not place the comprehension check here. Avoid repeating Background and Intuition, dumping every changed file, or narrating syntax line by line. Exact excerpts belong in `code_samples` so the narrative remains easy to follow.

## 🧪 Show practical code samples

Write `code_samples` as required Markdown after `code_story`. Its purpose is to show how a reader would recognize, construct, call, configure, test, or connect the important components.

For each sample:

1. **State the practical question:** for example, “How does a caller create this service?” or “Where does the controller hand work to the repository?”
2. **Name the location:** identify the exact file path and symbol when available.
3. **State the purpose:** explain what this sample lets the reader do or understand.
4. **Quote real code:** use the smallest exact excerpt that answers the question.
5. **Explain the interaction:** connect inputs, outputs, collaborators, and protected behaviour without narrating every line.

Include at least one non-empty fenced `diff` excerpt copied contiguously and exactly from the pull request diff. When surrounding repository code gives a clearer real usage example, include that exact source under its real language fence and clearly distinguish it from the pull request diff. Never invent illustrative code, reconstruct omitted context, improve a comment, or combine non-contiguous lines. If the available source does not show a useful interaction, say so.

Example shape:

````markdown
## 🧪 Call the retry service from the job

**Location:** `jobs/retry_job.rb` · `RetryJob#perform`

**Purpose:** This caller shows which identifier survives across attempts.

```diff
-Result.create!(attempt_id: attempt.id)
+Result.create!(operation_id: operation.id, attempt_id: attempt.id)
```

The caller supplies both identities: the operation groups attempts, while the attempt still identifies one execution.
````

## 🧠 End with a comprehension check

End `code_samples` with exactly five medium-difficulty questions about causality, trade-offs, constraints, component interactions, or observable behaviour. Then provide the answers under a visible Markdown heading:

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

## 🖼️ Use diagrams and images safely

Prefer Mermaid in a fenced `mermaid` block because it remains editable and accessible beside the text. Put a conceptual teaching diagram in `intuition`. Use a later diagram only when it explains implementation evidence that the intuition diagram cannot cover.

If a static image genuinely teaches better, upload it through Quick and embed it with Markdown:

```markdown
![Requests retain one operation identifier across retry attempts](https://organized.quick.shopify.io/files/retry-flow.png)
```

Use meaningful alt text that explains the information conveyed. Use only safe `http://` or `https://` URLs without embedded credentials. Do not use decorative images, invent URLs, or add unsupported top-level media fields.

## 🔎 Verify before publishing

- Confirm `background`, `intuition`, `code_story`, and `code_samples` are complementary and appear in that teaching order.
- Confirm Background has concise Essential files and Essential symbols maps with a purpose for every item.
- Trace important claims and every code sample to pull request metadata, exact diff lines, surrounding code, tests, configuration, or review evidence.
- Confirm every fenced `diff` excerpt is exact and contiguous, and every other code sample is exact repository source.
- Label limitations and incomplete source coverage explicitly.
- Report only checks that actually ran, including failures or blocked local validation.
- Explain material risks and review findings without presenting the story as approval.
- Confirm every image has meaningful alt text and a safe URL.
- Confirm all four Markdown fields contain headings and no raw HTML.
- Publish immediately after verification without asking for approval. Only stop at a draft when the user explicitly requests one.
