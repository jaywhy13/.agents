import { useEffect, useMemo, useRef, useState } from "react";

import type { DiagramBeat } from "../../../shared/beat.ts";
import type { LearnerDiagramScene } from "../../../shared/visuals/diagram-workspace-state.ts";
import { DiagramWorkspace } from "../visuals/DiagramWorkspace.tsx";
import type { TaughtDiagramIdentity } from "../visuals/learner-diagram-store.ts";
import { LearnerDiagramStore } from "../visuals/learner-diagram-store.ts";
import { useDiagramEditor } from "../visuals/use-diagram-editor.ts";

const learnerDiagrams = new LearnerDiagramStore();

/**
 * A drawing surface reports every change, several times a second while a box is
 * being dragged. Writing to storage that often would be wasteful and would block the
 * drawing, so the newest scene is kept and written once the learner stops moving.
 */
const SAVE_AFTER_QUIET_MILLISECONDS = 750;

/**
 * One diagram beat on the page.
 *
 * This is the seam between the beat and the workspace: it loads the drawing surface
 * on demand and keeps whatever the learner draws on their own machine. The workspace
 * itself knows nothing about either, which is what lets it be a pure component with
 * the taught diagram and the learner's copy held apart.
 *
 * Edits are kept under the revision they were made to. A lesson that draws the same
 * diagram again with more on it publishes a new beat with a higher revision, so this
 * beat finds no saved edits and shows the new taught drawing, while the edits to the
 * earlier revision stay where they were.
 */
export function DiagramBeatView({ beat }: { beat: DiagramBeat }) {
  const editorLoad = useDiagramEditor();
  const taughtDiagram: TaughtDiagramIdentity = useMemo(
    () => ({
      lessonId: beat.lessonId,
      diagramId: beat.spec.diagramId,
      revision: beat.spec.revision,
    }),
    [beat.lessonId, beat.spec.diagramId, beat.spec.revision],
  );
  const [savedScene] = useState<LearnerDiagramScene | null>(() =>
    learnerDiagrams.load(taughtDiagram),
  );
  const saveWhenQuiet = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (saveWhenQuiet.current !== null) {
        clearTimeout(saveWhenQuiet.current);
      }
    },
    [],
  );

  const editorNotice = useMemo(() => {
    switch (editorLoad.status) {
      case "loading":
        return "Getting the drawing surface ready. The diagram is written out below.";
      case "unavailable":
        return `The drawing surface could not be loaded (${editorLoad.reason}), so this diagram is shown in words.`;
      case "ready":
        return "";
    }
  }, [editorLoad]);

  return (
    <DiagramWorkspace
      spec={beat.spec}
      editor={editorLoad.status === "ready" ? editorLoad.editor : null}
      editorNotice={editorNotice}
      savedLearnerScene={savedScene}
      onLearnerSceneChanged={(scene) => {
        if (saveWhenQuiet.current !== null) {
          clearTimeout(saveWhenQuiet.current);
          saveWhenQuiet.current = null;
        }
        if (scene === null) {
          learnerDiagrams.forget(taughtDiagram);
          return;
        }
        saveWhenQuiet.current = setTimeout(() => {
          saveWhenQuiet.current = null;
          learnerDiagrams.save(taughtDiagram, scene);
        }, SAVE_AFTER_QUIET_MILLISECONDS);
      }}
    />
  );
}
