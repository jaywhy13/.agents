---
name: code-like-me
description: Runs a two-pull-request learning loop that turns the user's project review feedback into durable AGENTS.md coding guidance. Use when the user invokes /code-like-me, asks agents to code in their style, or wants project feedback generalized into personal agent instructions.
---

# Code Like Me

## Guardrails

- First read `~/.agents/AGENTS.md` fully, then read every supporting prompt in this skill before delegating. Treat those files as the source of truth for style, naming, architecture, tests, and explanation preferences.
- Do not edit `~/.agents/AGENTS.md` until the project pull request has been reviewed by the user and their feedback is available.
- Keep all new `AGENTS.md` guidance general. Ban project-specific names, ticket numbers, pull request links, customer names, or one-off implementation details.
- Use branches for both work streams: one project branch for the assigned work, then one learning branch for `~/.agents/AGENTS.md` updates.
- Get user approval before pushing branches, opening pull requests, posting comments, or closing/abandoning work.
- Be concise, explicit, and code-quality focused. Define unfamiliar terms before using them.

## Workflow

1. **Clarify the assignment** by asking what project work should be done, which repository to use, and what success looks like.
2. **Start project work safely** by creating a project branch and launching an implementation sub-agent with `prompts/implementation-subagent.md` plus the assignment and current `~/.agents/AGENTS.md`.
3. **Review the implementation hard** by launching a separate review sub-agent with `prompts/agents-aware-code-reviewer.md`, the diff, supporting files, and current `~/.agents/AGENTS.md`.
4. **Integrate review feedback** by fixing issues or sending them back to the implementation sub-agent. Repeat until the work meets the user's standards.
5. **Ask before publishing** and, only after approval, commit the project work, push the project branch, and open a project pull request.
6. **Collect user pull request feedback** by waiting for the user to review the project pull request and provide their comments, requested changes, and reasoning.
7. **Generalize the learning** by creating a separate learning branch in `~/.agents`, then launching a feedback generalizer sub-agent with `prompts/feedback-generalizer.md`, the user feedback, the project diff, and current `~/.agents/AGENTS.md`.
8. **Challenge the guidance** by launching a meta-review sub-agent with `prompts/meta-reviewer.md`, the proposed `AGENTS.md` diff, the original project feedback, and the project diff.
9. **Integrate meta-review feedback** into `~/.agents/AGENTS.md` until the meta-reviewer agrees the guidance would likely have prevented the same comments.
10. **Ask before publishing the learning** and, only after approval, commit the `AGENTS.md` update, push the learning branch, and open a learning pull request for `~/.agents/AGENTS.md` changes.
11. **Reset the project attempt** by asking for approval to close or abandon the project pull request, then start fresh from the target branch using the updated `AGENTS.md` guidance.

## Supporting prompts

- `prompts/implementation-subagent.md` — gives the builder the assignment and the user's coding standards.
- `prompts/agents-aware-code-reviewer.md` — reviews code with meticulous attention to `AGENTS.md`.
- `prompts/feedback-generalizer.md` — converts project feedback into general personal guidance.
- `prompts/meta-reviewer.md` — tests whether the new guidance would have prevented the same feedback.
