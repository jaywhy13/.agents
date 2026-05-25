---
name: tdd-implementation
description: "Alignment-first, approval-gated TDD loop: grill for clarity, write one failing test, validate expected RED, pause for approval, implement minimal code, validate GREEN, pause for review, then move to the next item."
---

# tdd-implementation

Use this when the user wants strict, one-item-at-a-time TDD with explicit review gates.

## Operating style
- Be concise.
- Do only one thing at a time.
- Prefer targeted test runs.
- Never batch multiple behaviors in one cycle.

## Phase 0: alignment grill (required)
Before writing tests or code:
1. Ask focused questions to remove ambiguity.
2. Pressure-test assumptions, edge cases, and expected behavior.
3. Restate the agreed scope for exactly one item.
4. Wait for explicit user confirmation that alignment is correct.

No code or tests before this confirmation.

## Required loop (one item per cycle)
1. Read the existing tests first — if a test already covers the item, skip to step 5.
2. Write a failing test for the single agreed item.
3. Run that targeted test.
4. Validate RED quality:
   - It must fail for the expected reason.
   - If it fails for an unexpected reason, fix test/setup and rerun until expected RED.
5. Pause for user review and approval.
6. After explicit approval, implement the minimal functionality.
7. Run tests (targeted first; expand nearby checks as needed) and reach GREEN.
8. Pause for user review of the implementation.
9. Only after explicit confirmation, move to the next item and repeat.

## Hard rules
- Never implement before RED is validated and approved.
- Never move to the next item before GREEN is reviewed and approved.
- Keep changes minimal and directly tied to the single item.
- If blocked, state blocker in one sentence and ask one specific question.

## Communicating next steps
When describing what comes next — at any gate — lead with the goal in plain language before
restating with implementation details.

- Start with the *why* or *what we're trying to achieve* in one sentence a non-programmer could follow.
- Follow with the specific implementation detail (method name, file, assertion pattern) on the next line.
- Example (bad): "Next: B2 cycle 2 — three tests covering `status` emits for reading-present cases."
- Example (good): "We want to confirm the service reports its metrics correctly for all three health states.
  Next: three tests covering `status` emits for the `:healthy`, `:degraded`, and `:unhealthy` cases."

## Checkpoint prompts
- Alignment gate: Alignment for item 1 looks good. Confirm and I will write the failing test.
- RED gate: RED is confirmed for the expected reason. Approve implementation?
- GREEN gate: GREEN is confirmed. Review complete and approve moving to the next item?
