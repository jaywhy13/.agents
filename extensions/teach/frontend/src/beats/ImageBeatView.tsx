import { useState } from "react";

import type { ImageBeat } from "../../../shared/beat.ts";
import { lessonBasePath } from "../../../shared/lesson-route.ts";
import type { IllustrationProgress } from "../../../shared/visuals/illustration-state.ts";
import { illustrationStatusMessage } from "../../../shared/visuals/illustration-state.ts";
import { useIllustration } from "../illustration-context.ts";
import { ProseView } from "./ProseView.tsx";

/**
 * One drawn picture on the page.
 *
 * The words come first in the markup and stay on screen whatever happens to the
 * drawing. That is not only for a learner using a screen reader: a picture takes
 * seconds to draw and may never arrive, so the words have to teach on their own.
 *
 * The bytes are fetched from the lesson server by the content hash of the request,
 * through an address inside the token route. Nothing here knows where the file is.
 */
export function ImageBeatView({ beat }: { beat: ImageBeat }) {
  const progress = useIllustration(beat.illustrationId);
  const [couldNotBeDrawn, setCouldNotBeDrawn] = useState(false);

  return (
    <article className="beat-card image-card">
      <p className="beat-kind-label">Picture</p>

      <p className="image-alternative-text">
        <ProseView text={beat.request.alternativeText} />
      </p>

      {progress?.status === "ready" && !couldNotBeDrawn ? (
        <img
          className="image-illustration"
          src={illustrationUrl(beat.illustrationId)}
          alt={beat.request.alternativeText}
          width={widthOf(beat)}
          height={heightOf(beat)}
          onError={() => setCouldNotBeDrawn(true)}
        />
      ) : (
        <p className="image-status" role="status">
          {statusMessage(progress, couldNotBeDrawn)}
        </p>
      )}
    </article>
  );
}

function statusMessage(progress: IllustrationProgress | null, couldNotBeDrawn: boolean): string {
  if (couldNotBeDrawn) {
    return "The picture could not be shown. The words above say what it was of.";
  }
  if (progress === null) {
    // The beat arrived before the first state did, which is the normal order.
    return "Drawing the picture…";
  }
  return illustrationStatusMessage(progress);
}

/** Inside the token route, so the address carries the lesson token in its path. */
function illustrationUrl(illustrationId: string): string {
  return `${lessonBasePath(window.location.pathname)}api/images/${illustrationId}.png`;
}

function widthOf(beat: ImageBeat): number {
  return Number(beat.request.size.split("x")[0] ?? 1024);
}

function heightOf(beat: ImageBeat): number {
  return Number(beat.request.size.split("x")[1] ?? 1024);
}
