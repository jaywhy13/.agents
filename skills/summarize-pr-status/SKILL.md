---
name: summarize-pr-status
description: "Summarizes the signed-in GitHub user's open pull requests and the actions needed to move them forward without changing GitHub. Use when the user asks for pull request status, review or check blockers, merge readiness, or a read-only pull request roundup."
---

# Summarize Pull Request Status

Produce an action-oriented snapshot of open pull requests authored by the signed-in GitHub user.

## Read-only boundary

This skill only reads. Do not comment, review, approve, merge, close, edit, label, rerun checks, push commits, or change pull requests, repositories, or local files. Do not invoke a write-capable GitHub tool.

## Gather the status

1. Run this existing collector with `bash`:

   ```bash
   node /Users/jeanmark.wright/code/ai-workflows/morning-brief/collect-open-prs.mjs
   ```

2. Treat its JSON as the source for pull request identity, draft state, review decision, merge state, latest check rollup, recent non-author feedback, and `generated_at` time.
3. Use read-only GitHub or Buildkite lookups only when the collector identifies a failure or comment whose meaning cannot be summarized safely. Follow links rather than guessing from a check name.
4. If the collector fails, report the command error and the missing coverage. Do not replace current status with remembered state.

## Prioritize accurately

Order attention by:

1. changes requested or explicit reviewer questions;
2. failed checks or a blocked/dirty merge state;
3. approval required;
4. pending checks or reviews;
5. drafts needing a readiness decision;
6. clean items with no obvious action.

A pull request is not merge-ready merely because checks pass. Keep draft state, approval, merge state, and checks distinct. Include exact repository, number, title, link, and the status timestamp. Summarize feedback; quote only a short passage when its exact wording changes the action. Describe old work by its last-updated date instead of inventing a stale threshold.

## Return

```text
PR_STATUS
as_of: <generated_at>
summary: <one sentence>
needs_attention:
- <repository#number — broad purpose — blocker → next action — URL>
waiting:
- <repository#number — what is pending — URL>
clear_or_no_action:
- <repository#number — current state — URL>
source_issues:
- <failure or coverage caveat; [] when none>
```

Keep the block in the current conversation so a larger workflow can synthesize it. A skill is an instruction document, not a callable function; do not claim that it returned data through a separate runtime.
