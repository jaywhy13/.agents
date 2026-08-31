import { memo, useCallback, useMemo, useRef, useState } from "react";

import { describeDiagramForReading } from "../../../shared/visuals/diagram-outline.ts";
import type { LearnerDiagramScene } from "../../../shared/visuals/diagram-workspace-state.ts";
import {
  displayedScene,
  recordLearnerEdit,
  startDiagramWorkspace,
} from "../../../shared/visuals/diagram-workspace-state.ts";
import type { GraphDiagramSpec } from "../../../shared/visuals/graph-diagram-spec.ts";
import { DiagramOutlineView } from "./DiagramOutlineView.tsx";
import type { DiagramEditorComponent, DiagramEditorSource } from "./diagram-editor-adapter.ts";

export interface DiagramWorkspaceProps {
  readonly spec: GraphDiagramSpec;
  /**
   * The drawing surface, or null when it could not be loaded. The workspace then
   * shows the diagram in words only, which is a real path rather than a stub.
   */
  readonly editor: DiagramEditorComponent | null;
  /** Shown in place of the drawing while the editor is still loading. */
  readonly editorNotice?: string;
  /** What the learner drew last time, if anything was kept. */
  readonly savedLearnerScene?: LearnerDiagramScene | null;
  /** Called whenever the learner's version of the diagram changes or is reset. */
  readonly onLearnerSceneChanged?: (scene: LearnerDiagramScene | null) => void;
}

/**
 * Shows one diagram, and lets the learner change their copy of it.
 *
 * The taught diagram and the learner's edits are kept apart, so "Reset" always has
 * something true to go back to. That split lives in `diagram-workspace-state.ts` as
 * pure functions; this component decides what the editor is given and when.
 *
 * **The editor is started once and then left alone.** A drawing surface reports every
 * change, many times a second while a box is being dragged, and it re-renders when any
 * of its own props change identity. So two rules hold here, and both are load-bearing
 * rather than tidiness:
 *
 * - the scene handed to the editor is read once per start, never re-read from a change
 *   the editor itself reported;
 * - the change handler and every other prop keep the same identity for the life of the
 *   editor.
 *
 * Break either and each change causes a re-render which causes another change: the
 * page freezes and React gives up with a maximum update depth error. So after the
 * editor starts, it owns the live drawing, and this component keeps only the little it
 * needs — whether Reset should be offered, and the newest scene to remember.
 *
 * Reset does not talk a running editor back to the taught diagram. It starts a new one.
 *
 * A new taught revision of the same diagram is a new drawing, and arrives as its own
 * beat with its own workspace. This component therefore never has to swap one
 * revision for another in place; it only has to make sure the revision it was given
 * is the one whose saved edits it asks for and the one the editor is keyed by.
 */
export function DiagramWorkspace({
  spec,
  editor,
  editorNotice,
  savedLearnerScene,
  onLearnerSceneChanged,
}: DiagramWorkspaceProps) {
  /** Bumped by Reset, which is the one time the editor is started again. */
  const [startCount, setStartCount] = useState(0);
  const [canReset, setCanReset] = useState(
    savedLearnerScene !== undefined && savedLearnerScene !== null,
  );

  // Refs, not state: a change must not re-render this component, because that would
  // re-render the editor, which would report another change.
  const hasEdits = useRef(canReset);
  const notifySceneChanged = useRef(onLearnerSceneChanged);
  notifySceneChanged.current = onLearnerSceneChanged;
  const scenePresentedAtFirstStart = useRef(savedLearnerScene ?? null);

  const outline = useMemo(() => describeDiagramForReading(spec), [spec]);

  const editorSource = useMemo<DiagramEditorSource>(() => {
    const taught = startDiagramWorkspace(spec);
    const savedScene = startCount === 0 ? scenePresentedAtFirstStart.current : null;
    return editorSourceFor(savedScene === null ? taught : recordLearnerEdit(taught, savedScene));
  }, [spec, startCount]);

  // The editor is started again when the taught drawing changes as well as when Reset
  // is pressed, so a later revision of a diagram is shown as it was taught.
  const editorRunKey = `${spec.revision}:${startCount}`;

  const handleSceneChanged = useCallback((scene: LearnerDiagramScene) => {
    // Offer Reset the first time only. Every later change is passed on without any
    // state changing here, so the editor is never re-rendered by this component.
    if (!hasEdits.current) {
      hasEdits.current = true;
      setCanReset(true);
    }
    notifySceneChanged.current?.(scene);
  }, []);

  function resetToTaughtDiagram(): void {
    hasEdits.current = false;
    scenePresentedAtFirstStart.current = null;
    setCanReset(false);
    setStartCount((count) => count + 1);
    notifySceneChanged.current?.(null);
  }

  const Editor = editor;

  return (
    <article className="beat-card diagram-card">
      <div className="diagram-card-header">
        <span className="beat-kind-label">Diagram</span>
        {canReset ? (
          <button
            type="button"
            className="button diagram-reset-button"
            onClick={resetToTaughtDiagram}
          >
            Reset to the taught diagram
          </button>
        ) : null}
      </div>

      {Editor === null ? (
        <p className="diagram-editor-missing">
          {editorNotice ??
            "The drawing surface is not available, so this diagram is shown in words."}
        </p>
      ) : (
        <div className="diagram-canvas">
          <DiagramEditorHost
            key={editorRunKey}
            editor={Editor}
            source={editorSource}
            ariaLabel={`${spec.title}. An editable diagram.`}
            onSceneChanged={handleSceneChanged}
          />
        </div>
      )}

      <DiagramOutlineView outline={outline} />
    </article>
  );
}

/**
 * Holds the editor still.
 *
 * `canReset` changing re-renders the workspace, and the workspace's own render would
 * otherwise re-render the editor with it. This is memoised on values that only change
 * when the editor is meant to start again, so the drawing survives a Reset button
 * appearing above it.
 */
const DiagramEditorHost = memo(
  ({
    editor: Editor,
    source,
    ariaLabel,
    onSceneChanged,
  }: {
    readonly editor: DiagramEditorComponent;
    readonly source: DiagramEditorSource;
    readonly ariaLabel: string;
    readonly onSceneChanged: (scene: LearnerDiagramScene) => void;
  }) => <Editor source={source} onSceneChanged={onSceneChanged} ariaLabel={ariaLabel} />,
);

/**
 * One explicit branch per origin, so a scene the learner has already edited is
 * never handed to the editor as if it still needed converting.
 */
function editorSourceFor(
  workspace: ReturnType<typeof startDiagramWorkspace>,
): DiagramEditorSource {
  const displayed = displayedScene(workspace);

  switch (displayed.origin) {
    case "generated":
      return { origin: "generated", skeletonElements: displayed.scene.skeletonElements };
    case "learner_edited":
      return { origin: "learner_edited", scene: displayed.scene };
  }
}
