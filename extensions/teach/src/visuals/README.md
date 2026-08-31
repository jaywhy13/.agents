# Visual learning modules

> **These modules are wired into `/teach`.** `diagram` and `image` are full beat
> kinds, `@excalidraw/excalidraw` is a frontend dependency with its fonts copied into
> `dist/public/fonts`, and the picture path runs through the Shopify AI Proxy with a
> disk cache and an authenticated byte route. The seven browser-safe modules, plus
> `illustration-state.ts` and a new `illustration-request.ts`, now live in
> `shared/visuals/`; only the image client, the image store and the illustration
> service are still here. The integration steps are kept as a record; see the package
> README for what a learner sees.

Everything needed for the two reserved beat kinds that draw something: `diagram`
and `image`. Nothing here is wired into the lesson yet — every module is
self-contained, tested, and waiting for an integrator. This file is the handoff.

## What is here

### The diagram side

A lesson describes **what a diagram means**; this code decides **what it looks
like**. That split is the whole design: the teaching model never chooses a colour
or a coordinate, so it cannot draw something ugly, and the same description always
produces the same picture.

| File | What it is |
|---|---|
| `graph-diagram-spec.ts` | The value object: nodes, edges, groups, emphasis. Every limit and every check. |
| `diagram-spec-fields.ts` | Field-level checks and `InvalidGraphDiagramError`. |
| `graph-diagram-layout.ts` | Where each box goes. Longest-path ranking, pure. |
| `excalidraw-skeleton.ts` | The element shape Excalidraw's builder takes, written out locally. |
| `graph-diagram-compiler.ts` | Spec → scene. Pure and deterministic. |
| `diagram-workspace-state.ts` | Keeps the taught diagram and the learner's edits apart. |
| `diagram-outline.ts` | The same diagram as sentences, for screen readers and as a fallback. |

### The image side

| File | What it is |
|---|---|
| `shopify-ai-proxy-image-client.ts` | The only image provider. Injected `fetch`, validated input, capped reply. |
| `lesson-image-repository.ts` | Images on disk under the lesson they belong to. |
| `illustration-state.ts` | `generating` / `ready` / `failed`. |
| `illustration-service.ts` | Publishes state, caches by content hash, never throws. |

### The page

| File | What it is |
|---|---|
| `frontend/src/visuals/DiagramWorkspace.tsx` | Shows one diagram and lets the learner change their copy. |
| `frontend/src/visuals/DiagramOutlineView.tsx` | The diagram in words. |
| `frontend/src/visuals/diagram-editor-adapter.ts` | The seam where Excalidraw would begin. |

## Three decisions worth knowing

**The compiler emits skeletons, not finished elements.** Excalidraw's supported way
to build a scene from code is `convertToExcalidrawElements(skeletons)`. Targeting
its input rather than its output means this package never has to reproduce
Excalidraw's internal element format, and every arrow can name the two shapes it
joins so a learner can drag a box and keep the arrow attached. The conversion call
belongs on the page, inside the adapter.

**The taught diagram is never overwritten.** `DiagramWorkspaceState` holds the
generated scene and the learner's scene side by side. That is what makes "Reset"
truthful and what stops an edit from rewriting what the lesson said.

**An illustration publishes rather than returns.** Generating takes seconds and can
fail, so the page is told `generating` at once and `ready` or `failed` later. A
failure is a state with a plain reason, never an exception — a missing picture is a
smaller problem than a broken lesson.

## Dependencies this needs

**One new package, at integration time only: `@excalidraw/excalidraw`, in
`frontend/package.json`.**

Nothing in `src/visuals/**` needs it. The spec, layout, compiler, workspace state
and all their tests build and run today without it. It is needed only to draw the
scene on the page.

Until it is added, `DiagramWorkspace` takes `editor={null}` and shows the diagram in
words. That path is real, tested, and accessible — it is the fallback for a failed
editor load, not a stub.

No new server dependency. The image client uses `fetch` and `node:buffer`, both
already available.

## Integration steps

