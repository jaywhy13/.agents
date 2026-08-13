---
name: impact
description: "Generate a personal impact report for review (e.g. before a manager 1:1). Reviews the last 3 weeks of 1:1 notes to extract todos + verify execution + summarize themes, summarizes the last week of local work plans by impact, and rounds up Slack + PR activity. Writes an expanded, memory-jogging YYYY-MM-DD-impact.md into the Obsidian Impact vault. Trigger: user says '/impact', 'impact report', 'what have I been doing', 'prep my impact', or 'summarize my impact'."
---

# Impact

Produce a single, reviewable impact report that answers: **what have I been
working on, what did I commit to, did I deliver it, and what themes is my work
clustering around?** The report is written to the Obsidian Impact vault so it
can be skimmed before a 1:1, a review, or a status update — with enough detail
under each point to jog memory months later.

This skill codifies a multi-source investigation. It does NOT ask the user for
the inputs — it goes and finds them.

## Configuration

- **Output vault**: `/Users/jeanmark.wright/Documents/JMxShopify/Impact`
- **Output file**: `<YYYY-MM-DD>-impact.md` (today's date; create vault dir if absent)
- **1:1 manager**: Joel Dmello (recurring "Jean-Mark/Joel 1:1"). Override if the
  user names a different person.
- **1:1 review window**: last **3 weeks**
- **Work-plan window**: last **1 week**
- **Work-plan root**: `/Users/jeanmark.wright/Documents/JMxShopify/Projects`
  (one `project.md` per project and one `tasks/**/plan.md` per task)

Treat windows as defaults; honor any window the user specifies ("last month").

## Workflow

Run these in parallel where there are no dependencies. Gather first, synthesize
once, write last.

### 1. Establish identity (needed for PR/Slack lookups)
- `slack_who_am_i` → Slack user_id, name, title.
- Resolve GitHub handle from email:
  ```sql
  SELECT github, name, email
  FROM `shopify-project-centaur.centaur.vault_users_v1`
  WHERE email = '<my-shopify-email>' LIMIT 1
  ```
  (Use `query_bq`. As of this writing the handle is `jaywhy13`.)

### 2. Pull the 1:1 notes (last 3 weeks)
- `gcal_events` over the window with `use_all_calendars: true` and
  `include_attachments: true`. Find every instance of the recurring 1:1 with the
  manager.
- For each instance, read the "Notes by Gemini" attachment with
  `gworkspace_read_file` (format markdown). A meeting may carry an attachment
  that is actually a *prior* week's notes (mislabeled) — read by content/date,
  not by the calendar slot it hangs off.
- **If a 1:1 has no Gemini notes attached, say so** in the report — don't invent
  todos for it.
- From each notes doc, extract:
  - **Todos** — the "Next steps" lines assigned to *me* (ignore the manager's
    own action items, but list them separately as "Waiting on <manager>").
  - **Themes** — the "Summary", "Decisions / ALIGNED", and recurring topics.

### 3. Verify execution of each todo
Cross-reference every extracted todo against hard evidence and label it
**✅ Done**, **🟡 In flight**, or **⚠️ Outstanding**:
- PRs: `github_search_pull_requests` with `author:<handle> created:>=<window-start>`
  (sort created desc, perPage 50).
- Issues: `github_search_issues` with the same author/date filter.
- Slack: `slack_search` `from:@<me> after:<date>` to catch coordination,
  socialization, and decisions that never became a PR.
- Local work plans (step 4) often record the ticket/PR a todo turned into.
- Be careful asserting a negative — only call something Outstanding after
  checking PRs **and** issues **and** Slack and finding nothing.

### 4. Summarize the last week of local work plans, by impact
- List `plan.md` files under the work-plan root modified/created in the window
  (`find <root> -name plan.md`; also read `Status` and `Started` headers).
- Read each relevant `plan.md`. Pull the Overview, completed task-list items,
  Decisions, Files Touched, and any PR/issue links.
- Cluster into impact tiers: **🔴 Highest** (incident/unblock/fire),
  **🟠 High** (major project progress), **🟡 Medium** (research, enabling work).
  Rank by blast radius and urgency, not by effort.

### 5. Round up PRs + Slack
- The PR/issue list from step 3 doubles as the activity roundup — group by
  theme (e.g. deploy fixes, resiliency, migration, tooling).
- Skim Slack for the dominant channels and the kind of contribution
  (driving investigations, reviews, stakeholder coordination, advocacy).

### 6. Write the report
Write `<YYYY-MM-DD>-impact.md` to the Impact vault using the structure below.
**Expand every bullet** — each item must carry enough context (what it was, why
it mattered, the concrete artifacts, and status) to jog memory cold. A future
reader who has forgotten the specifics should still understand the point.

After writing, confirm the path and offer to: (a) draft a tighter talking-points
version, or (b) save a session note to the wiki.

## Output structure

Use Obsidian-friendly markdown. Lead each section high-level, then detail.

```markdown
---
date: <YYYY-MM-DD>
type: impact-report
window: 1:1 notes 3w / local work plans 1w
---

# Impact — <Mon DD, YYYY>

> Sources: <N> 1:1s (<dates>), local work plans (<N> tasks), PRs (<handle>), issues, Slack.
> Caveats: <e.g. "May 15 1:1 had no Gemini notes">.

## 1. 1:1 Todos — execution status

### ✅ Done / in flight
For each: **the commitment** — what it was and the context it came from — then,
indented, the evidence (PR/issue numbers + one line on what shipped) and current
state. Two to four sentences each, not a bare table row.

### ⚠️ Outstanding — likely to come up
For each: what was committed, who asked for it (and the target/metric if any),
why it hasn't moved, and the smallest next step. These are the items to raise
proactively.

### Waiting on <manager>
Their action items that gate my work.

## 2. Current themes
Numbered list. Each theme: a one-line name, then 2–3 sentences on what work
feeds it, why it matters now (e.g. "ahead of Q3 internationalization"), and the
through-line connecting the individual tasks.

## 3. Local work plans this week, by impact
Tiered (🔴 / 🟠 / 🟡). Each item: a bold one-line headline, then a paragraph —
what the problem was, what I did, the specific artifacts (PRs/issues/docs/sites),
and the outcome or current status. Enough that I can reconstruct the week.

## 4. PRs, issues & Slack roundup
- **PRs** — grouped by theme with numbers + titles.
- **Issues filed** — numbers + titles.
- **Slack signal** — the channels and the nature of the contribution.

## 5. Suggested talking points
3–5 bullets: what to raise proactively, framed for the 1:1.
```

## Notes & gotchas

- **Don't paraphrase a todo into a different commitment.** Quote the intent.
- **Expansion is the point.** Terse bullets fail the "jog my memory" goal — each
  point needs the why and the artifacts, not just the what.
- **Negative claims are expensive.** "Outstanding" means you searched PRs,
  issues, and Slack and found nothing — say where you looked.
- A 1:1 calendar slot can attach a mislabeled notes doc; trust the doc's own
  date/content over the slot it dangles from.
- If the work-plan folders look empty, the `ls` may be glitching — use
  `find <root> -name plan.md` to enumerate reliably.
