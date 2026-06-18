---
name: thinking-out-loud
description: >
  Turns the user's rough exploratory thoughts into a legible, emoji-enhanced Organized post. Use when the user invokes /thinking-out-loud, says "thinking out loud", or asks to publish a thought/reflection to Organized.
---

# Thinking Out Loud

Publish a polished reflection to Organized, Shopify's internal personal feed at `organized.quick.shopify.io`.

## Inputs

- Require the user's raw thought text. If missing, ask for it.
- Preserve the user's uncertainty, nuance, and first-person voice. Improve structure and readability; do not over-resolve an open thought.
- If the text is sensitive, names people, or could be read as a firm decision, ask before publishing.

## Format the post

Create these fields:

- `title`: short headline that frames the thought as exploration, not certainty.
- `summary`: one-sentence statement of the tension, question, or idea.
- `body`: Markdown with sparse helpful emoji.
- `tags`: include `thoughts` exactly, then add 1-5 relevant lowercase slug tags inferred from the text.

Suggested Markdown shape:

```md
## 💭 The thought

[Clear version of the idea or tension.]

## 🧭 Why I’m circling it

[Context, motivation, or trade-off from the user's note.]

## 🧪 What I’m wondering

[Open questions or next angles, only if present or strongly implied.]
```

Use only sections that fit the source text. Keep it readable, honest, and exploratory.

## Confirm before publishing

Show the exact `title`, `summary`, `body`, and `tags`. Ask for approval before posting unless the user explicitly says to post without review.

## Publish to Organized

Organized stores posts in the `posts` collection of the site's Quick database. Quick is Shopify's internal hosting platform; its browser API is exposed as the `quick` global on pages served by Organized.

Open `https://organized.quick.shopify.io/`, then run this in the page context with the approved fields:

```js
async function publishThinkingOutLoudPost({ title, summary, body, tags }) {
  if (!window.quick?.db || !window.quick?.id?.email) {
    throw new Error("Open https://organized.quick.shopify.io/ and sign in before publishing.");
  }

  const now = Date.now();
  const normalizedTags = Array.from(new Set(
    ["thoughts", ...tags]
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

Good extra tags are domain nouns from the thought: `strategy`, `product`, `architecture`, `teamwork`, `leadership`, `writing`, `learning`, `workflow`, `ai`, `systems`, `communication`, `shopify`.

Do not add joke tags or overly broad tags unless the text supports them.
