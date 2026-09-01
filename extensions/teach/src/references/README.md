# Reference ingestion

> **This module is wired into `/teach`.** The lesson copies the learner's
> background at setup, the teaching prompt carries labels only, and the agent reads
> it through `list_lesson_references` and `read_lesson_reference`. The integration
> steps below are kept as a record of how it was joined up; see the package README
> for what a learner sees. Two things below are now out of date: the browser-safe
> parts of the visual modules have moved to `shared/visuals/`, and `package.json`
> does now name `@excalidraw/excalidraw` — for diagrams, not for references.

Turns what a learner gives a lesson — a link, a GitHub link, or pasted text —
into a **local copy** the lesson can quote and re-read later.

GitHub means exactly `github.com`, `www.github.com` and `gist.github.com`, from the
one list in `shared/github-hosts.ts`. `docs.github.com` is an ordinary web page and
is copied as one.

## What it does

1. **Normalize.** The raw input becomes one of three value objects: `UrlReference`,
   `GithubReference` (with the exact thing the link points at), `PastedTextReference`.
2. **Copy.** A client per kind fetches the material and returns `ReferenceContent`.
3. **Store.** The copy is written under the lesson, on the learner's own machine.
   The remote address is kept only as a note of where the copy came from.
4. **Read back in windows.** A reader asks for a line range and gets at most
   2000 lines or 50 KB, plus the line number the next read should start at. Full
   references never have to enter a prompt.

## Files

| File | What it holds |
| --- | --- |
| `reference.ts` | Value objects, `InvalidReferenceError`, `ReferenceCopyError` |
| `reference-normalizer.ts` | Raw input to value object; scheme, credential, label checks |
| `github-url.ts` | GitHub link to repository / issue / pull request / file / gist target |
| `ip-address-rules.ts` | Which resolved addresses may be contacted |
| `host-address-resolver.ts` | `HostAddressResolver` interface, system implementation |
| `request-target-guard.ts` | All checks a request must pass, first address and every redirect |
| `http-transport.ts` | `HttpTransport` interface, Node implementation pinned to approved addresses |
| `safe-http-client.ts` | Redirects, size limit, time limits, content type checks |
| `html-text-extractor.ts` | `HtmlTextExtractor` interface, dependency-free implementation |
| `url-reference-client.ts` | Copies a plain web page |
| `github-reference-client.ts` | Copies a GitHub target through the API |
| `github-api-runner.ts` | `gh api` runner, public HTTP runner, and the probe that chooses between them |
| `pasted-text-reference-client.ts` | Copies pasted text |
| `reference-repository.ts` | `ReferenceRepository` interface, filesystem implementation |
| `reference-excerpt.ts` | The 2000-line / 50 KB windowed read |
| `reference-ingestion-service.ts` | `ReferenceIngestionService`: `copy`, `copyAll` |
| `reference-library-service.ts` | `ReferenceLibraryService`: `list`, `get`, `readExcerpt` |
| `index.ts` | Public exports and `createReferenceModule` |

## On disk

```
<lessonsDirectory>/<lessonId>/references/<referenceId>.json   metadata
<lessonsDirectory>/<lessonId>/references/<referenceId>.txt    the copy itself
```

Both files are written to a temporary name and renamed into place, so a reader
never sees a half-written file. This is the same lessons directory
`LessonRepository` already uses, one level deeper.

## Request safety

Every fetch, including every redirect hop, must pass all of these:

- http or https only
- no username or password in the address
- host name is not `localhost`, `*.local`, `*.internal`, `metadata.google.internal`,
  `metadata.goog`, or `instance-data`
- the name is resolved, and **every** returned address must be public — loopback,
  private, carrier-grade, link-local, cloud metadata, multicast, unspecified and
  reserved ranges are all refused, including when hidden inside an IPv4-mapped or
  NAT64 IPv6 address
