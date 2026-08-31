# Voice for /teach

> **This module is wired into `/teach`.** `createTeachVoice` is built in
> `teach-lesson-host.ts`, `LessonVoiceAdapter` joins it to the two token-route
> addresses, and the page holds one `VoiceController` — the old `useNarrationHotkey`
> is gone, so Space has exactly one owner. One choice differs from step 3 below:
> a beat is spoken when the page asks for it, not when it is published, so a beat the
> learner never reaches costs nothing and a slow proxy call never holds up a turn.
> The integration steps are kept as a record; see the package README for what a
> learner sees.

## 🎯 What this gives you

The lesson can **talk** and the learner can **talk back**. Press Space and the lesson
falls silent and starts listening; press Space again and what you said is written
down and handed to the teaching agent.

Everything goes through the **Shopify AI Proxy**, an internal address that speaks
the OpenAI wire format on Shopify's behalf. The credential for it never leaves the
pi process: the lesson page asks the lesson server, and only the lesson server calls
the proxy.

This directory holds the server half. The browser half is in
`frontend/src/voice/`. Neither half is wired into the running lesson yet — that is
the [integration step](#-integrating-it) below.

## 🧭 The two round trips

Voice is two errands, and they are the whole system:

| Errand | Direction | Address | Model | Comes back as |
|---|---|---|---|---|
| **Listening** | learner → lesson | `/audio/transcriptions` | `gpt-4o-mini-transcribe` | text |
| **Speaking** | lesson → learner | `/audio/speech` | `gpt-4o-mini-tts` (configurable) | MP3 |

Both errands are ordinary HTTP posts. Neither is a live phone call.

## ⚠️ The honest limitation: this is not a phone call

The proxy's speech route is **request and response**, not a duplex stream. That has
one consequence worth stating plainly, because it shapes the whole design:

> **Nothing is heard until the whole line has been generated.**

Think of it as **ordering a meal** rather than **being handed food at a buffet**. You
ask for a dish, you wait for the kitchen, and then you get all of it at once. You
cannot start eating the first bite while the rest is still being cooked.

So the size of the order *is* the length of the wait. This is why:

- 🍽️ **A narrated beat is one short line.** `LONGEST_SPEECH_CHARACTERS` is 900. That
  limit is not a safety rail bolted on afterwards — it is the latency budget, written
  down. Long narration is cut into several short lines and the page plays the first
  while the rest are still being made.
- 🚫 **The lesson cannot be interrupted mid-word by the model.** Interrupting is done
  in the browser, by stopping playback. The proxy is not told.
- 🕐 **Transcription is not live captions.** The learner speaks, presses Space, and
  *then* waits. There is no partial transcript while they talk. That wait has its own
  visible state so it never looks like the lesson has frozen.
- 🎙️ **Voice detection is not included.** The learner decides when they have finished
  by pressing Space. Nothing listens for a pause.

None of this can be fixed inside this design. A truly conversational lesson needs a
duplex realtime route, which this proxy path does not offer.

## 🔒 What is refused, and why

Every limit is checked before the network is touched, so a bad request costs
nothing. All of them live in `voice-limits.ts`.

| Limit | Value | Why it exists |
|---|---|---|
| Audio types accepted | WebM, OGG, WAV, MP4, MPEG | What browsers actually record |
| Upload size | 8 MiB | An answer, not a recording session |
| Transcript response | 256 KiB | A transcript is text |
| Speech text | 900 characters | The latency budget |
| Speech response | 4 MiB | About a minute of MP3 |
| Request deadline | 30 seconds each | A lesson must not hang |
| Cached audio | 256 lines / 32 MiB | The cache lives as long as the pi session |

Response bodies are read through a **bounded reader** that stops mid-stream once the
limit is passed, rather than buffering everything and checking afterwards.

## 🧠 Never fabricate audio

`NarrationVoiceService` will not paper over a failure. If a line cannot be spoken it
throws `NarrationAudioUnavailableError` and caches nothing:

- Empty audio is never returned as if it were speech.
- A JSON error body arriving with a `200` status is refused, not played as noise.
- A failed attempt leaves no cache entry, so a retry really retries.
- A beat that fails part way through fails as a whole — half a beat read aloud is
  worse than a beat the page admits it could not read. Lines already spoken stay
  cached, so the retry is cheap.

The page's job when it sees that error is to **show the words instead**.

## 🗂️ The files

### Server (`src/voice/`)

| File | What it owns |
|---|---|
| `shopify-proxy-configuration.ts` | Where to call, and with what credential |
| `voice-limits.ts` | Every size, type, and time limit |
| `voice-errors.ts` | One named error per way this can refuse |
| `proxy-http.ts` | The single exit point: deadline, bounded reader, error shape |
| `proxy-transcription-client.ts` | Recording → text |
| `proxy-speech-client.ts` | One short line → MP3 |
| `narration-speech-text.ts` | Cutting narration into short lines (pure) |
| `narration-audio-cache.ts` | Bounded, least-recently-used audio cache |
| `narration-voice-service.ts` | The service layer: speak a beat, once, or fail loudly |
| `index.ts` | `createTeachVoice(environment, fetch)` builds the lot |

### Browser (`frontend/src/voice/`)

| File | What it owns |
|---|---|
| `voice-session-state.ts` | The five visible states and the key contract (pure) |
| `browser-voice-limits.ts` | What the browser will record |
| `microphone-recorder.ts` | MediaRecorder capture. Ends once, whatever ended it — the learner, the 60 second limit, the 4 MiB limit, or a recorder failure — and releases the microphone there and then |
| `audio-playback-controller.ts` | Play, pause, resume, and stop **now** |
| `voice-controller.ts` | The session as one object the page can hold |
| `index.ts` | Barrel |

## 🎛️ The five states the learner sees

```
        Space                Space              transcript          turn ends
idle ──────────► listening ─────────► transcribing ───────► thinking ─────────► idle
  ▲                  │ Escape              │ Escape                              ▲
  │                  ▼                     ▼                                     │
  └──────────── (recording thrown away) ───┘                                     │
                                                                                 │
speaking ──── Space stops the audio, then opens the microphone ──► listening     │
   └──────────────────────── audio finishes on its own ──────────────────────────┘
```

The Space and Escape contract itself is **not** restated in the browser code. It
already lives in `shared/narration-hotkey.ts` as a tested pure state machine.
`voice-session-state.ts` wraps that machine and adds the two waiting states around
it, so there is still exactly one place that decides what a Space press means.

One rule is added on top: while the lesson server is working, Space is **claimed but
does nothing**. The page must never scroll out from under a learner mid-answer.

## 🔌 Integrating it

Nothing here is wired in yet. Five steps, in order:

1. **Build the voice modules once, at lesson-host startup.**
   `createTeachVoice(process.env, fetch)` returns everything, or `null` when there is
   no credential. A lesson without voice still teaches, so `null` should switch voice
   off, not stop `/teach`.

2. **Add two addresses under the existing token route,** so they inherit the token
   check, the origin and host checks, and the content security policy already in
   `src/server/request-guard.ts`:
   - `POST /t/<token>/voice/transcribe` — takes the recorded blob, returns `{ text }`.
   - `GET  /t/<token>/voice/narration/<beatId>` — returns the MP3 lines for a beat.

3. **Speak a beat when a narration beat is published.** `beat-publisher.ts` already
   knows when narration appears. Call
   `narrationVoiceService.narrateBeat({ lessonId, beatId, chunks })` and tell the page
   the lines are ready. On `NarrationAudioUnavailableError`, tell the page voice
   failed for that beat — do not fall back to silence.

4. **Free the lesson's audio when the lesson closes.** Call
   `narrationVoiceService.forgetLesson(lessonId)` wherever the lesson's session is
   disposed today.

5. **Hold one `VoiceController` in the page** and hand it a `VoiceTransport` that
   posts to the two addresses in step 2. Subscribe for re-renders; the status bar
   already has a place for the state. Replace the existing `useNarrationHotkey` call
   with `voiceController.handleKeyDown`, or the two will both claim Space.

### What is needed to run it

| Requirement | Status |
|---|---|
| New npm package | ❌ None. Node's own `fetch`, `FormData`, `Blob`, and `crypto`. |
| `PI_PROXY_AUTH_HEADER` or `PI_PROXY_API_KEY` in pi's environment | ✅ Both exported by pi; read in one place, `src/proxy/shopify-proxy-credential.ts`, which pictures read too |
| Browser `MediaRecorder` + `getUserMedia` | ✅ Chrome, Firefox, Safari 14.1+ |
| A secure context for the microphone | ✅ `127.0.0.1` counts as secure |

### Optional settings

| Variable | Default | Notes |
|---|---|---|
| `TEACH_VOICE_SPEECH_MODEL` | `gpt-4o-mini-tts` | Or `tts-1`, `tts-1-hd` |
| `TEACH_VOICE_SPEECH_VOICE` | `alloy` | Ten supported voices |
| `TEACH_VOICE_PROXY_BASE_URL` | the proxy's OpenAI route | Must be `https` |

## ✅ Testing

```bash
node --test --test-timeout=15000 "tests/voice/**/*.test.ts"
```

114 tests, no network. `FakeProxyFetch` returns real `Response` objects, so the
clients read a real body stream, real headers, and a real status. No test ever
reaches the proxy.

## ➡️ Next

The three things this does not yet do, in the order they matter:

1. Wire in the two server addresses and the React hook (steps 2 and 5 above).
2. Decide what the page shows when a beat cannot be spoken.
3. Measure the real wait for one 900-character line, and lower the limit if it feels
   long. The limit is a guess about latency until it is measured.
