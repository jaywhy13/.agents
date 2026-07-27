# Pull request story artifact

Create one JSON object. The object is a portable teaching artifact: another skill or tool can consume it without having to reconstruct the pull request research.

## Fields

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `title` | string | yes | Pull request title or an accurate manual title. Plain text on one line. |
| `summary` | string | yes | One plain-language sentence describing the outcome and why it matters. Plain text on one line. |
| `link` | string | yes | Exact canonical `https://github.com/owner/repository/pull/number` URL. No query, fragment, or trailing slash. |
| `repository` | string | yes | `owner/repository`, matching `link`. |
| `number` | positive integer | yes | Pull request number, matching `link`. |
| `author` | string | yes | GitHub username without a leading `@`. |
| `background` | Markdown string | yes | Concise prior system, vocabulary, motivating problem, constraints, scope, unchanged behaviour, and short Essential files and Essential symbols maps. Must contain a heading and must not narrate the new implementation. |
| `intuition` | Markdown string | yes | Concise independent mental model, concrete example, or sustained analogy that lets the reader predict the change. Must contain a heading. |
| `code_story` | Markdown string | yes | Concise implementation narrative in conceptual order, with consequences, trade-offs, evidence locations, and unchanged behaviour. Must contain a heading; exact excerpts belong in `code_samples`. |
| `code_samples` | Markdown string | yes | Exact source examples showing how important components are constructed, called, tested, configured, or connected. Must contain a heading, at least one non-empty fenced `diff` excerpt, exactly five comprehension questions, and visible answers. |
| `source_fetched_at` | ISO 8601 string | no | When pull request metadata and the diff were fetched. |
| `source_diff_truncated` | boolean | no | Whether the diff used to prepare the story was truncated. |

Conceptual diagrams belong inside `intuition` when they materially teach a flow, relationship, state transition, or before-and-after model. Mermaid diagrams use fenced `mermaid` blocks. Static images use Markdown image syntax with meaningful alt text and a safe `http://` or `https://` URL without embedded credentials. Do not add top-level diagram or media fields.

The four teaching fields must complement one another rather than repeat the same explanation. Raw HTML is unsupported; use normal Markdown, including a visible `## Answers` section.

## Validation checklist

- The object contains no fields beyond those listed above.
- `link`, `repository`, and `number` identify the same pull request.
- Every required string is non-empty; `title` and `summary` contain no newline.
- Every teaching field contains a Markdown heading and no raw HTML.
- Every fenced `diff` excerpt is copied exactly and contiguously from the pull request diff.
- Every other code excerpt is exact repository source rather than invented example code.
- Each image has meaningful alt text and a safe web URL without credentials.
- `code_samples` ends with exactly five questions and five visible answers.

## Example

````json
{
  "title": "Make retries visible",
  "summary": "Operators can distinguish a retry from a first attempt without tracing separate identifiers.",
  "link": "https://github.com/shop/example/pull/42",
  "repository": "shop/example",
  "number": 42,
  "author": "octocat",
  "background": "## Why retries were confusing\n\nExplain the previous behaviour and its cost.\n\n### Essential files\n\n- `retry.js` — coordinates retry attempts.\n\n### Essential symbols\n\n- `createRetry` — creates another attempt for an operation.",
  "intuition": "## Think of one journey with several attempts\n\nA retry is another attempt within the same journey.",
  "code_story": "## Carry attempt context\n\nExplain why retries retain both operation and attempt identity.",
  "code_samples": "## Create a retry\n\n**Location:** `retry.js` · `createRetry`\n\n```diff\n-old\n+new\n```\n\n## Check your understanding\n\n1. Why retain the identifier?\n2. What changes on a retry?\n3. Which boundary carries context?\n4. What remains unchanged?\n5. Which evidence proves the behaviour?\n\n## Answers\n\n1. It groups attempts.\n2. The attempt identity.\n3. The retry call.\n4. The operation identity.\n5. The exact diff and test.",
  "source_fetched_at": "2026-07-15T14:34:54.985Z",
  "source_diff_truncated": false
}
````
