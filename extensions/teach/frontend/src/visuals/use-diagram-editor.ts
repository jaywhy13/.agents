import { useEffect, useState } from "react";

import type { DiagramEditorComponent } from "./diagram-editor-adapter.ts";

/**
 * Loads the drawing surface once, the first time a lesson draws a diagram.
 *
 * The editor is by far the largest thing on this page, and most lessons show their
 * first beat before any diagram. Loading it on demand keeps the lesson quick to
 * appear, and means a load that fails costs the learner the drawing rather than the
 * lesson: the workspace then shows the diagram in words, which is the same path a
 * screen reader takes and is always there beside the drawing anyway.
 *
 * The promise is shared, so several diagram beats on screen at once load it once.
 */
export type DiagramEditorLoad =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly editor: DiagramEditorComponent }
  | { readonly status: "unavailable"; readonly reason: string };

let sharedLoad: Promise<DiagramEditorComponent> | null = null;

export function loadDiagramEditor(): Promise<DiagramEditorComponent> {
  sharedLoad ??= import("./excalidraw-diagram-editor.tsx").then(
    (module) => module.ExcalidrawDiagramEditor,
  );
  return sharedLoad;
}

export function useDiagramEditor(): DiagramEditorLoad {
  const [load, setLoad] = useState<DiagramEditorLoad>({ status: "loading" });

  useEffect(() => {
    let stillMounted = true;
    loadDiagramEditor().then(
      (editor) => {
        if (stillMounted) {
          setLoad({ status: "ready", editor });
        }
      },
      (cause: unknown) => {
        if (stillMounted) {
          setLoad({ status: "unavailable", reason: messageFor(cause) });
        }
      },
    );
    return () => {
      stillMounted = false;
    };
  }, []);

  return load;
}

function messageFor(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
