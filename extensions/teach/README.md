# /teach

`/teach [topic]` opens an interactive lesson in your browser. Pi teaches one idea at
a time, starting at the high level, in short sentences, and pauses so you can catch
up or ask something. It reads the lesson out loud, draws diagrams you can move
about, and listens when you press Space.

## Install

`pi install <path>` copies the extension in. It does **not** install dependencies
and it does **not** build the lesson page. Both have to be done first, in this
directory:

```bash
cd /Users/jeanmark.wright/.agents/extensions/teach
npm run setup                                          # installs, links, builds, checks
pi install /Users/jeanmark.wright/.agents/extensions/teach
```

`npm run setup` is one command for four steps: `npm install`,
`npm install --prefix frontend`, `npm run link:pi`, `npm run build:frontend`. It
finishes by running `npm run check:setup`, which prints one line per prerequisite
and fails if any are missing. Run `npm run check:setup` on its own at any time.

If you skip the setup, `/teach` says exactly which pieces are missing and what to
run, rather than failing somewhere deeper.

Then in pi:

```
/teach how a message queue works
```

Pi prints a loopback address and opens it in your browser.

Running `/teach <topic>` again while a lesson is open offers the new topic on the
lesson page, with a button that puts the setup form back.

### Start pi through `devx pi`

Two parts of a lesson need the **Shopify AI Proxy**, an internal address that speaks
the OpenAI wire format on Shopify's behalf:

| Needs the proxy | What you lose without it |
|---|---|
| Voice: reading the lesson out loud, and listening to you | The lesson teaches in writing only, and says so on the page |
| Drawn pictures (`image` beats) | The lesson uses words and diagrams instead, and is told not to offer a picture |

`devx pi` puts the credential in `PI_PROXY_AUTH_HEADER` and `PI_PROXY_API_KEY`.
Either is enough, and both halves read the same one, so voice and pictures are on
together or off together. Without a credential `/teach` still works: it says so once
when the lesson opens, and again on the lesson page. Nothing fails.

Diagrams need no credential. They are drawn on your own machine.

### Browser support

| What | Where it works |
|---|---|
| The lesson itself | Any current browser |
| Diagrams you can edit | Any current browser |
| Speaking and listening | Chrome, Firefox, Safari 14.1 and later — anything with `MediaRecorder` |

The microphone needs a secure context. `127.0.0.1` counts as one, so no certificate
is involved. A browser that cannot record says so on the page and the lesson carries
on in writing.

## What it does

1. `/teach` starts a small web server on `127.0.0.1`, on a free port the system picks.
2. Your browser opens the setup form at `/t/<token>/`, with the topic from the
   command already filled in.
3. You add links, GitHub links, or pasted notes as background.
4. Those are copied onto your machine before the first beat, so the lesson can quote
   them and read them again later.
5. Pi teaches the lesson as a sequence of **beats**. Each beat is exactly one concept.
6. The lesson is saved on your machine under `~/.pi/agent/teach/lessons`.
7. When the pi session ends, the server stops and the browser page goes dead.

## Talking to the lesson

Outside text boxes:

| Key | What happens |
|---|---|
| `Space` | Stops the lesson speaking **at once**, and starts listening to you |
| `Space` again | Stops listening, writes down what you said, and sends it as a question |
| `Esc` | Throws the recording away |

A recording stops itself after 60 seconds or 4 MiB, whichever comes first, and the
microphone is released the moment it does — the browser's recording indicator goes
out even if you do not press `Space` again. Pressing `Space` afterwards sends what
was captured up to that point.

The status bar always says which of five things is happening: **Press Space to
talk**, **Speaking**, **Listening**, **Writing down what you said**, **Thinking**.
While the lesson is writing down or thinking, `Space` is still claimed — so the page
never scrolls out from under you mid-answer — but does nothing.

While the lesson is speaking there is a **Pause speaking** button, which becomes
**Resume speaking**. Anything that ends the speaking — the lesson finishing a beat,
you pressing `Space`, the next beat starting — clears it, so it never sits there
saying the wrong thing.

Three more controls sit under the lesson, and they are the only place the lesson is
told what you want rather than left to guess it:

| Control | What it does |
|---|---|
| **Simpler** | Says the same idea again, plainer, and teaches shallower from now on |
| **Go deeper** | Stays on the same idea and adds the detail, and teaches deeper from now on |
| **Quiz me** | Asks you one question about what has been taught so far |

