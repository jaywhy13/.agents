---
name: organized-retro
description: >
  Publishes a task/project retrospective to Organized, Shopify's internal personal feed at organized.quick.shopify.io. Use when the user invokes /organized-retro, says "post the retro" / "submit this retro to Organized", or when the scratchpad Task completion flow needs to publish a retro. Accepts a retro.md path or raw retro text.
---

# Organized Retro

Publish a polished retrospective to Organized, Shopify's internal personal feed at `organized.quick.shopify.io`. Organized is a Quick-hosted site (Quick is Shopify's internal static-hosting platform) that stores posts in a browser-accessible database exposed as the `quick` global.

## Inputs

- A retro source: either a path to a `retro.md` file or raw retro text. If a `retro.md` exists beside the current task's `plan.md`, prefer that. If neither is given, ask for the retro text or generate one first (see the `retrospect` skill).
- Optional project/task slugs for tagging. If invoked from the scratchpad, take them from the task's `plan.md` metadata.
- Preserve the author's meaning and first-person voice. Improve structure and readability; do not invent outcomes, metrics, or lessons.
- If the retro names people in a sensitive way or contains anything confidential beyond normal internal work notes, ask before publishing.

## Format the post

Create these fields:

- `title`: short, specific headline naming the task or project. No trailing period. Example: "Retro: ads-data stakeholder sign-off".
- `summary`: one-sentence plain-language takeaway of how the work went.
- `body`: Markdown with sparse helpful emoji.
- `tags`: include `retro` exactly, then add 1-5 relevant lowercase slug tags inferred from the retro (project slug, domain nouns).

Suggested Markdown shape (use only the sections the source supports):

```md
## ✅ What shipped

[The concrete outcomes / deliverables.]

## 🧠 What I learned

[Lessons, surprises, or mental models worth keeping.]

## 🔁 What I'd do differently

[Process or approach changes for next time, only if present or implied.]

## 📌 Carried forward

[Unfinished items or follow-ups handed off, only if present.]
```

Keep it concise and skimmable.

## Confirm before publishing

Show the exact `title`, `summary`, `body`, and `tags` and ask for approval before posting — UNLESS the user (or the calling scratchpad flow) explicitly says to post without review. When the scratchpad Task completion flow calls this skill, it may post without a separate confirmation since the user already confirmed task closure; still surface the final fields in the report.

## Publish to Organized

Organized stores posts in the `posts` collection of the site's Quick database. There are two ways to write a post; prefer the `quick curl` HTTP path because it works headless and needs no browser session.

### Preferred: `quick curl` HTTP API (headless)

The `quick.db` browser client POSTs to `https://organized.quick.shopify.io/api/db/posts`. The `quick curl` CLI injects Google IAP auth, so you can hit that endpoint directly from a shell. `author` must equal the signed-in Shopify email (the feed only shows the author their own posts); get it from `gcloud config get-value account`.

```bash
# 1. Build the post JSON (use python/jq so Markdown + emoji escape cleanly).
#    Required: title, body, author, ts. Recommended: summary, tags, created_at,
#    search_text (lowercased title+summary+body+tags), starred:false, archived:false.
#    ts = epoch ms; images: [], audio: null. Do NOT set id/updated_at.
# 2. Authenticate once if needed:
quick auth
# 3. POST it:
quick curl "https://organized.quick.shopify.io/api/db/posts" \
  -X POST -H "Content-Type: application/json" --data @/tmp/retro_post.json
```

A successful response is the created post JSON including its generated `id`. If you get `405 Not Allowed` from nginx, you posted to `/db/posts` instead of `/api/db/posts` — the DB base path is `/api`.

### Fallback: browser `quick` global

If the CLI is unavailable, open `https://organized.quick.shopify.io/` (sign in if IAP redirects to Google) and run this in the page context with the approved fields:

```js
async function publishRetroPost({ title, summary, body, tags }) {
  if (!window.quick?.db || !window.quick?.id?.email) {
    throw new Error("Open https://organized.quick.shopify.io/ and sign in before publishing.");
  }

  const now = Date.now();
  const normalizedTags = Array.from(new Set(
    ["retro", ...tags]
      .map((tag) => tag.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-"))
      .map((tag) => tag.replace(/^-+|-+$/g, ""))
      .filter(Boolean)
  ));

  const post = {
    title,
    summary,
    body,
    author: quick.id.email,
    tags: normalizedTags,
    images: [],
    audio: null,
    ts: now,
    created_at: new Date(now).toISOString(),
    likes: 0,
    starred: false,
    archived: false,
  };

  post.search_text = [title, summary, body, normalizedTags.join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return quick.db.collection("posts").create(post);
}
```

After publishing, report the created post id if available and link to `https://organized.quick.shopify.io/`.

## Tag guidance

Good extra tags are the project slug and domain nouns from the retro: `ads-data-migration`, `migration`, `stakeholders`, `data`, `dbt`, `workflow`, `process`, `shopify`. Do not add joke tags or overly broad tags.
