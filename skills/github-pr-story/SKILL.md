---
name: github-pr-story
description: Publishes or refreshes a teaching-first pull request story as a GitHub comment with collapsible sections. Use when the user invokes /github-pr-story, asks to explain a pull request in its comments, or when /implement finishes on a machine without Quick.
---

# GitHub Pull Request Story

Give pull-request readers the same teaching artifact without requiring Quick, Shopify's internal app and site platform.

## Prerequisite

Require the GitHub command-line interface and its authenticated user:

```bash
command -v gh >/dev/null 2>&1 && gh auth status
```

If either check fails, report the failure and do not claim that a comment was published.

## Workflow

1. Read [pr-story](../pr-story/SKILL.md) and carry out its workflow in this session with the pull request and reader context. Retain the verified JSON artifact's actual path.
2. Resolve `scripts/publish-github-pr-story.mjs` relative to this skill's loaded `SKILL.md`. Unless the user requested a preview or no publication, run `node <resolved-script-path> <actual-artifact-path>`. For preview or no publication, skip directly to the dry-run command below.
3. Report whether the comment was `created` or `updated`, and include its GitHub URL.

The publisher preserves the story's summary and teaching fields. It wraps Background, Intuition, Code story, Code samples, and the comprehension check in separate GitHub `<details>` sections so readers can expand them independently.

A hidden pull-request marker and the authenticated GitHub username identify the existing story comment. Re-running the skill updates that comment instead of adding another. Stop rather than choosing when multiple matching comments exist.

## Preview

When the user asks for a preview or no publication, render without calling GitHub:

Run `node <resolved-script-path> --dry-run <actual-artifact-path>`.

Show the rendered comment body and do not publish it.
