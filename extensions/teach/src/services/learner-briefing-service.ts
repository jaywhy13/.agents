import { glossaryFromBeats, glossaryTermNames } from "../../shared/glossary.ts";
import type { LearnerModel } from "../domain/learner-model.ts";
import { deriveLearnerModel } from "../domain/learner-model.ts";
import { buildTurnBriefing, RECENT_BEAT_COUNT } from "../domain/turn-briefing.ts";
import type { LessonRepository } from "./lesson-repository.ts";

export interface LearnerBriefingServiceOptions {
  readonly lessonId: string;
  readonly lessonRepository: LessonRepository;
}

/**
 * Works out what the next teaching turn is told about the learner.
 *
 * It reads the stored lesson rather than keeping the picture in memory, so a lesson
 * that is reopened, or a pi session that restarted, gives the same briefing. The
 * briefing is deliberately small: the learner model, the last few beats, and the
 * glossary names. The lesson's whole history is never sent.
 */
export class LearnerBriefingService {
  private readonly lessonId: string;
  private readonly lessonRepository: LessonRepository;

  constructor(options: LearnerBriefingServiceOptions) {
    this.lessonId = options.lessonId;
    this.lessonRepository = options.lessonRepository;
  }

  async briefingForNextTurn(): Promise<string> {
    const [beats, quizAttempts, pauseDwells, learnerSignals] = await Promise.all([
      this.lessonRepository.listBeats(this.lessonId),
      this.lessonRepository.listQuizAttempts(this.lessonId),
      this.lessonRepository.listPauseDwells(this.lessonId),
      this.lessonRepository.listLearnerSignals(this.lessonId),
    ]);

    return buildTurnBriefing({
      learnerModel: deriveLearnerModel({ quizAttempts, pauseDwells, learnerSignals }),
      // Only the tail is read: a long lesson must not grow the turn it starts.
      recentBeats: beats.slice(-(RECENT_BEAT_COUNT * 2)),
      glossaryTermNames: glossaryTermNames(glossaryFromBeats(beats)),
    });
  }

  async learnerModel(): Promise<LearnerModel> {
    const [quizAttempts, pauseDwells, learnerSignals] = await Promise.all([
      this.lessonRepository.listQuizAttempts(this.lessonId),
      this.lessonRepository.listPauseDwells(this.lessonId),
      this.lessonRepository.listLearnerSignals(this.lessonId),
    ]);
    return deriveLearnerModel({ quizAttempts, pauseDwells, learnerSignals });
  }
}
