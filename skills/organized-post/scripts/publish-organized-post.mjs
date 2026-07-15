#!/usr/bin/env node
// Publish a post to Organized (organized.quick.shopify.io) via the Quick Node SDK.
//
// Usage:
//   node publish-organized-post.mjs <post.json>
//
// post.json shape:
//   {
//     "site":    "organized",          // optional, defaults to "organized"
//     "title":   "string",             // required
//     "summary": "string",             // required
//     "body":    "markdown string",    // required
//     "tags":    ["primary", ...]      // required; include the primary tag first
//   }
//
// Auth: uses cached IAP credentials from `quick auth login` (~/.config/quick/).
// SDK:  bundled inside the installed `quick` CLI — located dynamically so it
//       survives CLI version bumps (the Nix store path changes each release).

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function resolveQuickSdk() {
  if (process.env.QUICK_SDK_PATH && existsSync(process.env.QUICK_SDK_PATH)) {
    return process.env.QUICK_SDK_PATH;
  }
  let bin;
  try {
    bin = execSync("command -v quick", { shell: "/bin/bash" }).toString().trim();
  } catch {
    throw new Error("`quick` CLI not found on PATH. Install it, then run `quick auth login`.");
  }
  let dir = dirname(execSync(`readlink -f "${bin}"`).toString().trim());
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "dist", "sdk.mjs");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error("Could not locate the Quick SDK (dist/sdk.mjs) near the quick CLI.");
}

function normalizeTags(tags) {
  return Array.from(
    new Set(
      (tags || [])
        .map((tag) => String(tag).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-"))
        .map((tag) => tag.replace(/^-+|-+$/g, ""))
        .filter(Boolean),
    ),
  );
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("Pass a path to a post JSON file.");
  const input = JSON.parse(readFileSync(resolve(inputPath), "utf8"));

  for (const field of ["title", "summary", "body", "tags"]) {
    if (!input[field]) throw new Error(`Missing required field: ${field}`);
  }

  const site = input.site || "organized";
  const sdkPath = resolveQuickSdk();
  const { createClient } = await import(sdkPath);
  const { db, id } = createClient(site);

  const user = await id.waitForUser();
  const author = user?.email;
  if (!author) throw new Error("Could not resolve author email — is `quick auth login` valid?");

  const now = Date.now();
  const tags = normalizeTags(input.tags);
  const { title, summary, body } = input;

  const post = {
    title,
    summary,
    body,
    author,
    tags,
    images: [],
    audio: null,
    ts: now,
    created_at: new Date(now).toISOString(),
    likes: 0,
    starred: false,
    archived: false,
    search_text: [title, summary, body, tags.join(" ")].filter(Boolean).join(" ").toLowerCase(),
  };

  const created = await db.collection("posts").create(post);
  const created_id = Array.isArray(created) ? created[0]?.id : created?.id;
  console.log(JSON.stringify({ ok: true, id: created_id, site, url: `https://${site}.quick.shopify.io/` }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
