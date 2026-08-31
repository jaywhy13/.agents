/**
 * Tells the diagram editor to fetch its fonts from this lesson, and nothing else.
 *
 * Excalidraw works out every font address the moment its bundle is evaluated, so
 * this has to have run before that happens. It is a module of its own, imported
 * first by `main.tsx`, because an import inside the editor's own file would be too
 * late: the editor's imports are evaluated before its body.
 *
 * The address is absolute on purpose. Excalidraw resolves a base that starts with
 * `./` or `/` against the origin, which would drop the `/t/<token>/` route the page
 * is served under and ask for the fonts at an address the lesson server refuses.
 *
 * Left unset, Excalidraw falls back to a public content delivery network. The
 * content security policy allows fonts from `'self'` only, so that fallback is
 * refused by the browser before any request leaves the machine — but a lesson with
 * no handwriting fonts is a worse lesson, so the point is to make the local files
 * the ones it finds.
 */

declare global {
  // eslint-disable-next-line no-var
  var EXCALIDRAW_ASSET_PATH: string | string[] | undefined;
}

export function pointDiagramEditorAtOurOwnAssets(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.EXCALIDRAW_ASSET_PATH = new URL("./", window.location.href).toString();
}

pointDiagramEditorAtOurOwnAssets();