**Simpler** and **Go deeper** are written down with the lesson, so the pace and depth
they set carry into every later turn. Pressing one while the lesson is still teaching
records it and applies it from the next beat, rather than cutting the lesson off.

Everything the lesson says is also on screen as text. Voice is an addition to the
transcript, never a replacement for it.

### The honest limitation

The proxy's speech route is request and response, not a live call. Nothing is heard
until a whole line has been generated, so:

- narration is cut into short lines (at most 900 characters) and the page plays the
  first while the rest are still being made;
- there are no live captions — you press `Space`, and *then* wait while what you said
  is written down;
- nothing listens for a pause in your speech. You decide when you have finished.

A truly conversational lesson needs a duplex realtime route, which this proxy path
does not offer.

## Beats

A lesson is an append-only list of beats. Each beat is exactly one idea, and all
nine kinds are built:

`concept_card`, `definition`, `code`, `diagram`, `image`, `quiz`, `pause`,
`narration`, `lesson_end`.

A few of them are worth naming:

- **`definition`** builds the glossary panel. The glossary is derived from the
  definition beats rather than stored, so it can never drift from what was taught.
  Every term in it is marked wherever it appears in prose.
- **`code`** is highlighted on the page and has a copy button. The highlighter's
  tokens are turned into plain text spans, so no highlighter markup is ever put
  into the page as raw HTML.
- **`diagram`** is described by the lesson in terms of meaning — parts, and how they
  join — and drawn by the lesson itself. See below.
- **`image`** is a drawn picture. See below.
- **`quiz`** comes in two forms. Fixed choices are graded by the lesson server
  itself. An answer in the learner's own words is graded by the teaching agent
  through a typed tool call.
- **`pause`** ends the teaching turn. Anything the lesson tries to teach after a
  pause in the same turn is refused, so nothing appears while the learner is away
  from the screen. The lesson does not hold a tool call open waiting for them.
- **`narration`** is the words that go with another beat. It is never drawn on
  screen; it is what the lesson reads out loud.

Highlighting a word or a phrase on the page offers to define it. That runs as a
short turn of its own and never moves the lesson on.

## Background you supply

At setup you can give the lesson links, GitHub links, and pasted notes.

A GitHub link is exactly `github.com`, `www.github.com` or `gist.github.com`. Those
are read through the GitHub API as a repository, an issue, a pull request, a file or
a gist. `docs.github.com` is documentation, so it is copied as an ordinary web page.

**They are copied onto your machine before the lesson starts**, into
`~/.pi/agent/teach/lessons/<lesson-id>/references/`. One reference that cannot be
copied shows a notice and the lesson starts anyway, without it.

The teaching agent never has any of the material in its prompt. It gets a list of
labels and identifiers, and two tools:

- `list_lesson_references` — the identifiers, labels, and how long each one is.
- `read_lesson_reference` — one window of one reference by line number, at most 2000
  lines or 50 KB, and it says which line to carry on from.

That is what keeps a whole web page or source file out of the prompt for the rest of
the lesson, and what stops the lesson claiming what a reference says without reading
it.

Fetching is guarded. Every request, including every redirect hop, must be `http` or
`https`, must carry no username or password, must not name a local or cloud-metadata
host, and must resolve to a public address — the socket is then opened to the
address that was checked, so the name cannot change its answer in between. At most
5 redirects, 2 MB per response, 10 seconds per request, 30 seconds in total.

GitHub links use your own `gh` command when it can read GitHub for you, so a private
repository you can see works too. `/teach` asks `gh auth status` once per pi session;
if `gh` is missing or signed out, GitHub is read through its public API over the same
guarded client instead, so a lesson about a public repository never needs `gh`. Either
way `gh` is started with an argument array and no shell, and never sees the raw link:
the link is parsed into named parts first.

## Diagrams

The lesson says what a diagram **means** — the parts, how they join, which parts
matter. It never chooses a colour or a coordinate; the same description always draws
the same picture.

