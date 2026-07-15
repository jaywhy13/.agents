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
3. **Write the background.** Explain how the relevant system worked before this pull request, why the problem matters, and the smallest mental model needed to follow the change. Lead with intuition and a concrete example or analogy; only then introduce implementation details.
4. **Add a diagram only when it teaches.** Prefer a small Mermaid diagram in Markdown when Organized supports it. Otherwise create an accessible static image, upload it through Quick, and embed its URL with meaningful alt text. A diagram must clarify a relationship, flow, state transition, or before/after model; omit decorative diagrams.
5. **Write the code story.** Follow the template in [STORY-GUIDE.md](STORY-GUIDE.md). Arrange the change into conceptual chapters. Before every excerpt, state the question it answers; show the smallest exact fenced `diff` excerpt that proves the point; then explain its consequence. Do not dump every file or narrate syntax line by line.
6. **Test understanding.** End `code_story` with five medium-difficulty questions that test causality, trade-offs, and behaviour. Put answers under a visible `## Answers` Markdown heading; Organized escapes raw HTML, so do not use `<details>`.
7. **Verify the story.** Check every factual claim against code or pull request evidence. Distinguish facts from reasonable inferences, include important limitations, and report test or check results without claiming unrun validation.
8. **Prepare the record.** Write JSON matching [SCHEMA.md](SCHEMA.md). `author` is the GitHub pull request author; the publisher separately records the authenticated Organized user as `created_by`.
9. **Get approval.** Show the title, summary, watch value, diagram plan, and a concise outline. Do not publish until the user approves the exact story.
10. **Publish or refresh.** Save the approved JSON to a temporary file, run:

```bash
node ~/.agents/skills/pr-story/scripts/publish-pr-story.mjs /tmp/pr-story.json
```

The publisher updates an existing record with the same repository and pull request number, otherwise it creates one. Delete the temporary file after success and report the Organized URL and record identifier.

## Quality bar

- Teach **why → intuition → mechanism → evidence → consequence**.
- Keep `summary` to one plain-language sentence.
- Preserve exact code in diff excerpts; never fabricate omitted context.
- Prefer one strong diagram over several weak ones, give static images meaningful alt text, and use no raw HTML.
- Explain material risks, rejected alternatives, and unchanged behaviour.
- For very large pull requests, explain the architectural spine and representative diffs; link to the full pull request for exhaustive review.
- Treat the story as explanation, not approval: it does not replace code review.
