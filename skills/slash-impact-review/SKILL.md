---
name: slash-impact-review
description: "Build and publish a high-evidence personal impact review. Use when the user says '/impact review', 'slash impact review', 'run impact review', or asks to summarize their impact from artifacts, Organized posts, scratchpad plans, pull requests, meetings, documents, and Quick sites."
---

# Slash Impact Review

Create an evidence-backed, engaging impact review, grouped by initiatives, then publish it to Organized with the primary tag `impact-review`.

Tone: credible and fun. Use emojis as section signposts and visual anchors, especially in headings, status labels, evidence callouts, and ratings. The review should feel energizing to skim without weakening the evidence.

The review has three phases:
1. 🕵️ gather as much evidence as practical;
2. 🧩 group evidence into initiatives with crisp impact bullets;
3. 🧭 answer the impact-review prompts and give provisional 1–5 ratings.

Default window: the past **3 weeks**. Honor any window the user specifies.

## Evidence sources to gather

Gather first, synthesize once. Run independent searches in parallel where possible.

### 1. Identity and handles
- Resolve the user's Shopify email and Slack user id with `slack_whoami` or equivalent.
- Resolve the GitHub handle from Vault or BigQuery if needed:
  ```sql
  SELECT github, name, email
  FROM `shopify-project-centaur.centaur.vault_users_v1`
  WHERE email = '<shopify-email>'
  LIMIT 1
  ```
- If GitHub tools are unavailable, use `gh search prs`, `gh pr list`, and local `git log --author` in known repositories.

### 2. Organized posts
Organized is the internal personal feed at `organized.quick.shopify.io`.
- Read `posts` from the Organized Quick site with `quick_query_collection(site: "organized", collection: "posts")` or the Quick Node SDK.
- Filter by author and the review window where possible.
- Search tags and text for: `morning-brief`, `thinking-out-loud`, `today-i-learned`, `retro`, `impact`, `work`, project names, and presentation-like posts.
- Use these posts to infer active work, decisions, ideas shared, and presentation artifacts.

### 3. Scratchpad projects, plans, and todos
The scratchpad is the durable task/project record under `/Users/jeanmark.wright/Documents/JMxShopify/Projects`.
- Read active, upcoming, and completed project `project.md` files modified in the window.
- Read task `plan.md` files under each project's `tasks/active`, `tasks/completed`, and `tasks/upcoming` when started, modified, completed, or referenced in the window.
- Extract: overview, status, task list completions, decisions, open questions, files touched, pull request links, issue links, and retrospectives.
- Do not use the old `/Users/jeanmark.wright/Documents/JMxShopify/Tasks` tree unless the current scratchpad files explicitly reference it.

### 4. Pull requests, issues, and commits
- Find pull requests authored by the GitHub handle and closed or merged in the window.
- Include open pull requests if they represent in-flight impact.
- Capture repository, number, title, merged/closed status, dates, and one-line outcome.
- Look for linked issues, reviews, and follow-up pull requests.
- If local repositories are available, inspect recent branches and commits to understand what changed, not just titles.

### 5. Calendar meetings and notes
- Use Google Calendar over the window with all calendars, attendees, and attachments.
- Read attached Google Docs or Gemini notes for relevant meetings, especially 1:1s, project meetings, demos, planning, retrospectives, and presentations.
- Extract decisions, action items assigned to the user, stakeholders, and evidence that ideas were shared or alignment was created.
- If a meeting has no readable notes, record that caveat instead of inventing content.

### 6. Documents created or edited
- Search Google Drive for documents owned by or modified by the user in the window.
- Prioritize docs whose title/content match active initiatives, meeting artifacts, strategy, plans, proposals, demos, and presentations.
- Read enough of each document to understand the outcome and how it was used.

### 7. Quick sites and presentations
Quick is Shopify's internal static app/site platform.
- Search for Quick sites created or edited by the user, especially site names mentioned in scratchpad plans, Organized posts, pull requests, Slack, or meetings.
- Inspect files and collections with Quick tools when available.
- Treat demo sites, visual explainers, dashboards, and prototypes as presentation artifacts when they were used to share ideas with a team.

### 8. Slack and team communication
- Search Slack for messages from the user in the window, especially in project channels and threads linked from plans, meetings, or pull requests.
- Look for: unblocking others, explaining ideas, coordinating decisions, reviewing work, presenting concepts, and follow-through on commitments.
- Prefer concrete threads over broad message counts.

### 9. Morning brief clues
Use the morning brief workflow as an evidence-discovery aid, not as final evidence by itself.
- Inspect `/Users/jeanmark.wright/code/ai-workflows/morning-brief/pending` and `sessions` for the window.
- Morning briefs can point to calendar focus, active tasks, Slack follow-ups, and open pull requests that deserve deeper investigation.

## Synthesis procedure