- the socket is opened to the approved address, not by resolving the name a second
  time, so the name cannot change its answer between the check and the connection
- at most 5 redirects, 2 MB per response, 10 s per request, 30 s in total
- the content type must be text a lesson can read

The GitHub client never sees link text. The link is parsed into named parts first,
and `gh` is started with `execFile` and an argument array — there is no shell.

`GithubCommandOrPublicApiRunner` decides which of the two reads GitHub. It asks
`gh auth status` once per pi session: the question is not whether `gh` is installed
but whether it can read GitHub as this learner, because an installed but signed-out
`gh` refuses every read. When the answer is no — not installed, signed out, or too
slow — references are read through the public GitHub API over the same guarded HTTP
client, so the address rules, the size limit and the time limits all still apply.

## Tests

`tests/references/**`, 132 tests, all offline.

```
cd extensions/teach && node --test "tests/references/**/*.test.ts"
```

Fakes live in `tests/references/support/`: `FakeHostAddressResolver`,
`FakeHttpTransport`, `FakeGithubApiRunner`, plus factories and an
`ingestionTestBench` that uses a real temporary directory.

`http-transport.test.ts` uses a real loopback server to prove address pinning, the
size limit and the time limit actually work. It never leaves the machine.

## Dependency needs — integration handoff

**None are required.** The module runs on Node built-ins only.

One optional improvement, for the integrator to decide on:

- `TagStrippingHtmlTextExtractor` keeps navigation text and boilerplate that a real
  readability library would strip. Swapping in `@mozilla/readability` with `linkedom`
  would give cleaner page copies. It is behind the `HtmlTextExtractor` interface, so
  it is a new file plus one argument to `createReferenceModule` — nothing else
  changes. **This module did not edit `package.json`.**

## Integration steps

1. **Nothing to add to `package.json`.** The existing `test` script glob
   (`tests/**/*.test.ts`) already picks up `tests/references/**`.

2. **Build the module** wherever `LessonRepository` is built, with the same
   lessons directory:

   ```ts
   import { createReferenceModule } from "./references/index.ts";

   const { referenceIngestionService, referenceLibraryService } = createReferenceModule({
     lessonsDirectory,
     preferGithubCommand: true, // the learner's own `gh` when it can read GitHub,
                                // the guarded public API when it cannot
   });
   ```

3. **Copy the references at setup**, after the lesson metadata exists and before
   teaching starts. `LessonSetup.references` already matches `ReferenceInput`:

   ```ts
   const outcomes = await referenceIngestionService.copyAll(lessonId, setup.references);
   ```

   `copyAll` never throws for a bad reference. Each outcome is `copied` or `failed`
   with a `label` and a `reason` — show the failures to the learner through the
   setup progress messages and let the lesson start anyway.

4. **Add two teaching tools** so the lesson can inspect its evidence without any of
   it entering the system prompt. In `src/services/teaching-tools.ts`, add the names
   to `TEACHING_TOOL_NAMES`, add the methods to `TeachingToolHandlers`, and have the
   handler implementation call:

   - `list_lesson_references` → `referenceLibraryService.list(lessonId)`
   - `read_lesson_reference` → `referenceLibraryService.readExcerpt(lessonId, referenceId, { offset, limit })`

   Return `nextLineNumber` in the tool result text so the model knows how to
   continue, and `totalLineCount` so it knows how much is left.

5. **The system prompt should list references by label and id only** — never their
   content. That is the whole point of step 4.

6. **Deleting a lesson** should also remove its references; they are inside the
   lesson directory, so an existing recursive delete already covers it.

## Known limits

- Only the primary GitHub resource is copied. Issue and pull request comments,
  diffs and file trees are not. A gist is copied as its files joined into one
  document, each under its own name.
- One reference line longer than 50 KB is cut at the limit; the rest of that single
  line cannot be reached by a later read.
- `copyAll` copies one reference after another, not side by side.