1. **Rebuild the page.** Adding files under `frontend/src/` changes the build
   fingerprint, so `tests/built-lesson-page.test.ts` currently reports the shipped
   page as stale. This is the check working correctly. Run:

   ```bash
   npm run build:frontend
   ```

   It was deliberately not run here: `dist/public` is a shared committed artefact,
   and rebuilding it while other work is in flight would bake in a half-integrated
   page. Run it once, after all page changes have landed.

2. **Move the browser-safe modules to `shared/visuals/`.** These seven files are
   pure — no node built-ins — and are imported by the page today through
   `../../../src/visuals/…`:

   `graph-diagram-spec.ts`, `diagram-spec-fields.ts`, `graph-diagram-layout.ts`,
   `excalidraw-skeleton.ts`, `graph-diagram-compiler.ts`,
   `diagram-workspace-state.ts`, `diagram-outline.ts`

   They live under `src/` only because this work was scoped to new files in
   `src/visuals/**`. Moving them matters for a reason beyond tidiness: **the build
   fingerprint covers `frontend/` and `shared/`, not `src/`.** A change to the
   compiler is bundled into the page but would not mark the built page stale. Move
   them and that hole closes.

   The four modules that must stay under `src/` use node built-ins and are
   server-only: the image client, the image repository, the illustration service,
   and `illustration-state.ts`.

3. **Widen the beat union.** `shared/beat.ts` reserves `diagram` and `image` and
   raises `BeatKindNotImplementedError` for both. Add a `DiagramBeat` carrying a
   `GraphDiagramSpec`, and an `ImageBeat` carrying an `IllustrationRequest` and the
   published `IllustrationState`. Replace the two `throw` branches in `parseBeat`
   with parse branches that delegate to `parseGraphDiagramSpec` and the illustration
   request check.

4. **Wire the beat views.** Add `diagram` and `image` branches to
   `frontend/src/beats/BeatView.tsx`, pointing at `DiagramWorkspace` and an image
   view. `DiagramWorkspace` needs no props beyond `spec` and `editor`.

5. **Serve the image bytes.** A ready illustration is a file path on the learner's
   machine. Add one route under the existing `/t/<token>/` prefix that reads it
   through `LessonImageRepository.readBytes`. Keep it inside the token route so it
   inherits the existing origin, host and content-security-policy checks, and send
   `Content-Type: image/png` with `nosniff`.

6. **Construct the services.** In `teach-lesson-host.ts`:

   ```ts
   const imageClient = new ShopifyAiProxyImageClient({
     fetchImplementation: fetch,
     // The same credential the voice path reads, so voice and pictures are never
     // on for one environment and off for the other.
     authorizationHeaderValue: readProxyCredential(process.env) ?? "",
   });
   const illustrationService = new IllustrationService({
     imageClient,
     imageRepository: new LessonImageRepository(lessonsDirectory),
     publishState: (state) => beatBroadcaster.publishIllustrationState(state),
     now: () => new Date(),
   });
   ```

   `ShopifyAiProxyImageClient` throws at construction when the credential is blank, so
   decide there whether a lesson without the proxy key offers no pictures or fails
   loudly. The key is set by `devx pi`.

7. **Add the teaching tools.** `teach_diagram` and `teach_illustration`, alongside
   `teach_concept`. The diagram tool's schema is `GraphDiagramSpec`; reject with the
   `InvalidGraphDiagramError` message so the model can correct itself.

8. **Add the page styles.** The markup uses `diagram-card`,
   `diagram-card-header`, `diagram-reset-button`, `diagram-canvas`,
   `diagram-editor-missing`, `diagram-outline`, `diagram-outline-title`,
   `diagram-outline-heading`, `diagram-outline-list`, `diagram-outline-group`,
   `diagram-outline-emphasized`. All are unstyled today and degrade to plain
   readable markup.

9. **Write the Excalidraw adapter.** One file implementing
   `DiagramEditorComponent`. A working sketch is in the comment at the top of
   `frontend/src/visuals/diagram-editor-adapter.ts`.

## Tests

```bash
node --test "tests/visuals/**/*.test.ts"    # 116 tests
```

No test reaches the network. The image client takes `fetch` as a constructor
argument and every test passes `FakeImageGenerationProxy`, which builds real
`Response` objects so the client's own status handling, body reading and byte
budget are exercised for real rather than mocked away.
