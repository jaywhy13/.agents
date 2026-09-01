/**
 * The shape of what the compiler hands to Excalidraw, written out here rather than
 * imported.
 *
 * Excalidraw's supported way to build a scene from code is
 * `convertToExcalidrawElements(skeletons)`: you describe elements loosely and it
 * fills in the many fields a real element needs. These types are that loose
 * description, named locally so the compiler, its tests, and the lesson server can
 * be built and run without the Excalidraw package present.
 *
 * The package is still needed at the point the scene is drawn. See
 * `frontend/src/visuals/diagram-editor-adapter.ts` for that boundary.
 *
 * This module is pure: no node built-ins, so the lesson page can use it too.
 */

export type SkeletonShapeType = "rectangle" | "ellipse" | "diamond";

/** Text Excalidraw binds into the shape it is given with, and re-wraps on edit. */
export interface SkeletonBoundLabel {
  readonly text: string;
  readonly fontSize: number;
  readonly strokeColor: string;
}

interface SkeletonElementBase {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly strokeColor: string;
  readonly strokeWidth: number;
  /**
   * Excalidraw normally picks this at random and uses it to make its hand-drawn
   * lines wobble. A compiled diagram sets it from the element id, so the same spec
   * draws the same picture every time.
   */
  readonly seed: number;
  readonly groupIds: readonly string[];
}

export interface SkeletonShape extends SkeletonElementBase {
  readonly type: SkeletonShapeType;
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: string;
  readonly fillStyle: "solid" | "hachure" | "cross-hatch";
  readonly roughness: number;
  readonly label: SkeletonBoundLabel | null;
}

/**
 * An arrow given `start` and `end` element ids is bound to those elements, so the
 * learner can drag a box and the arrow follows. That binding is why the compiler
 * targets skeletons rather than building finished elements itself.
 */
export interface SkeletonArrow extends SkeletonElementBase {
  readonly type: "arrow";
  readonly width: number;
  readonly height: number;
  readonly start: { readonly id: string };
  readonly end: { readonly id: string };
  readonly startArrowhead: null;
  readonly endArrowhead: "arrow" | null;
  readonly label: SkeletonBoundLabel | null;
}

export interface SkeletonText extends SkeletonElementBase {
  readonly type: "text";
  readonly text: string;
  readonly fontSize: number;
}

export type ExcalidrawElementSkeleton = SkeletonShape | SkeletonArrow | SkeletonText;

export const EXCALIDRAW_SCENE_TYPE = "excalidraw";
export const EXCALIDRAW_SCENE_VERSION = 2;
export const COMPILED_SCENE_SOURCE = "pi-teach:graph-diagram-compiler";

/**
 * A compiled diagram, ready to be turned into a real Excalidraw scene by
 * `convertToExcalidrawElements`. This is the *taught* drawing and is never changed
 * once compiled; anything the learner does to it is kept separately as a
 * `LearnerDiagramScene`.
 */
export interface DiagramSceneDraft {
  readonly type: typeof EXCALIDRAW_SCENE_TYPE;
  readonly version: typeof EXCALIDRAW_SCENE_VERSION;
  readonly source: typeof COMPILED_SCENE_SOURCE;
  readonly diagramId: string;
  readonly skeletonElements: readonly ExcalidrawElementSkeleton[];
  readonly appState: {
    readonly viewBackgroundColor: string;
    readonly gridSize: null;
  };
}

/**
 * Excalidraw makes each element wobble from a seed. Deriving the seed from the
 * element id, rather than from a random number, is what makes a compiled diagram
 * reproducible: the same spec gives byte-for-byte the same scene.
 */
export function seedFromElementId(elementId: string): number {
  const FNV_OFFSET_BASIS = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;

  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < elementId.length; index += 1) {
    hash ^= elementId.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  // Excalidraw seeds are non-negative 31-bit integers.
  return hash >>> 1;
}
