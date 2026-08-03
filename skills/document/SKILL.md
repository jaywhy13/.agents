---
name: document
description: Creates clear, audience-friendly documents with progressive disclosure, analogies, strong structure, visuals, concise prose, and review before delivery. Use when the user asks to create, draft, write, revise, polish, or prepare any document, including proposals, plans, specifications, reports, guides, memos, posts, announcements, presentations, and strategy docs.
---

# Document

## Purpose

Document creation helps a reader understand, decide, or act. Treat every document like a guided tour: begin with the destination, show the map, then walk into the details only when the reader is ready.

## Core principles

1. **Start from the reader's goal.** Open with the document's purpose, audience, decision, or outcome, and state why it matters before naming implementation details or specialized terminology. Apply this recursively to headings, paragraphs, bullets, and numbered steps. In a procedure, state what the reader will accomplish before describing the mechanism.
2. **Disclose complexity progressively.** Begin high-level, then add layers of detail. Never drop the reader directly into jargon, edge cases, or dense mechanics.
3. **Use analogies generously and consistently.** When a concept may feel complex, introduce a simple analogy and keep using the same analogy for the same concept throughout the document.
4. **Help the reader know where they are.** Start with an overview or summary, organize details into clear sections, and end with a conclusion or next step.
5. **Make every paragraph easy to follow.** Open with the point, support it with one or more sentences, and close by reinforcing the takeaway or transition.
6. **Use emojis as signposts.** Add emojis to improve scanning, tone, and context clues. Use them deliberately, not as decoration that distracts from the message.
7. **Wield verbosity expertly.** Be succinct by default. Add detail only when it helps the reader make a better decision, understand a hard concept, or complete a task safely.
8. **Illustrate whenever useful.** Prefer tables, timelines, simple diagrams, checklists, status matrices, relationship maps, and text visuals when they make the idea easier to grasp.
9. **Use Socratic clarity when explaining.** When the document teaches a concept, apply the `explain-like-socrates` skill: guide the reader with motivating questions, gradual reasoning, and one consistent analogy.
10. **Review after the document is complete.** Once the full draft is written, always launch a sub-agent to review the document for clarity, comprehension, structure, and appropriate succinctness before giving the final version to the user.
11. **Explain code from behavior inward.** Assume the reader does not know the code. Describe the reader-facing capability first, the signal or source of truth that drives it second, and implementation details such as classes, methods, or data shapes last. Do not open with transformations between implementation types.

## Workflow

1. **Orient the reader.** Identify the document type, audience, purpose, and desired action. If missing information would materially change the document, ask up to three focused questions; otherwise state assumptions and proceed.
2. **Choose the simplest useful shape.** Start with a short summary, then select sections that match the artifact: context, goals, options, recommendation, risks, plan, timeline, status, decisions, or next steps.
3. **Draft from high-level to detailed.** Define plain-language intent first, then introduce terms, mechanics, and edge cases in increasing depth.
4. **Add comprehension aids.** Look for places where a table, timeline, diagram, checklist, or emoji would reduce cognitive load.
5. **Tighten the prose.** Remove filler, repeated points, unexplained jargon, and paragraphs that mix too many ideas. If feedback or review reveals implementation-first wording anywhere, audit the entire artifact for the same pattern rather than fixing only the cited passage.
6. **Launch the review after the draft is complete.** Once the document has a complete first draft, start a sub-agent review with the prompt below. Do not skip this review for user-facing documents.
7. **Integrate the review.** Apply useful feedback, then deliver the final document with any assumptions or open questions clearly marked.

## Sub-agent review prompt

After the documentation or document draft is complete, launch a sub-agent before final delivery with a task like this:

```text
Review this document before final delivery. Apply the document skill's principles and the explain-like-socrates skill.

Check these locations specifically:
1. Opening: Does it state the reader-facing goal before details or jargon?
2. Summary: Can the reader understand the main point without reading the full document?
3. Section flow: Do headings, paragraphs, bullets, and numbered steps move from the reader-facing outcome to supporting details?
4. Complex concepts: Are terms explained before heavy use, with one consistent analogy where useful? For code explanations, does the draft present capability, signal or source of truth, then implementation?
5. Visuals: Would a table, timeline, checklist, diagram, or status matrix make any dense part easier to scan?
6. Emojis: Do they provide context clues without distracting from the content?
7. Paragraphs: Does each paragraph open with a clear point and avoid rambling?
8. Verbosity: Is the document as succinct as it can be without losing necessary meaning?
9. Conclusion: Does it end with a conclusion, recommendation, or next action?

Return only concrete edits or concerns. Good feedback names the location and the fix: "In the Risks section, add a two-column table for risk and mitigation." Avoid vague feedback like "make it clearer" or style-only rewrites.

Draft:
[PASTE DOCUMENT]
```

## Output patterns

Use these patterns when they help the reader:

- **Decision document:** summary → recommendation → rationale → options considered → risks → next steps.
- **Explainer:** plain-language goal → analogy → concept breakdown → example → conclusion.
- **Project plan:** outcome → scope → timeline → owners → risks → status table → next actions.
- **Status report:** headline status → status table → changes since last update → blockers → next steps.
- **Guide:** what the reader will accomplish → prerequisites → steps → verification → troubleshooting.

## Quality checklist

Before delivering, verify:

- The first paragraph explains why the document exists.
- The reader can understand the summary without reading the details.
- Headings, paragraphs, bullets, and numbered steps lead with the reader-facing outcome rather than the mechanism.
- Code explanations present capability, signal or source of truth, then implementation.
- Specialized terms are defined before they are used heavily.
- Any analogy is simple, consistent, and not mixed with competing metaphors.
- Tables or visuals are used where they reduce effort.
- Emojis improve scanning without making the document feel unserious.
- Paragraphs open with a clear point and avoid rambling.
- The final section gives a conclusion, recommendation, or next action.
- The sub-agent review has been considered and incorporated where useful.
