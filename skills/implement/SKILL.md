---
name: implement
description: "Runs the end-to-end coding workflow. Use whenever the user asks to start coding or work on any coding task."
---

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly and run only localized tests: the specific test files related to the changed code. Never run the full test suite locally; continuous integration is responsible for full-suite coverage.

Once done, use /code-review to review the work.

Commit your work to the current branch.

Push the branch to Github, create a PR if none exists and wait for the build process to complete. Fix any related CI issues.

Once the pull request build succeeds, choose where to publish its teaching-first story. Quick is Shopify's internal app and site platform; use its locally installed `quick` command as the Shopify-machine proxy:

```bash
if command -v quick >/dev/null 2>&1; then
  echo organized-pr-story
else
  echo github-pr-story
fi
```

- When Quick is installed, read [organized-pr-story](../organized-pr-story/SKILL.md) and carry out that workflow in this session so the story is published to Organized, Shopify's internal personal feed.
- When Quick is not installed, read [github-pr-story](../github-pr-story/SKILL.md) and carry out that workflow in this session so the story is added as a GitHub comment with collapsible sections.

The story publication result does not change whether the implementation itself succeeded. Report a publication failure separately instead of hiding an otherwise successful pull request.
