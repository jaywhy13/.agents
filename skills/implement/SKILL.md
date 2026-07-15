---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly and run only localized tests: the specific test files related to the changed code. Never run the full test suite locally; continuous integration is responsible for full-suite coverage.

Once done, use /code-review to review the work.

Commit your work to the current branch.

Push the branch to Github, create a PR if none exists and wait for the build process to complete. Fix any related CI issues.

Once the pull request build succeeds, use /pr-story on that pull request to create its teaching-first explanation and publish the approved story to Organized.
