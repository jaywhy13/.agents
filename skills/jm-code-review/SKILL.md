---
name: jm-code-review
description: Reviews a change holistically for scope, API semantics, implementation, documentation, testing, monitoring, and production observability. Use when the user asks for a JM code review, or when another review skill needs Jean-Mark's review standards.
---

# JM Code Review

A holistic review asks whether the right change is understandable, dependable for callers, and operable in production.

## Process

1. **Establish the contract.** Resolve the pull request, branch, commit range, or working-tree change supplied by the user; ask for the review target when none is given. Read the complete diff, pull request description, originating problem or specification, and acceptance criteria. Identify public interfaces and the production path affected by the change. Complete when the intended outcome, changed surface, and review boundary are explicit; record missing evidence as a question.
2. **Read the capability before the mechanics.** Inspect public entry points, names, types, and value objects before reading method bodies. Narrate what the change lets the system do, which decisions it makes, and what outcomes or side effects callers observe. Then trace relevant unchanged context, callers, dependencies, error paths, tests, documentation, deployment configuration, telemetry, and monitors. Complete when the capability and decision flow are understandable without parsing low-level mechanics and every changed behaviour has been followed from entry point to externally visible outcome or failure.
3. **Apply every lens below.** Classify each question as pass, finding, evidence gap, or not applicable. Complete when every question has a classification backed by code, documentation, configuration, or a clearly named evidence gap.
4. **Report actionable results.** Order findings by user or production impact. Give each finding a severity, `file:line`, observed evidence, consequence, and concrete remedy. Put evidence gaps in a separate Questions section. End with the strongest verified qualities of the change.

## Review lenses

### Basics — right-sized intent

- Does the pull request description explain the change, its reason, and how to verify it?
- Does the change solve the described problem and acceptance criteria?
- Can a reviewer understand the change without reconstructing its intent from the implementation?
- Can independently valuable, reviewable, or deployable slices make the pull request smaller?

### Intentionality — capability, decisions, then mechanics

- Do public entry points, names, types, and value objects reveal the capability before a reviewer reads implementation details?
- Can the main workflow be narrated in domain terms, including the decisions it makes and the externally visible outcomes or side effects?
- Does orchestration present capability and decision flow before parsing, mutation, serialization, framework, transport, or storage mechanics?
- Are low-level mechanics behind supporting boundaries whose names explain why the workflow needs them?
- When the enclosing type does not make an operation obvious, does the method name state the specific capability, business question, or outcome? Generic entry points such as `call` are acceptable when the type already makes the operation unambiguous.
- Do typed domain values carry meaning between stages instead of requiring callers to infer a contract from untyped containers?
- Are lifecycle transitions, destructive actions, persistence, publication, retries, and completeness decisions visible at the level where they affect behaviour?
- Treat opacity as a suggestion unless it conceals a material contract, side effect, security decision, failure path, or production risk.

### API semantics — dependable boundaries

Treat code interfaces, configuration, events, metrics, and log formats as APIs when consumers depend on them.

- Is the API the smallest complete surface for the required capability?
- Is there one clear way to perform each operation?
- Will callers find the names, defaults, errors, and side effects unsurprising?
- Does the boundary expose domain concepts while keeping implementation details private?
- Are compatibility changes identified and accompanied by a migration or rollout plan?
- Is the API reusable for the domain capability without encoding one caller's workflow?
- Does each boundary have one coherent concern?

### Implementation — production fitness

- Does the implementation satisfy every original requirement?
- Is each branch logically correct, including state transitions and failure paths?
- Is the design as simple as the required behaviour permits?
- Does it handle concurrency, retries, partial failure, invalid input, and cleanup where applicable?
- Is expected production load handled efficiently?
- Are trust boundaries, authorization, sensitive data, and injection risks handled safely?
- Can operators understand success, failure, and important branches from emitted telemetry?
- Does each new dependency justify its operational, security, and maintenance cost?
- Does the change fit the system's established architecture and domain language?

### Documentation — usable knowledge

- Are new user-facing and operator-facing capabilities documented?
- Are all relevant documentation surfaces updated: overview, API reference, user guide, operations guide, and examples?
- Are the documents accurate, understandable, and polished?

### Testing — behavioural evidence

- Do tests demonstrate each new or changed behaviour through observable outcomes?
- Do tests cover boundaries, corner cases, failures, and recovery paths?
- Is each risk tested at the appropriate level, including unit, integration, contract, end-to-end, or load testing where applicable?

### Monitoring — automated detection and routing

- Will monitors detect the important production failures and unacceptable degradation introduced by the change?
- Do notification routes and urgency match the impact, from informational Slack messages through paging?

### Observability — human verification and diagnosis

- Is there a concrete production verification plan?
- Do traces, metrics, and logs carry the dimensions needed to explain important branches and outcomes?
- Can emitted telemetry reconstruct system behaviour across success, degradation, and failure?
- Are material telemetry gaps resolved or explicitly tracked?
- Is it clear where the change appears in the team's production telemetry and error tools, such as Datadog, Sumo Logic, and Sentry?
- Can production queries answer every question implied by the acceptance criteria?
- Are useful verification and diagnostic queries documented for each relevant tool?
