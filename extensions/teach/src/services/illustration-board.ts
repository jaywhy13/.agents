import type {
  IllustrationProgress,
  IllustrationState,
} from "../../shared/visuals/illustration-state.ts";
import { illustrationProgressOf } from "../../shared/visuals/illustration-state.ts";
import type { BeatBroadcaster } from "./beat-broadcaster.ts";

/**
 * Where each picture in one lesson has got to.
 *
 * A picture is not a beat. The image beat says what was asked for and never
 * changes, because the beat log is only ever appended to; the picture itself starts,
 * arrives or fails seconds later. This holds that second, moving part.
 *
 * It is kept in memory on purpose. A lesson lives inside one pi session, and a page
 * reconnecting inside that session is the case this has to survive. The bytes of a
 * finished picture are on disk, so nothing that cost money is lost when the session
 * ends.
 *
 * Every state recorded here is also sent to the browsers watching, so the board and
 * the page can never disagree about what a picture is doing. The filesystem path is
 * dropped on the way in, so a path can never reach a browser through this.
 */
export class IllustrationBoard {
  private readonly beatBroadcaster: BeatBroadcaster;
  private readonly newestByIllustrationId = new Map<string, IllustrationProgress>();

  constructor(beatBroadcaster: BeatBroadcaster) {
    this.beatBroadcaster = beatBroadcaster;
  }

  /** Records where a picture has got to, and tells every watching browser. */
  record(state: IllustrationState): void {
    const progress = illustrationProgressOf(state);
    this.newestByIllustrationId.set(progress.illustrationId, progress);
    this.beatBroadcaster.broadcast({ type: "illustration", state: progress });
  }

  get(illustrationId: string): IllustrationProgress | null {
    return this.newestByIllustrationId.get(illustrationId) ?? null;
  }

  list(): readonly IllustrationProgress[] {
    return [...this.newestByIllustrationId.values()];
  }
}
