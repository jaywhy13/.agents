/**
 * Keeps the taught diagram and the learner's version of it apart.
 *
 * The compiled scene is what the lesson said. The learner may move boxes, add a
 * note, or draw their own arrow, and that is the point of an editable diagram — but
 * it must never overwrite what was taught. So the two are held side by side: the
 * generated scene never changes, and the learner's edits are a separate value that
 * can be discarded to get the taught diagram back.
 *
 * A workspace is for one revision of one diagram. When the lesson draws the same
 * diagram again with more on it, that is a new revision and so a new workspace, and
 * the edits made to the last one belong to the last one. Nothing here carries edits
 * from one revision to the next: the whole point of a new taught revision is that
 * the learner sees what was just taught.
 *
 * The state transitions are pure functions, so they can be tested without a browser
 * and reused by the lesson server if edits are ever saved.
 *
 * This module is pure: no node built-ins, so the lesson page can use it too.
 */

import type { DiagramSceneDraft } from "./excalidraw-skeleton.ts";
import { compileGraphDiagramToScene } from "./graph-diagram-compiler.ts";
import { asDiagramRecord, InvalidGraphDiagramError } from "./diagram-spec-fields.ts";
import type { GraphDiagramSpec } from "./graph-diagram-spec.ts";

/**
 * A scene the learner has changed, as the editor handed it back. The elements are
 * Excalidraw's own, so they are held as opaque records rather than re-typed here:
 * this side neither reads nor reasons about their internals.
 */
export interface LearnerDiagramScene {
  readonly elements: readonly unknown[];
  readonly appState: Readonly<Record<string, unknown>>;
  readonly savedAt: string;
}

export type DisplayedDiagramScene =
  | { readonly origin: "generated"; readonly scene: DiagramSceneDraft }
  | { readonly origin: "learner_edited"; readonly scene: LearnerDiagramScene };

export interface DiagramWorkspaceState {
  readonly diagramId: string;
  /** Which taught drawing of that diagram this workspace holds. */
  readonly revision: number;
  /** What the lesson taught. Never replaced while the workspace is open. */
  readonly generatedScene: DiagramSceneDraft;
  readonly learnerScene: LearnerDiagramScene | null;
}

/**
 * A learner scene comes from the page, so it is checked at this boundary. The cap
 * is on element count rather than on what the elements contain, because a learner
 * may legitimately draw anything Excalidraw can draw.
 */
export const MOST_LEARNER_SCENE_ELEMENTS = 2_000;

export function startDiagramWorkspace(spec: GraphDiagramSpec): DiagramWorkspaceState {
  return {
    diagramId: spec.diagramId,
    revision: spec.revision,
    generatedScene: compileGraphDiagramToScene(spec),
    learnerScene: null,
  };
}

/**
 * True when `spec` is a later drawing of the diagram the workspace is holding. The
 * page starts a new workspace rather than editing this one, so the learner sees what
 * was just taught.
 */
export function isNewerRevisionOf(
  state: DiagramWorkspaceState,
  spec: GraphDiagramSpec,
): boolean {
  return spec.diagramId === state.diagramId && spec.revision > state.revision;
}

export function recordLearnerEdit(
  state: DiagramWorkspaceState,
  learnerScene: LearnerDiagramScene,
): DiagramWorkspaceState {
  return { ...state, learnerScene };
}

export function discardLearnerEdits(state: DiagramWorkspaceState): DiagramWorkspaceState {
  return { ...state, learnerScene: null };
}

export function hasLearnerEdits(state: DiagramWorkspaceState): boolean {
  return state.learnerScene !== null;
}

/**
 * Which scene the page should draw. Returning the origin alongside the scene means
 * the caller must say which of the two shapes it is handling, rather than guessing
 * from the fields present.
 */
export function displayedScene(state: DiagramWorkspaceState): DisplayedDiagramScene {
  if (state.learnerScene === null) {
    return { origin: "generated", scene: state.generatedScene };
  }
  return { origin: "learner_edited", scene: state.learnerScene };
}

export function parseLearnerDiagramScene(candidate: unknown): LearnerDiagramScene {
  const record = asDiagramRecord(candidate, "learner diagram scene");

  const elements = record["elements"];
  if (!Array.isArray(elements)) {
    throw new InvalidGraphDiagramError("Field elements must be a list.");
  }
  if (elements.length > MOST_LEARNER_SCENE_ELEMENTS) {
    throw new InvalidGraphDiagramError(
      `Field elements must hold at most ${MOST_LEARNER_SCENE_ELEMENTS} elements, received ${elements.length}.`,
    );
  }

  const savedAt = record["savedAt"];
  if (typeof savedAt !== "string" || Number.isNaN(Date.parse(savedAt))) {
    throw new InvalidGraphDiagramError("Field savedAt must be an ISO 8601 timestamp.");
  }

  return {
    elements,
    appState: asDiagramRecord(record["appState"] ?? {}, "appState"),
    savedAt,
  };
}
