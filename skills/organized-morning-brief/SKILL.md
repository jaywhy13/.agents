---
name: organized-morning-brief
description: Immediately publishes a morning-brief Markdown body and optional MP3 to Organized for the trusted runner-provided target. Use when performing the dedicated morning-brief publication step.
compatibility: Requires the future morning_brief_publish_to_organized tool and trusted runner target context.
---

# Organized Morning Brief

Publish the approved morning brief immediately. The runner invocation authorizes this write; do not ask for a second confirmation.

## Inputs and authority

- `body`: required, nonblank Markdown for the written brief. It must not contain the spoken transcript.
- `audio_path`: optional validated MP3 path. Omit the argument when audio is unavailable; never pass an empty string.
- Target workday: supplied through trusted runner context and consumed by the publishing tool. Never infer, choose, or pass a model-controlled target, time, source identity, or destination.

## Publishing contract

Use only this deterministic tool:

```text
morning_brief_publish_to_organized(body, audio_path optional)
```

Call it once in the normal flow. With audio:

```json
{"body":"# Morning Brief — ...","audio_path":"/absolute/path/brief.mp3"}
```

Without audio:

```json
{"body":"# Morning Brief — ..."}
```

The tool owns target validation, the stable source identity, idempotent upsert behavior, and the Organized write. It publishes during this run for the runner-provided target.

## Boundaries

- Do not create a pending payload, delayed sender, schedule, reminder, or background delivery job.
- Do not use `organized-post`, Quick database writes, browser automation, or Slack as a fallback.
- Do not publish when `body` is blank or trusted target context is missing.
- On an explicit tool failure, surface the error instead of claiming success. On an ambiguous response, report the ambiguity and rely on the tool's stable upsert identity rather than attempting a different write path.

Report the returned post identifier or URL and `posted` or `posted_without_audio` status.