### Group into initiatives
Create 3–7 initiatives. Each initiative should have:
- an emoji-prefixed, outcome-oriented name, for example `🚚 Ads Data migration readiness`;
- one short **outcome sentence** that explains the human/system result;
- 3–5 grouped bullets under stable labels instead of repeating `Impact:` on every line:
  - `🎯 Outcome` — what changed for people, the team, or the system;
  - `🚢 Shipped / moved` — concrete pull requests, docs, sites, decisions, or coordination that moved the outcome;
  - `🔗 Evidence` — link-rich artifacts: GSD/project links, pull requests, docs, Organized posts, Quick sites, meeting notes, Slack threads, scratchpad plans;
  - `🟢 Status` / `🟡 Status` / `🔴 Status` — shipped, in review, in flight, research, or blocked;
  - `⚠️ Caveat` — only when evidence is weak or incomplete.

Do **not** write several bullets that all start with `Impact:`. Group related evidence inside each initiative so the reader sees the shape of the work, not a repetitive list.

Prefer initiative groupings over artifact categories. For example, group a plan, pull request, demo site, and meeting notes together when they all moved one outcome forward.

### Answer the impact-review prompts
Keep answers concise and linked to work.

1. **Explain the impact you had on the outcome.**
   - Short summary first.
   - Then initiative bullets with evidence links.

2. **How did your use of Artificial Intelligence contribute to your impact on the outcome?**
   - Mention where Artificial Intelligence accelerated discovery, synthesis, prototypes, code review, documentation, meeting preparation, or follow-through.
   - Be specific about what the user still owned: judgment, direction, quality bar, stakeholder decisions.

3. **What would unlock even greater impact?**
   - Give concrete suggestions: clearer ownership, faster review loops, stronger project scoping, more delegation, better instrumentation, recurring demo cadence, or reducing context switching.
   - Tie suggestions to observed bottlenecks.

4. **Provisional ratings, 1–5.**
   Provide a short evidence-backed thought for each:
   - I set the bar through quality of my work outputs.
   - I take responsibility for my outcomes, not just my own work.
   - I constantly charge my trust battery and make me and my team on Shopify better.
   - I execute with speed.
   - I increase talent density by developing people and subtracting.

## Output format

Write the final review as Markdown. Make it skimmable, link-rich, and lively:

```markdown
# Impact review 🚀 — <date range>

## 🧾 Evidence reviewed
- 📝 Organized posts: <count and notable examples>
- 🗂️ Scratchpad projects/plans: <count and notable examples>
- 🚢 Pull requests/issues/commits: <count and notable examples>
- 🤝 Meetings/notes: <count and notable examples>
- 📄 Documents: <count and notable examples>
- ⚡ Quick sites/presentations: <count and notable examples>
- 💬 Slack threads/messages: <count and notable examples>
- ⚠️ Caveats: <missing/inaccessible sources>

## 🧩 Initiatives
### 🚚 <Initiative name>
<One-sentence outcome summary.>

- 🎯 **Outcome:** ...
- 🚢 **Shipped / moved:** ...
- 🔗 **Evidence:** ...
- 🟢 **Status:** ...
- ⚠️ **Caveat:** ...

## 🌍 Impact on outcomes
...

## 🤖 Artificial Intelligence contribution
...

## 🔓 Unlocks for greater impact
...

## 📊 Provisional ratings
- **🏗️ I set the bar through quality of my work outputs — <score>/5.** ...
- **🧭 I take responsibility for my outcomes, not just my own work — <score>/5.** ...
- **🔋 I constantly charge my trust battery and make me and my team on Shopify better — <score>/5.** ...
- **⚡ I execute with speed — <score>/5.** ...
- **🌱 I increase talent density by developing people and subtracting — <score>/5.** ...

## 📚 Evidence appendix
- Keep concise but link-rich. Include artifact titles, dates, and URLs/paths.
```

Use emojis as helpful signposts, not confetti. If every line starts to look the same, reduce the emoji density and keep the main initiative headings strong.

## Publishing to Organized

After drafting the review, publish to Organized using the `organized-post` skill.
Use:
- `title`: `Impact review 🚀 — <date range>`
- `summary`: one energetic sentence naming the top 2–3 initiatives and overall impact pattern.
- `body`: the Markdown review.
- `tags`: `["impact-review", "work", "review"]` plus initiative tags when useful.

The user has requested this skill to post the finished impact review to Organized, so explicit publish approval is not required when the skill was invoked for that purpose. Still report the post id/link and any publishing failure.

## Quality bar

- Use evidence before claims. If a claim has no artifact, mark it as a caveat.
- Prefer direct links and artifact names over vague phrases.
- Do not count activity as impact unless you can name the outcome it moved.
- Keep the main review high-level; put detailed artifacts in the appendix.
- Make the review engaging with emojis, strong verbs, and short section summaries.
- Avoid repetitive initiative bullets. Use grouped labels like `🎯 Outcome`, `🚢 Shipped / moved`, `🔗 Evidence`, and `🟢 Status`.
- Be honest about uncertainty and missing sources.
