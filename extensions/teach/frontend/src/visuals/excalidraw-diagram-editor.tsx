/**
 * The Excalidraw drawing surface, as one `DiagramEditorComponent`.
 *
 * This is the only file in the package that imports `@excalidraw/excalidraw`.
 * Everything up to it — the spec, the layout, the compiler, the workspace state —
 * is plain data and builds without it, which is why the diagram beat has a real,
 * readable fallback rather than a broken one.
 *
 * Two things are decided here and nowhere else:
 *
 * - **Where the fonts come from.** Excalidraw loads its handwriting fonts at
 *   runtime, from an address it works out the moment its bundle is evaluated. That
 *   is too early for this file, so `excalidraw-asset-path.ts` is imported first by
 *   `main.tsx` instead. See that file for why.
 * - **Who converts the skeletons.** A generated diagram arrives as skeletons and is
 *   converted here, by Excalidraw's own `convertToExcalidrawElements`. A diagram the
 *   learner has already edited arrives as real elements and must not be converted
 *   again. The two are separate branches so neither can be mistaken for the other.
 */

// Before the editor's own bundle, so the font addresses it works out point here.
import "./excalidraw-asset-path.ts";

import "@excalidraw/excalidraw/index.css";

import {
  convertToExcalidrawElements,
  Excalidraw,
  getSceneVersion,
} from "@excalidraw/excalidraw";
import { useCallback, useMemo, useRef } from "react";

import type { DiagramEditorComponent, DiagramEditorSource } from "./diagram-editor-adapter.ts";

/**
 * The two things this file reads out of an Excalidraw change, named locally.
 *
 * Excalidraw's own element and application state types are very large and reach
 * across several of its packages. Naming only what is used keeps this file honest
 * about how little of Excalidraw the lesson depends on, and keeps the learner's
 * scene an opaque list of elements, which is what the workspace state expects.
 */
interface ChangedScene {
  readonly elements: readonly unknown[];
  readonly viewBackgroundColor: string;
}

export const ExcalidrawDiagramEditor: DiagramEditorComponent = ({
  source,
  onSceneChanged,
  ariaLabel,
}) => {
  const initialData = useMemo(() => initialDataFor(source), [source]);
  /**
   * The version of the scene as it was handed over. Excalidraw reports a change as
   * soon as it starts, before the learner has touched anything, so a report that
   * matches this is not an edit. Without this the "Reset" button would appear on a
   * diagram nobody had changed, and an untouched scene would be written to storage.
   */
  const versionAtStart = useRef<number | null>(null);

  /**
   * Held still on purpose. Excalidraw re-renders when a prop changes identity, and
   * every render of Excalidraw reports a change: a fresh handler here would be an
   * endless loop rather than a wasted render.
   */
  const handleChange = useCallback(
    (elements: readonly unknown[], appState: { viewBackgroundColor: string }) => {
      const version = getSceneVersion(elements as Parameters<typeof getSceneVersion>[0]);
      if (versionAtStart.current === null) {
        versionAtStart.current = version;
        return;
      }
      if (version === versionAtStart.current) {
        return;
      }

      const changed: ChangedScene = {
        elements,
        viewBackgroundColor: appState.viewBackgroundColor,
      };
      onSceneChanged({
        elements: [...changed.elements],
        appState: { viewBackgroundColor: changed.viewBackgroundColor },
        savedAt: new Date().toISOString(),
      });
    },
    [onSceneChanged],
  );

  /**
   * Zooms the whole diagram into view once the editor is ready.
   *
   * Two details matter. `scrollToContent` on its own only scrolls, so a diagram wider
   * than the card would start part way across it and the learner would have to hunt
   * for the rest. And the editor hands its interface over before the canvas has been
   * measured, so the fit is left until after the next frame — fitting to a canvas of
   * no size does nothing at all.
   */
  const fitTheWholeDiagram = useCallback(
    (api: { scrollToContent: (target?: never, opts?: never) => void }) => {
      requestAnimationFrame(() => {
        api.scrollToContent(undefined, {
          fitToViewport: true,
          viewportZoomFactor: 0.85,
        } as never);
      });
    },
    [],
  );

  return (
    <div className="diagram-editor-surface" role="group" aria-label={ariaLabel}>
      <Excalidraw
        initialData={initialData}
        onChange={handleChange as never}
        excalidrawAPI={fitTheWholeDiagram as never}
        UIOptions={LESSON_EDITOR_OPTIONS}
      />
    </div>
  );
};

/**
 * Held outside the component, so its identity never changes. A lesson is not a file
 * manager: loading a scene from disk, exporting, or changing the theme would take the
 * learner out of the lesson.
 */
const LESSON_EDITOR_OPTIONS = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    export: false as const,
    saveAsImage: true,
    toggleTheme: false,
    changeViewBackgroundColor: false,
  },
};

/** One explicit branch per origin, so a learner scene is never converted twice. */
function initialDataFor(source: DiagramEditorSource) {
  switch (source.origin) {
    case "generated":
      return {
        elements: convertToExcalidrawElements([
          ...source.skeletonElements,
        ] as Parameters<typeof convertToExcalidrawElements>[0]),
      };
    case "learner_edited":
      return {
        elements: source.scene.elements as Parameters<
          typeof convertToExcalidrawElements
        >[0] as never,
        appState: source.scene.appState,
      };
  }
}
