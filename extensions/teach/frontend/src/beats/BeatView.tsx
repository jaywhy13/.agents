import type { BrowserBeat } from "../../../shared/browser-beat.ts";
import { CodeView } from "./CodeView.tsx";
import { ConceptCardView } from "./ConceptCardView.tsx";
import { DefinitionView } from "./DefinitionView.tsx";
import { DiagramBeatView } from "./DiagramBeatView.tsx";
import { ImageBeatView } from "./ImageBeatView.tsx";
import { LessonEndView } from "./LessonEndView.tsx";
import { PauseView } from "./PauseView.tsx";
import { QuizView } from "./QuizView.tsx";

/**
 * One explicit branch per beat kind. When a reserved kind is implemented, add its
 * branch here; the switch is the list of what the page can show.
 */
export function BeatView({ beat }: { beat: BrowserBeat }) {
  switch (beat.kind) {
    case "concept_card":
      return <ConceptCardView beat={beat} />;
    case "definition":
      return <DefinitionView beat={beat} />;
    case "code":
      return <CodeView beat={beat} />;
    case "diagram":
      return <DiagramBeatView beat={beat} />;
    case "image":
      return <ImageBeatView beat={beat} />;
    case "quiz":
      return <QuizView beat={beat} />;
    case "pause":
      return <PauseView beat={beat} />;
    case "lesson_end":
      return <LessonEndView beat={beat} />;
    // Narration is spoken, not drawn. `beatsShownOnScreen` keeps it out of the
    // list, and this branch says so rather than leaving a hole in the switch.
    case "narration":
      return null;
  }
}
