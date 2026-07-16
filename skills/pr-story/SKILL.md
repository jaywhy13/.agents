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
3. **Write the background.** Explain the prior system, necessary vocabulary, motivating problem, constraints, and why the problem matters. State scope and unchanged behaviour, but do not walk through the new implementation.
4. **Build the intuition.** Write a required, independent `intuition` Markdown field that gives the simplest mental model, concrete example, or sustained analogy needed to predict the change before seeing code. Define the plain-language role of every service, class, data type, repository, client, state machine, callback, or similar concept the later story relies on. Put a small Mermaid diagram or meaningful static image here when it materially clarifies a relationship, flow, state transition, or before/after model; omit decorative diagrams.
5. **Write the code story.** Follow the template in [STORY-GUIDE.md](STORY-GUIDE.md). Arrange the implementation into conceptual chapters. Before every excerpt, state the question it answers; show the smallest exact fenced `diff` excerpt that proves the point; then explain its consequence, trade-offs, evidence, and unchanged behaviour. Do not repeat the background or intuition, dump every file, or narrate syntax line by line.
6. **Test understanding.** End `code_story` with five medium-difficulty questions that test causality, trade-offs, and behaviour. Put answers under a visible `## Answers` Markdown heading; Organized escapes raw HTML, so do not use `<details>`.
7. **Verify the story.** Check every factual claim against code or pull request evidence. Distinguish facts from reasonable inferences, include important limitations, and report test or check results without claiming unrun validation.
8. **Prepare the record.** Write JSON matching [SCHEMA.md](SCHEMA.md). `author` is the GitHub pull request author; the publisher separately records the authenticated Organized user as `created_by`.
9. **Get approval.** Show the title, summary, watch value, and the complete rendered `background`, `intuition`, and `code_story`, including any diagram. Do not publish until the user approves this exact preview.
10. **Publish or refresh.** Save the approved JSON to a temporary file, run:

```bash
node ~/.agents/skills/pr-story/scripts/publish-pr-story.mjs /tmp/pr-story.json
```

The publisher creates a parent and v1 for a new story. For an existing story with the same repository and pull request number, it appends the next immutable Story Version only when reader-facing content changed, then updates the parent's current projection. Identical and Watch-only publishes do not create versions. Delete the temporary file after success and report the Organized URL and record identifier.

## Quality bar

- Teach **background → intuition → code story → comprehension check** without duplicating material between fields.
- Keep `summary` to one plain-language sentence.
- Preserve exact code in diff excerpts; never fabricate omitted context.
- Prefer one strong diagram over several weak ones, give static images meaningful alt text, and use no raw HTML.
- Explain material risks, rejected alternatives, and unchanged behaviour.
- For very large pull requests, explain the architectural spine and representative diffs; link to the full pull request for exhaustive review.
- Treat the story as explanation, not approval: it does not replace code review.
