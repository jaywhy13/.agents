---
name: organized-pr-story
description: Publishes or refreshes a teaching-first pull request story in Organized while preserving version history and watch state. Use when the user invokes /organized-pr-story or asks to add, refresh, or watch a pull request story in Organized.
---

# Organized Pull Request Story

Create the teaching artifact first, then send it through the specialized pull request publisher.

## Inputs

- Pull request URL. If omitted, the core story skill resolves the pull request for the current branch.
- `watch`: optional watch intent. A new record defaults to `false`; a refresh preserves its stored value when omitted.
- Optional reader context: what they already know and what they care about.

## Workflow

1. **Create the story artifact.** Invoke `/pr-story` with the pull request and reader context. Wait for its verified JSON artifact and path; do not weaken or duplicate its research and teaching workflow.
2. **Prepare the publisher input.** Check the artifact against [SCHEMA.md](SCHEMA.md). Reuse its teaching fields unchanged and add `watch` only when the user supplied it; the publisher owns all managed database fields. Write this composed object to a temporary path such as `/tmp/organized-pr-story.json` without changing the core artifact.
3. **Publish or refresh immediately.** Unless the user explicitly requested a draft, preview, or no publish, run:

```bash
node ~/.agents/skills/organized-pr-story/scripts/publish-pr-story.mjs /tmp/organized-pr-story.json
```

The publisher creates a stable parent and immutable version 1 for a new story. For the same authenticated user, repository, and pull request number, it appends the next version only when reader-facing content changed, then refreshes the parent projection. Identical content and watch-only changes do not create versions.

4. **Report the outcome.** Delete only temporary input files after success. Report the action, record identifier, version number, watch state, and Organized URL. Surface structured failures without claiming success.

## Preview without writing

When the user explicitly requests a preview, run the authenticated dry run:

```bash
node ~/.agents/skills/organized-pr-story/scripts/publish-pr-story.mjs --dry-run /tmp/organized-pr-story.json
```

It reads existing records to predict `create`, `update`, or `no_change` without changing the database.
