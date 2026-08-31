import type { PauseBeat } from "../../shared/beat.ts";
import type { PauseDwell } from "../../shared/learner-history.ts";
import type { LessonRepository } from "./lesson-repository.ts";

export interface PauseDwellRecorderOptions {
  readonly lessonId: string;
  readonly lessonRepository: LessonRepository;
  readonly now?: () => Date;
}

/**
 * Measures how long the learner stayed on each pause.
 *
 * A learner who sits on every pause for three times as long as suggested is being
 * taught too fast, and one who moves on straight away is being taught too slowly.
 * That is the only signal the lesson has about pace, so it is recorded beside the
 * quiz answers and read back by the learner model.
 */
export class PauseDwellRecorder {
  private readonly lessonId: string;
  private readonly lessonRepository: LessonRepository;
  private readonly now: () => Date;
  private openPause: { readonly beat: PauseBeat; readonly pausedAt: Date } | null = null;

  constructor(options: PauseDwellRecorderOptions) {
    this.lessonId = options.lessonId;
    this.lessonRepository = options.lessonRepository;
    this.now = options.now ?? (() => new Date());
  }

  notePause(beat: PauseBeat): void {
    this.openPause = { beat, pausedAt: this.now() };
  }

  /**
   * Called when the learner does anything that ends the wait. Returns null when the
   * lesson was not paused, because not every turn follows a pause.
   */
  async recordResume(): Promise<PauseDwell | null> {
    const openPause = this.openPause;
    if (openPause === null) {
      return null;
    }
    this.openPause = null;

    const resumedAt = this.now();
    const dwell: PauseDwell = {
      lessonId: this.lessonId,
      beatId: openPause.beat.beatId,
      suggestedWaitSeconds: openPause.beat.suggestedWaitSeconds,
      actualWaitSeconds: Math.max(
        0,
        Math.round((resumedAt.getTime() - openPause.pausedAt.getTime()) / 1000),
      ),
      resumedAt: resumedAt.toISOString(),
    };

    await this.lessonRepository.appendPauseDwell(this.lessonId, dwell);
    return dwell;
  }
}