The drawing surface is [Excalidraw](https://excalidraw.com). You can drag the boxes
about, add your own notes, and draw on it. Your version is kept apart from the taught
one:

- **Reset to the taught diagram** always has something true to go back to.
- Your edits are kept in your own browser, under the lesson, the diagram and the
  revision of that diagram. They survive a reload and are never sent to the lesson
  server or anywhere else.

A lesson can build one diagram up in stages: the same diagram drawn again with more
on it. Each drawing is a **revision**. A new revision is always shown as it was
taught — your edits to the earlier one are not drawn over it — and those earlier
edits are kept, under the revision they were made to.

Every diagram is also written out in words underneath — the parts, and how they
join. That is for a learner using a screen reader, and it is also what you see if the
drawing surface fails to load.

The handwriting fonts are copied into `dist/public/fonts` at build time and served
from the lesson server. Nothing is fetched from the internet.

## Pictures

`show_illustration` asks the Shopify AI Proxy for a drawn picture.

The lesson does not wait for it. The beat appears at once with the words that stand
in for the picture, the lesson keeps teaching, and the picture arrives — or fails —
seconds later. The page shows **Drawing the picture…**, then the picture, or then the
plain reason there is none.

The words are always on screen, above the picture, whatever happens to it.

Pictures are cached on disk by the content hash of the request, under
`~/.pi/agent/teach/lessons/<lesson-id>/images/`, so the same picture is never paid
for twice. The bytes are served from one address inside the token route, named by
that hash, so the name can never be turned into a path.

## Where the lesson is stored

```
~/.pi/agent/teach/lessons/<lesson-id>/
├── lesson.json           # topic, references, status, beat count. Replaced atomically.
├── beats.jsonl           # one beat per line. Only ever appended to.
├── quiz-attempts.jsonl   # how you answered each question
├── pause-dwells.jsonl    # how long you stayed on each pause
├── learner-signals.jsonl # every Simpler and Go deeper you pressed
├── references/           # the copies of the background you supplied
└── images/               # the pictures the lesson drew, by content hash
```

Every file that is replaced rather than appended to — the lesson record, a copied
reference, a drawn picture — goes through one writer in
`src/storage/atomic-file-writer.ts`: written to a neighbouring temporary name and
renamed into place, so a reader sees the old file or the whole new one and never
half of either.

Lesson metadata is small and is rewritten whole, so it is written to a temporary
file and renamed into place. A reader always sees a whole file. Beats are only ever
added, so they live in a log that can be replayed or streamed.

Two writers change the metadata while a lesson runs: the status and the beat count.
Every metadata write for one lesson is queued and runs on its own, so neither can
undo the other. A `lesson.json` that is not readable JSON raises a named
`InvalidLessonError` that says which lesson it is.

## Privacy

- Your topic, your background, your recordings and your answers go to **the Shopify
  AI Proxy and nowhere else**. There is no third-party service, no analytics, and no
  telemetry.
- The proxy credential never leaves the pi process. The lesson page asks the lesson
  server; only the lesson server calls the proxy.
- A recording is forwarded and dropped. It is never written to disk.
- What you draw on a diagram stays in your browser.
- Everything else — the lesson, its beats, its references, its pictures — is on your
  own machine, under `~/.pi/agent/teach/lessons`.
- Spoken audio is cached in memory for the life of the pi session, and dropped when
  the lesson is closed.

## Security

The lesson server is reachable by every other program on your machine, so:

- It binds `127.0.0.1` only. Never a network address.
- Every address carries an unpredictable token in its **path**: `/t/<token>/...`.
  The page, its assets, the lesson socket, and every small API address all live
  under that one route. Tokens are compared in constant time.
- **No cookie is ever set.** A cookie set on `127.0.0.1` is sent to every other
  program listening on `127.0.0.1`, whatever port it uses, because cookies do not
  separate ports. Keeping the token in the path keeps it inside the lesson's own
  addresses.
- The built page links to its assets with relative addresses, so the token is never
  written into any shipped file and the page never has to handle it.
- A caller that is not a browser may send the token as an `X-Teach-Token` header
  instead. The token is never read from a cookie and never from the query string.
- The `Origin` header must be the lesson page itself, and the `Host` header must be
  the loopback lesson server. That blocks both cross-site requests and domain name
  rebinding, on plain requests and on socket upgrades alike.
- No cross-origin access is ever granted. The server sends no
  `Access-Control-Allow-*` header at all.
- A content security policy of `default-src 'none'` is sent with every response,
  plus `nosniff`, `no-referrer`, and `frame-ancestors 'none'`. Scripts, styles and
  fonts are `'self'` only. `img-src` and `media-src` also allow `blob:`, which the
  diagram editor and the narration audio need; a `blob:` address is not a network
  address — only this page can make one, from bytes it already has. `worker-src`
  allows `'self'` and `blob:` for the editor's own worker. `connect-src` allows only
  this server, so the page cannot call another local port.
- Static files are resolved and then checked against the real public directory, so
  neither `..` segments, percent-encoded `..`, null bytes, nor symbolic links can
  reach a file outside it. An unknown address is a plain 404; the lesson page is
  never served in its place.
- The picture address only accepts a 64-character hex content hash, and the
  narration address only accepts a beat identifier. Neither can name a path.
- The one address that takes a body — the recording upload — is bounded before it is
  read: 8 MiB, 30 seconds, and a declared length over budget is refused before a
  single byte arrives.
- **The answer key never reaches the browser.** A quiz beat's `correctChoiceIds`,
  and the criteria a written answer is graded against, are dropped on the way out of
  the server. Grading happens server-side; what was right is told to you afterwards,
  once you have answered. There are tests that read the real socket bytes.
- Messages the page sends are handled one after another, never side by side, so
  Continue and an answer arriving together cannot both start a teaching turn.
- Setup input is validated: links must be `http`/`https`, GitHub references must be
  github.com addresses, and topic length, note length, and reference count are capped.

The token is in the browser address bar and so in your browser history. Anyone with
that address, on this machine, can watch the lesson until the pi session ends.

## The teaching session

A lesson runs on its own in-process Pi agent session, separate from your coding
session:

- Its tools are the teaching tools only — teach, define, show code, draw a diagram,
  ask for a picture, ask a question, grade, pause, end, and the two reference
  readers. It has no read, write, edit, or shell tool, so it cannot touch your files
  while it teaches.
- Resource discovery points at an empty scratch directory, so your own extensions,
  skills, and `AGENTS.md` files do not dilute the teaching prompt.
- Its conversation is kept in memory. The lesson itself is what gets saved.

`Stop now` on the page, and the `Space` key, abort the current teaching turn at once.
Every new turn, including Continue and an answer you send, announces itself, so Stop
and `Space` stay live and Continue is never offered twice for the same turn.

A teaching turn runs on its own, with nothing waiting on it. If it fails, the reason
is shown on the lesson page and in your pi session, and the lesson carries on being
usable. The failure never escapes as an unhandled rejection. The same is true of a
picture being drawn in the background: it is waited for when the lesson closes, so it
always has an owner.

The lesson's scratch directory is removed when the lesson's session is closed.

## Troubleshooting

**Nothing is spoken, and the page says voice is off.** There is no
`PI_PROXY_AUTH_HEADER` and no `PI_PROXY_API_KEY`. Start pi through `devx pi`.

**The page says the lesson server is gone.** The page reconnects on its own when the
socket drops — six attempts, waiting a little longer each time, up to eight seconds.
This message means all six found nothing, which is what a pi session that has ended
looks like. Run `/teach` again.

**The page says this browser cannot record audio.** Use Chrome, Firefox, or Safari
14.1 or later. The lesson still teaches in writing.

**Pressing Space does nothing and the browser asks about the microphone.** Allow the
microphone for `http://127.0.0.1:<port>`. The port changes each pi session, so the
permission is asked for again.

**The console shows many blocked font requests to `esm.sh`.** Expected, and harmless.
The diagram editor lists a public content delivery network as a last-resort source
for every font it knows. The content security policy refuses it, so no request leaves
your machine, and the fonts it actually uses are loaded from this server first.

**Chinese, Japanese or Korean text in a diagram is not in the handwriting font.** The
handwriting fallback for those scripts is 16 MB on its own, so it is left out of the
shipped page. Build with `TEACH_INCLUDE_CJK_DIAGRAM_FONT=1 npm run build:frontend` to
include it.

**A diagram shows only as a list of words.** The drawing surface did not load. The
notice above the list says why. The list is the same content and is always there.

**A picture never arrives.** The card says why in plain words. The alternative text
above it is what the picture was of, and the lesson is written not to depend on it.

**My change to the page did not show up.** Run `npm run build:frontend`. `/teach`
refuses to start with a page that no longer matches its source and says so.

## Working on it

The lesson page is shipped prebuilt in `dist/public`, so `/teach` never runs a
build.

The build writes `dist/public/.teach-build-stamp.json`, which holds a hash of every
page source file at build time. `/teach` hashes the source again and compares. That
is decided by **content**, not by modified time: a fresh clone gives every file the
same checkout time, so a time comparison would call a good build stale, or a stale
build fresh, purely by the order git happened to write the files.

The stamp covers `frontend/` and `shared/`. That is why every browser-safe pure
module lives in `shared/`, including the diagram compiler: a change to it is bundled
into the page, so it has to be able to mark the page stale.

```bash
export TEC_NPM_BIN_DIR=/nix/store/m3wj2l4bir43rj1swgjic7k6w8ppjm97-nodejs-24.15.0/bin  # only if npm is wrapped

npm run setup               # install, link, build, and check, in one go

npm run check:setup         # what is missing, and the command that fixes it
npm run build:frontend      # rebuild dist/public, copy the fonts, and restamp
npm run typecheck           # tsc --noEmit over server, shared, tests, and page
npm test                    # node --test over tests/
npm run verify              # typecheck then test

npm run typecheck --prefix frontend   # the page on its own, with the page's own tsconfig
node scripts/smoke-lesson-page.mjs    # serve a fixed lesson, to look at every beat kind
```

Build the page with `npm run build:frontend`, not `vite build` on its own. A build
with no stamp is reported as out of date, and `vite build` does not copy the diagram
editor's fonts.

`scripts/smoke-lesson-page.mjs` serves one fixed lesson with no model and no proxy
behind it, so every beat kind can be looked at, tabbed through, and read by a screen
reader. Pass `--picture-ready` to see the picture path with a stand-in image.

Tests use the Node test runner that ships with Node, and Node runs the TypeScript
directly. No test framework is installed, and no test ever calls a model, a provider,
GitHub, or any address at all.

The test runner is capped at four test files at a time. Left uncapped it starts one
child process per processor, and each of those loads and type-strips the whole module
graph; on a large machine that is enough concurrent processes and open files to
exhaust the process table and fail runs for reasons that have nothing to do with the
code under test.

## Layout

```
shared/          Types and rules both the server and the page use
  beat.ts        The beat domain: nine kinds, all implemented
  browser-beat.ts     The beat with the quiz answer key removed
  lesson.ts      Lesson metadata and references
  lesson-route.ts     The /t/<token>/ address shape, used by both sides
  protocol.ts    What the server and the page say to each other
  client-message.ts   Validation of everything the page sends
  github-hosts.ts     The three hosts that count as GitHub
  learner-history.ts  Quiz attempts, pause dwells, and what the learner asked for
  narration-hotkey.ts The Space key contract, as a pure state machine
  setup-progress.ts   Whether the setup form is waiting, as a pure state machine
  visuals/       The diagram value object, layout, compiler, outline, and
                 workspace state. Pure, so the page bundles them and the build
                 fingerprint covers them.

src/
  index.ts       The extension: the /teach command and session cleanup
  teach-lesson-host.ts  Ties the pieces together and owns their lifetime
  browser-opener.ts     Opens the page without going through a shell
  frontend-build.ts     The build freshness check and its stamp
  setup-prerequisites.ts  What a clone still needs before pi install
  latest-notifier.ts    Reports failures to the newest /teach run, not the first
  domain/        The teaching system prompt and what the tools say back
  proxy/         The one Shopify AI Proxy credential, read for voice and pictures
  references/    Copying, storing, and reading back the learner's background
  services/      Lesson repository, beat publisher, lesson conductor, the tools
  server/        The web server, token, request guard, static files, socket
  storage/       The one atomic file writer every repository replaces files with
  visuals/       The image provider, the image store, and the illustration service
  voice/         The Shopify AI Proxy speech and transcription path

frontend/        The lesson page: React, Vite, TypeScript
  src/lesson-connection.ts  The socket, and the bounded reconnect when it drops
  src/visuals/   The diagram workspace, the Excalidraw adapter, the outline
  src/voice/     The voice session, the recorder, the player, the transport
dist/public/     The built page and the diagram fonts. Committed on purpose.
tests/           One test file per behaviour area
```
