/**
 * The seam between the diagram workspace and Excalidraw.
 *
 * Excalidraw is not installed in this package. Everything up to this point — the
 * spec, the layout, the compiler, the workspace state — is written against plain
 * data and builds and tests without it. This file is where the drawing itself would
 * begin, so this is where the dependency stops.
 *
 * The workspace takes an editor as a prop. Give it one and the learner can draw;
 * give it nothing and the workspace shows the diagram in words instead. That way
 * the visual beats ship, are usable, and are readable, before the package lands —
 * and adding the package later is one small file, not a rewrite.
 *
 * The adapter to write once `@excalidraw/excalidraw` is a dependency:
 *
 * ```tsx
 * import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
 *
 * export const ExcalidrawDiagramEditor: DiagramEditorComponent = ({ source, onSceneChanged }) => {
 *   const elements = useMemo(
 *     () =>
 *       source.origin === "generated"
 *         ? convertToExcalidrawElements([...source.skeletonElements])
 *         : source.scene.elements,
 *     [source],
 *   );
 *   return (
 *     <Excalidraw
 *       initialData={{ elements, appState: initialAppStateFor(source), scrollToContent: true }}
 *       onChange={(changedElements, appState) =>
 *         onSceneChanged({
 *           elements: changedElements,
 *           appState: { viewBackgroundColor: appState.viewBackgroundColor },
 *           savedAt: new Date().toISOString(),
 *         })
 *       }
 *     />
 *   );
 * };
 * ```
 *
 * Note which side calls `convertToExcalidrawElements`. The compiler emits the
 * skeletons that function takes and never builds finished elements itself, so
 * Excalidraw stays responsible for its own element format.
 */

import type { ReactElement } from "react";

import type { ExcalidrawElementSkeleton } from "../../../shared/visuals/excalidraw-skeleton.ts";
import type { LearnerDiagramScene } from "../../../shared/visuals/diagram-workspace-state.ts";

/**
 * What the editor is asked to draw. A generated diagram arrives as skeletons that
 * still need converting; a diagram the learner has already edited arrives as
 * Excalidraw's own elements and must not be converted again. The two are separate
 * branches so neither can be mistaken for the other.
 */
export type DiagramEditorSource =
  | { readonly origin: "generated"; readonly skeletonElements: readonly ExcalidrawElementSkeleton[] }
  | { readonly origin: "learner_edited"; readonly scene: LearnerDiagramScene };

export interface DiagramEditorProps {
  readonly source: DiagramEditorSource;
  /**
   * Called on every change the learner makes. The workspace keeps the result apart
   * from the generated scene, so this can never overwrite what was taught.
   */
  readonly onSceneChanged: (scene: LearnerDiagramScene) => void;
  readonly ariaLabel: string;
}

export type DiagramEditorComponent = (props: DiagramEditorProps) => ReactElement | null;
