---
name: pr-story
description: Turns a GitHub pull request into a teaching-first story with background, intuition, diagrams when useful, a literate code diff, and a comprehension quiz, then publishes it to Organized. Use when the user invokes /pr-story, asks to explain or document a pull request, or wants a pull request added or refreshed in Organized.
---

# Pull Request Story

Help the reader participate in the codebase, not merely approve a change. Start with the system and the problem; earn the right to discuss implementation.

## Inputs

- Pull request URL. If omitted, resolve the pull request for the current branch.
- `watch`: whether Organized should watch the pull request; default `false` for a new record and preserve the stored value when refreshing one.
- Optional reader context: what they already know and what they care about.

## Workflow

1. **Inspect before explaining.** Use `gh pr view` and `gh pr diff` to collect metadata, description, commits, changed files, reviews, and comments. Read repository instructions and the relevant surrounding code on both sides of the change. Trace important symbols to callers, tests, configuration, and data boundaries. Never infer the system from the diff alone.
2. **Find the teaching path.** Identify the reader-facing capability, the previous behaviour, the motivating problem, constraints, the central idea, and the observable result. Define unfamiliar terms before using them. Order concepts by dependency, not by file path.
3. **Write a concise background.** Briefly explain the prior system, necessary vocabulary, motivating problem, constraints, scope, and unchanged behaviour. Add short **Essential files** and **Essential symbols** walkthroughs: name only what the reader must recognize, and give each item one plain-language purpose. This is an orientation map, not a narration of the new implementation.
4. **Build concise intuition.** Write a required, independent `intuition` Markdown field with one simple mental model, concrete example, or sustained analogy that lets the reader predict the change. Define only the concepts the story needs. Put a small Mermaid diagram or meaningful static image here when it materially clarifies a relationship, flow, state transition, or before/after model; omit decorative diagrams.
5. **Write the code story.** Follow [STORY-GUIDE.md](STORY-GUIDE.md). Arrange the implementation into conceptual chapters that explain the question, mechanism, consequence, trade-offs, evidence, and unchanged behaviour. Keep exact code excerpts out of this field so the narrative remains readable. Do not repeat the background or intuition, dump every file, or narrate syntax line by line.
6. **Show how to work with the components.** Write required `code_samples` Markdown after `code_story`. Prefer small exact excerpts from real callers, tests, configuration, or changed code that show how important components are constructed, called, or connected. Name the file and symbol, state the sample's purpose, and explain what the reader should notice. Include at least one non-empty fenced `diff` excerpt copied exactly from the pull request diff. Other language-fenced examples must be exact repository source, never invented teaching code. If a useful interaction is not visible in the diff or surrounding repository, say so instead of fabricating it.
7. **Test understanding after the samples.** End `code_samples` with exactly five medium-difficulty questions that test causality, trade-offs, and behaviour. Put answers under a visible `## Answers` Markdown heading; Organized escapes raw HTML, so do not use `<details>`.
8. **Verify the story.** Check every factual claim and code sample against code or pull request evidence. Distinguish facts from reasonable inferences, include important limitations, and report test or check results without claiming unrun validation.
9. **Prepare the record.** Write JSON matching [SCHEMA.md](SCHEMA.md). `author` is the GitHub pull request author; the publisher separately records the authenticated Organized user as `created_by`.
10. **Publish or refresh immediately.** Do not ask for approval or pause to show a preview. Once the story is verified, save the JSON to a temporary file and run:

```bash
node ~/.agents/skills/pr-story/scripts/publish-pr-story.mjs /tmp/pr-story.json
```

The publisher creates a parent and v1 for a new story. For an existing story with the same repository and pull request number, it appends the next immutable Story Version only when reader-facing content changed, then updates the parent's current projection. Identical and Watch-only publishes do not create versions. Delete the temporary file after success and report the Organized URL and record identifier. Only skip publishing when the user explicitly requests a draft, preview, or no publish.

## Quality bar

- Teach **concise background → concise intuition → code story → code samples → comprehension check** without duplicating material between fields.
- Keep `summary` to one plain-language sentence.
- Use one domain term consistently: call the final practical field and visible section **Code Samples**.
- Preserve exact code in every excerpt; never fabricate omitted context or illustrative code.
- Prefer one strong diagram over several weak ones, give static images meaningful alt text, and use no raw HTML.
- Keep Background and Intuition succinct through disciplined scope, not fixed word limits.
- Explain material risks, rejected alternatives, and unchanged behaviour.
- For very large pull requests, explain the architectural spine and representative diffs; link to the full pull request for exhaustive review.
- Treat the story as explanation, not approval: it does not replace code review.
