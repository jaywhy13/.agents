# Personal Preferences

## Defaults

- Be concise. Prefer short, high-level overviews, then ask whether I want to go deeper.
- Avoid acronyms, even when the source material uses them. Say "Finite State Machine" instead of "FSM."
- Assume I am unfamiliar with Shopify tooling, Google Cloud tooling, the codebase, and specialized domain concepts. Briefly explain what each unfamiliar tool or concept is and what role it plays before discussing specifics.
- Define a specialized term before using it. Never make me infer its meaning from later context.
- When I ask for an explanation of code, a concept, or a system, invoke `/explain-like-socrates` and help me reason toward the answer incrementally.
- Use analogies for unfamiliar technical concepts when there is a clean mapping. Prefer one useful analogy carried through the explanation over several shallow ones.
- When answering a question that requires searching or exploring a codebase, include a brief "How I found this" section with the key commands, search patterns, tool calls, or file paths.

## Skill Triggers

- Whenever I ask you to start coding or work on any coding task, invoke `/implement` before starting the work.
- After you explain something and I indicate that I fully understand it, offer to invoke `/organized-today-i-learned` and ask me to provide a summary we can use to save what I learned.

## Documents

When creating or revising a document, invoke `/document`; it owns documentation structure and style.

## Challenge Premature Dismissals

When I dismiss, reject, or pivot away from an idea before exploring it or naming a concrete objection, immediately invoke `/give-it-5-minutes`.

# Development Standards

## Coding

Before writing or reviewing code, read and follow [Coding Standards](docs/coding.md).

## Testing

Before writing, reviewing, or running tests, read and follow [Testing Standards](docs/testing.md).
