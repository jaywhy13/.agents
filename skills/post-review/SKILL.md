---
name: post-review
description: Post review feedback as inline GitHub PR comments using Conventional Comments format with AI-suggestion decoration. Use when posting review comments to a PR, submitting review feedback inline, or converting review notes into GitHub PR comments. Triggers on "post review", "post comments", "submit review", "add inline comments".
version: 1.0.0
---

# Post Review to GitHub PR

<!-- $ARGUMENTS should be a PR number or URL -->

Post review feedback from the conversation as inline GitHub PR comments using [Conventional Comments](https://conventionalcomments.org/) format.

## Prerequisites

- `gh` CLI authenticated
- Review feedback must be present in the conversation (pasted text, prior skill output, etc.)
- If no review feedback is in the conversation, ask the user to provide it

## Step 1: Fetch PR metadata and diff

```bash
gh pr view $ARGUMENTS --json number,url,headRefOid,baseRefName,headRefName
```

Extract `{owner}/{repo}` from the PR URL. Save `headRefOid` as the commit SHA for the review.

```bash
gh pr diff $ARGUMENTS --patch
```

If the diff is empty or errors (e.g., 406, "diff too large"), use the paginated fallback:
```bash
gh api "repos/{owner}/{repo}/pulls/{number}/files?per_page=100" --paginate --jq '.[] | "diff --git a/\(.filename) b/\(.filename)\n\(.patch // "")"'
```

**Very large / near-total-rewrite files:** the files API returns an empty `.patch` (the
fallback above yields nothing) and `gh pr diff` may silently truncate via a custom pager.
When a file is almost entirely rewritten, nearly every line is in the diff, so line numbers
from the **head-ref version of the file** are valid `RIGHT`-side positions. Fetch it:
```bash
gh api repos/{owner}/{repo}/contents/{path}?ref=<headRefOid> --jq '.content' | base64 -d > head-file
grep -n "<marker>" head-file   # line numbers map directly to RIGHT-side diff positions
```
Sanity-check by diffing head vs base (`?ref=<base>`) so you don't comment on unchanged lines.

## Step 2: Parse findings from the review feedback

Extract each discrete finding from the review text in the conversation. For each finding, identify:

- **Label**: Map to a Conventional Comments label — `suggestion`, `issue`, `nitpick`, `thought`, `praise`, `note`, `question`
- **File path**: The file the finding refers to (if any)
- **Code reference**: The specific code or method name mentioned
- **Message**: The finding's subject and explanation
- **Extra decorations**: `performance`, `security`, `testing`, `blocking`, `non-blocking` as appropriate

## Step 3: Map findings to diff positions

For each finding with a file reference:

1. Locate the file in the diff output
2. Find the specific line(s) on the RIGHT side of the diff that correspond to the finding
3. Use `line` = the **file line number** shown in the diff hunk header (the `+` side), NOT the diff position offset
4. Set `side: "RIGHT"` (do NOT include `subject_type` — the GitHub API rejects it via `gh`)
5. For multi-line ranges, use `start_line` and `start_side: "RIGHT"` in addition to `line`

**If a finding cannot be mapped to a specific diff line** (e.g., it's about overall design, or the referenced code isn't in the diff), include it in the review body instead.

Read [references/conventional-comments.md](references/conventional-comments.md) for the full format reference.

## Step 4: Format comments

Every comment MUST use this format:

```
**<label> (AI-suggestion[, extra-decorations]):** <subject>

<explanation/context if needed>

---
🤖 *Posted by the post-review skill*
```

The `AI-suggestion` decoration is REQUIRED on every comment. Add additional decorations as appropriate.

### Review body

The top-level review body should contain:
- A brief summary line (e.g., "Review of PR #NNN — N inline comments posted")
- Any findings that couldn't be mapped to specific diff lines, formatted as Conventional Comments
- General observations (security assessment, testing summary, etc.)
- The signature line

## Step 5: Confirm with user before posting

**You MUST ask for explicit permission before submitting.** Reviews are posted in the user's name.

Present a preview showing:
1. The review body text
2. Each inline comment with its target `file:line` and formatted body
3. Total count of inline vs body comments

Wait for the user to confirm before proceeding.

## Step 6: Submit the review

Build a JSON payload and submit via `gh api`:

```bash
gh api "repos/{owner}/{repo}/pulls/{number}/reviews" \
  --method POST \
  -f commit_id="<headRefOid>" \
  -f event="COMMENT" \
  -f body="<review body>" \
  --input <(cat <<'PAYLOAD'
{
  "commit_id": "<headRefOid>",
  "event": "COMMENT",
  "body": "<review body>",
  "comments": [
    {
      "path": "path/to/file.rb",
      "line": 42,
      "side": "RIGHT",
      "body": "**suggestion (AI-suggestion):** ...\n\n---\n🤖 *Posted by the post-review skill*"
    }
  ]
}
PAYLOAD
)
```

**Important**: Use `--input` with the full JSON body (including `commit_id`, `event`, `body`, and `comments` array) rather than mixing `-f` flags with `--input`. The `--input` approach ensures the comments array is properly structured.

## Error handling

- If a comment fails to map to a valid diff position, move it to the review body rather than dropping it
- If the API returns a 422 (validation error), check that all `line` values exist in the diff — GitHub rejects lines not present in the diff
- If the API returns **400 "Problems parsing JSON"**, an emoji or other non-BMP character was escaped as `\u{1F916}`, which is invalid JSON. Use a literal emoji char (preferred) or the surrogate pair `\uD83E\uDD16`. Always validate the payload before posting: `python3 -c "import json; json.load(open('payload.json')); print('ok')"`
- If the diff is too large to process, ask the user which files to focus on
