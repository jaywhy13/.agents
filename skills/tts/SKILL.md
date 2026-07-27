---
name: tts
description: Renders supplied text into an MP3 through the dedicated morning-brief text-to-speech tool. Use when a spoken script needs a local MP3 path, especially for the morning brief.
compatibility: Requires the morning_brief_tts tool supplied by the morning-brief delivery extension.
---

# Text to Speech

Render the approved script without editing it.

## Contract

The only synthesis operation is:

```text
morning_brief_tts(text) -> MP3 path
```

`text` must be the complete, nonblank approved spoken script. The tool chooses and returns the local MP3 path.

## Workflow

1. Reject blank text; do not invent a script.
2. Call `morning_brief_tts` once with the supplied text unchanged.
3. Accept success only when the tool returns a nonblank MP3 path and the referenced file exists, is a nonempty regular file, and is an MP3. Treat any other response as failure.
4. Carry forward the returned path as `audio_path`; do not move, rename, transcribe, or publish it.

If the tool is absent, errors, or returns an invalid path, report `audio_unavailable` with the tool error. Do not fall back to a shell command, operating-system voice, another text-to-speech service, or a generic media tool. The morning-brief lead can still publish the written body without audio.

Example tool input:

```json
{"text":"Wah gwaan, JM. Here is how the day is shaping up..."}
```
