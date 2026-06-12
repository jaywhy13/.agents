---
name: quick-site
description: Build and deploy self-contained static sites to Shopify's internal Quick hosting platform (quick.shopify.io). Use when user asks to create a Quick site, build an internal Shopify page, publish a proposal or document as a web page, or mentions "quick site", "deploy to Quick", "quick.shopify.io", or asks to make something shareable internally at Shopify.
---

# Quick Site

Build a single `index.html` and deploy it to `<name>.quick.shopify.io` — Shopifolk-only, behind Google auth.

## Workflow

1. **Understand the goal** — before writing any HTML, ask: what does this site achieve and who reads it? The answer shapes every design decision.
2. **Create the directory** — `~/code/quick/<site-name>/index.html`
3. **Build the site** — one self-contained `index.html`; CDN libraries are fine. See [DESIGN.md](DESIGN.md).
4. **Preview locally** — `quick serve ~/code/quick/<site-name>/ <site-name>` → opens at `localhost:1337`
5. **Iterate** — show the user the preview, refine until approved
6. **Deploy** — `quick deploy ~/code/quick/<site-name>/ <site-name> -f` → live at `<site-name>.quick.shopify.io`

## Design principles

**Light theme, always.** White or warm-white backgrounds, dark text, soft shadows. Never default to the dark GitHub-style palette that LLMs tend to generate.

**Goals before mechanics.** Open with what the site achieves and who benefits. Never lead with class names, configuration syntax, or implementation details.

**High-level overview before detail.** A hero or intro section orients the reader to the whole before any part. Readers should understand the shape of the thing before drilling in.

**Interactive wherever possible.** Tabs, expandable sections, before/after toggles, step-by-step navigators. Static walls of text are a last resort. See interactive patterns in [DESIGN.md](DESIGN.md).

**Interesting over complete.** One well-designed, memorable interaction beats five mediocre ones. Cut anything that dilutes focus.

**Explain Like Socrates when teaching.** When the site explains a concept, load and follow the `explain-like-socrates` skill. Lead with motivating questions, build vocabulary one term at a time, guide discovery rather than stating answers.

## Working with existing sites

```bash
quick remix --copy <site-name>          # download files to ./<site-name>/
quick remix --clone <new-name> <old>    # fork to a new site name
```

## CLI reference

| Command | What it does |
|---|---|
| `quick serve <dir> <name>` | Local preview at localhost:1337 |
| `quick deploy <dir> <name> -f` | Deploy to `<name>.quick.shopify.io` |
| `quick remix --copy <name>` | Download an existing site's files |
| `quick delete <name>` | Remove a deployed site |
