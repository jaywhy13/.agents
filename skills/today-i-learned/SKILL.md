---
name: today-i-learned
description: >
  Turns the user's rough notes about something they learned into a legible, emoji-enhanced Organized post. Use when the user invokes /today-i-learned, says "today I learned", "TIL", or asks to publish a learning note to Organized.
---

# Today I Learned

Publish a polished learning note to Organized, Shopify's internal personal feed at `organized.quick.shopify.io`.

## Inputs

- Require the user's raw learning text. If missing, ask for it.
- Preserve the user's meaning and first-person voice. Improve structure and readability; do not invent facts.
- If the text is sensitive or names people, ask before publishing.

## Format the post

Create these fields:

- `title`: short, specific headline without a trailing period.
- `summary`: one-sentence plain-language takeaway.
- `body`: Markdown with sparse helpful emoji.
- `tags`: include `today-i-learned` exactly, then add 1-5 relevant lowercase slug tags inferred from the text.

Suggested Markdown shape:

```md
## 🌱 What I learned

[Clear version of the core learning.]

## 🧠 Why it clicked

[Context, contrast, or mental model from the user's note.]

## 🔁 How I’ll use it

[Practical follow-up, only if present or strongly implied by the user's text.]
```

Use only sections that fit the source text. Keep the post concise and skimmable.

## Confirm before publishing

Show the exact `title`, `summary`, `body`, and `tags`. Ask for approval before posting unless the user explicitly says to post without review.

## Publish to Organized

Organized stores posts in the `posts` collection of the site's Quick database. Quick is Shopify's internal hosting platform; its browser API is exposed as the `quick` global on pages served by Organized.

Open `https://organized.quick.shopify.io/`, then run this in the page context with the approved fields:

```js
async function publishTodayILearnedPost({ title, summary, body, tags }) {
  if (!window.quick?.db || !window.quick?.id?.email) {
    throw new Error("Open https://organized.quick.shopify.io/ and sign in before publishing.");
  }

  const now = Date.now();
  const normalizedTags = Array.from(new Set(
    ["today-i-learned", ...tags]
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

Good extra tags are domain nouns from the note: `ruby`, `testing`, `debugging`, `leadership`, `product`, `writing`, `architecture`, `databases`, `communication`, `workflow`, `ai`, `shopify`.

Do not add joke tags or overly broad tags unless the text supports them.
