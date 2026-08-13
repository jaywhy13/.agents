---
name: organized-pr-story
description: Publishes or refreshes a teaching-first pull request story in Organized while preserving version history and watch state. Use when the user invokes /organized-pr-story or asks to add, refresh, or watch a pull request story in Organized.
---

# Organized Pull Request Story

Create the teaching artifact first, then publish it to Organized, Shopify's internal personal feed hosted on its Quick app and site platform.

## Inputs

- Pull request URL. If omitted, the core story skill resolves the pull request for the current branch.
- `watch`: optional watch intent. A new record defaults to `false`; a refresh preserves its stored value when omitted.
- Optional reader context: what they already know and what they care about.

## Workflow

1. **Create the story artifact.** Read [pr-story](../pr-story/SKILL.md) and carry out its workflow in this session with the pull request and reader context. Retain its verified JSON artifact and actual path; do not weaken or duplicate its research and teaching workflow.
2. **Prepare the publisher input.** Check the artifact against [SCHEMA.md](SCHEMA.md). Reuse its teaching fields unchanged and add `watch` only when the user supplied it; the publisher owns all managed database fields. Use `mktemp` for a collision-safe composed input without changing the core artifact.
3. **Publish or refresh immediately.** Resolve `scripts/publish-pr-story.mjs` relative to this skill's loaded `SKILL.md`. Unless the user explicitly requested a draft, preview, or no publish, run:

```bash
node <resolved-publisher-script-path> <composed-input-path>
```

The publisher creates a stable parent and immutable version 1 for a new story. For the same authenticated user, repository, and pull request number, it appends the next version only when reader-facing content changed, then refreshes the parent projection. Identical content and watch-only changes do not create versions.

4. **Report the outcome.** Delete only temporary input files after success. Report the action, record identifier, version number, watch state, and Organized URL. Surface structured failures without claiming success.

## Preview without writing

When the user explicitly requests a preview, run the authenticated dry run:

```bash
node <resolved-publisher-script-path> --dry-run <composed-input-path>
```

It reads existing records to predict `create`, `update`, or `no_change` without changing the database.
