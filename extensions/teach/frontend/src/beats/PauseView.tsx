import type { PauseBeat } from "../../../shared/beat.ts";
import { ProseView } from "./ProseView.tsx";

export function PauseView({ beat }: { beat: PauseBeat }) {
  return (
    <article className="beat-card pause-card">
      <p className="beat-kind-label">Your turn</p>
      <p className="pause-reason">
        <ProseView text={beat.reason} />
      </p>
      <p className="pause-hint">
        About {describeWait(beat.suggestedWaitSeconds)}. Press Continue when you are ready, or
        ask a question first.
      </p>
    </article>
  );
}

function describeWait(suggestedWaitSeconds: number): string {
  if (suggestedWaitSeconds < 60) {
    return `${suggestedWaitSeconds} seconds`;
  }
  const minutes = Math.round(suggestedWaitSeconds / 60);
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}
