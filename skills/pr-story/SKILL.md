---
name: pr-story
description: Turns a GitHub pull request into a reusable, teaching-first story with background, intuition, exact code samples, and a comprehension check. Use when the user invokes /pr-story or asks to explain, teach, or document a pull request.
---

# Pull Request Story

Help the reader participate in the codebase, not merely approve a change. Start with the system and the problem; earn the right to discuss implementation.

## Inputs

- Pull request URL. If omitted, resolve the pull request for the current branch.
- Optional reader context: what they already know and what they care about.
- Optional output path for the JSON artifact.

## Workflow

1. **Inspect before explaining.** Use `gh pr view` and `gh pr diff` to collect metadata, description, commits, changed files, reviews, and comments. Read repository instructions and relevant surrounding code on both sides of the change. Trace important symbols to callers, tests, configuration, and data boundaries. Never infer the system from the diff alone.
2. **Find the teaching path.** Identify the reader-facing capability, previous behaviour, motivating problem, constraints, central idea, and observable result. Define unfamiliar terms before using them. Order concepts by dependency, not file path.
3. **Write concise background.** Explain the prior system, necessary vocabulary, motivating problem, constraints, scope, and unchanged behaviour. Add short **Essential files** and **Essential symbols** maps with one plain-language purpose per item.
4. **Build intuition.** Write an independent `intuition` Markdown field with one mental model, concrete example, or sustained analogy that lets the reader predict the change. Add a small Mermaid diagram or meaningful static image only when it materially clarifies the model.
5. **Tell the code story.** Follow [STORY-GUIDE.md](STORY-GUIDE.md). Arrange the implementation into conceptual chapters covering the question, mechanism, consequence, trade-offs, evidence, and unchanged behaviour. Keep exact excerpts in `code_samples`, not the narrative.
6. **Show real code.** Use exact excerpts from callers, tests, configuration, or changed code. Name the file and symbol, state each sample's purpose, and include at least one non-empty fenced `diff` excerpt copied exactly and contiguously from the pull request diff. Never invent teaching code.
7. **Test understanding.** End `code_samples` with exactly five medium-difficulty questions about causality, trade-offs, and behaviour, followed by visible answers under a `## Answers` heading. Do not use raw HTML.
8. **Verify every claim.** Check facts and samples against code or pull request evidence. Distinguish facts from inferences, state limitations, and report only checks that ran.
9. **Create the artifact.** Write one JSON object matching [SCHEMA.md](SCHEMA.md). Use the requested output path or a safe temporary `.json` path, then return both the artifact and its path so another skill can consume it. Do not send it to an external service.

## Quality bar

- Teach **concise background → concise intuition → code story → code samples → comprehension check** without duplication.
- Keep `summary` to one plain-language sentence and use one domain term per concept.
- Preserve exact code in every excerpt; never fabricate omitted context.
- Prefer one useful diagram over several decorative ones, use meaningful image alt text, and use no raw HTML.
- Explain material risks, rejected alternatives, limitations, and unchanged behaviour.
- For a very large pull request, teach the architectural spine and representative diffs, then link to the full change.
- Treat the story as explanation, not approval: it does not replace code review.
