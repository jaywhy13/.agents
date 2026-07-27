---
name: organized-post
description: >
  Publishes an approved post to Organized, Shopify's internal personal feed at organized.quick.shopify.io. Use when invoked via /organized-post, when directly publishing to the Organized `posts` collection, or when an `organized-*` wrapper needs to send a formatted artifact.
---

# Organized Post

Publishes a formatted post to Organized's `posts` collection. This is the **shared publishing primitive**: `organized-*` wrapper skills send approved artifacts here, while core formatting skills only create those artifacts.

## Why this exists

Organized sits behind Google IAP (Identity-Aware Proxy — a login gate in front of the whole host). The browser `window.quick.db` path needs an interactive sign-in, and `gcloud` user accounts can't mint an IAP token. The reliable path is the **Quick Node SDK**, which loads cached credentials from `quick auth login` and injects them automatically — no browser, no manual token.

## Prerequisites

- `quick` CLI installed (provides the bundled SDK).
- Authenticated once: `quick auth login` (stores creds in `~/.config/quick/`).

If either is missing, the script errors clearly. Fallback: run the post JSON's fields through `window.quick.db.collection("posts").create(...)` in a signed-in `organized.quick.shopify.io` browser tab.

## Inputs

A post needs four fields. The **caller is responsible for formatting** (title/summary/body/tags) and for getting user approval before publishing — this skill only ships an already-approved post.

- `title` — short headline.
- `summary` — one-sentence takeaway.
- `body` — Markdown (sparse helpful emoji is fine).
- `tags` — array; put the **primary tag first** (e.g. `today-i-learned`, `thoughts`). The script lowercases, slugifies, and dedupes them.

The script auto-fills `author` (from `quick auth`), `ts`, `created_at`, `likes`, `starred`, `archived`, `images`, `audio`, and `search_text`.

## Publish

1. Write the approved fields to a temp JSON file (avoids shell-escaping the Markdown body):

```json
{
  "title": "...",
  "summary": "...",
  "body": "## Heading\n\nMarkdown body...",
  "tags": ["primary-tag", "topic-a", "topic-b"]
}
```

2. Run the publish script:

```bash
node ~/.agents/skills/organized-post/scripts/publish-organized-post.mjs /tmp/organized-post.json
```

3. On success it prints `{ "ok": true, "id": "<post-id>", "url": "https://organized.quick.shopify.io/" }`. Report the post id and link. On failure it prints `{ "ok": false, "error": "..." }` — surface the error and offer the browser fallback.

## Notes

- Default site is `organized`; override with a `"site"` field in the JSON if ever needed.
- The script resolves the SDK dynamically from the installed `quick` CLI, so it survives CLI version bumps. Override with `QUICK_SDK_PATH` if the SDK lives somewhere unusual.
- Clean up the temp JSON after a successful publish.
