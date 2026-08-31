import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Beat } from "../../shared/beat.ts";
import { parseBeat } from "../../shared/beat.ts";
import type { LearnerSignal, PauseDwell, QuizAttempt } from "../../shared/learner-history.ts";
import {
  parseLearnerSignal,
  parsePauseDwell,
  parseQuizAttempt,
} from "../../shared/learner-history.ts";
import type { LessonMetadata } from "../../shared/lesson.ts";
import { InvalidLessonError, parseLessonMetadata, requireLessonId } from "../../shared/lesson.ts";
import { writeFileAtomically } from "../storage/atomic-file-writer.ts";

const LESSON_FILE_NAME = "lesson.json";
const BEAT_LOG_FILE_NAME = "beats.jsonl";
const QUIZ_ATTEMPT_LOG_FILE_NAME = "quiz-attempts.jsonl";
const PAUSE_DWELL_LOG_FILE_NAME = "pause-dwells.jsonl";
const LEARNER_SIGNAL_LOG_FILE_NAME = "learner-signals.jsonl";

/**
 * Stores lessons on the learner's own machine. Lesson metadata is small and is
 * rewritten whole, so it is replaced atomically. Beats are only ever added, so
 * they live in an append-only JSON Lines log that can be replayed or streamed.
 *
 * Two callers change lesson metadata while a lesson runs: the conductor writes the
 * status and the beat publisher writes the beat count. Both rewrite the whole
 * record, so every metadata write for one lesson is put on a queue and runs on its
 * own. Without that, the later write would silently undo the earlier one.
 */
export class LessonRepository {
  private readonly lessonsDirectory: string;
  private readonly metadataWriteQueues = new Map<string, Promise<unknown>>();

  constructor(lessonsDirectory: string) {
    this.lessonsDirectory = lessonsDirectory;
  }

  async saveLesson(metadata: LessonMetadata): Promise<void> {
    await this.queueMetadataWrite(metadata.lessonId, () => this.writeLesson(metadata));
  }

  /**
   * Reads the lesson, applies `change`, and writes the result back, with no other
   * metadata write for the same lesson in between. Returns null when the lesson is
   * not there to change.
   */
  async updateLesson(
    lessonId: string,
    change: (metadata: LessonMetadata) => LessonMetadata,
  ): Promise<LessonMetadata | null> {
    return this.queueMetadataWrite(lessonId, async () => {
      const metadata = await this.getLesson(lessonId);
      if (metadata === null) {
        return null;
      }
      const changed = change(metadata);
      await this.writeLesson(changed);
      return changed;
    });
  }

  async getLesson(lessonId: string): Promise<LessonMetadata | null> {
    const lessonFilePath = path.join(this.lessonDirectory(lessonId), LESSON_FILE_NAME);

    let content: string;
    try {
      content = await readFile(lessonFilePath, "utf8");
    } catch {
      return null;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch (cause) {
      throw new InvalidLessonError(
        `Lesson ${lessonId} has a lesson.json that is not JSON: ${describeCause(cause)}`,
      );
    }

    return parseLessonMetadata(parsedJson);
  }

  async listLessons(): Promise<readonly LessonMetadata[]> {
    let entries: string[];
    try {
      entries = await readdir(this.lessonsDirectory);
    } catch {
      return [];
    }

    const lessons: LessonMetadata[] = [];
    for (const entry of entries) {
      const metadata = await this.readLessonIfPresent(entry);
      if (metadata !== null) {
        lessons.push(metadata);
      }
    }
    return lessons;
  }

  async appendBeat(lessonId: string, beat: Beat): Promise<void> {
    await this.appendLogLine(lessonId, BEAT_LOG_FILE_NAME, beat);
  }

  async listBeats(lessonId: string): Promise<readonly Beat[]> {
    return this.readLog(lessonId, BEAT_LOG_FILE_NAME, parseBeat, "beat");
  }

  async appendQuizAttempt(lessonId: string, attempt: QuizAttempt): Promise<void> {
    await this.appendLogLine(lessonId, QUIZ_ATTEMPT_LOG_FILE_NAME, attempt);
  }

  async listQuizAttempts(lessonId: string): Promise<readonly QuizAttempt[]> {
    return this.readLog(lessonId, QUIZ_ATTEMPT_LOG_FILE_NAME, parseQuizAttempt, "quiz attempt");
  }

  async appendPauseDwell(lessonId: string, dwell: PauseDwell): Promise<void> {
    await this.appendLogLine(lessonId, PAUSE_DWELL_LOG_FILE_NAME, dwell);
  }

  async listPauseDwells(lessonId: string): Promise<readonly PauseDwell[]> {
    return this.readLog(lessonId, PAUSE_DWELL_LOG_FILE_NAME, parsePauseDwell, "pause dwell");
  }

  async appendLearnerSignal(lessonId: string, learnerSignal: LearnerSignal): Promise<void> {
    await this.appendLogLine(lessonId, LEARNER_SIGNAL_LOG_FILE_NAME, learnerSignal);
  }

  async listLearnerSignals(lessonId: string): Promise<readonly LearnerSignal[]> {
    return this.readLog(
      lessonId,
      LEARNER_SIGNAL_LOG_FILE_NAME,
      parseLearnerSignal,
      "learner signal",
    );
  }

  private async appendLogLine(
    lessonId: string,
    logFileName: string,
    record: unknown,
  ): Promise<void> {
    const lessonDirectory = this.lessonDirectory(lessonId);
    await mkdir(lessonDirectory, { recursive: true });
    await appendFile(
      path.join(lessonDirectory, logFileName),
      `${JSON.stringify(record)}\n`,
      "utf8",
    );
  }

  private async readLog<T>(
    lessonId: string,
    logFileName: string,
    parseRecord: (candidate: unknown) => T,
    recordLabel: string,
  ): Promise<readonly T[]> {
    const logPath = path.join(this.lessonDirectory(lessonId), logFileName);

    let content: string;
    try {
      content = await readFile(logPath, "utf8");
    } catch {
      return [];
    }

    return parseLogLines(content, parseRecord, recordLabel);
  }

  private lessonDirectory(lessonId: string): string {
    return path.join(this.lessonsDirectory, requireLessonId(lessonId));
  }

  private async writeLesson(metadata: LessonMetadata): Promise<void> {
    const lessonDirectory = this.lessonDirectory(metadata.lessonId);
    await mkdir(lessonDirectory, { recursive: true });
    await writeFileAtomically(
      path.join(lessonDirectory, LESSON_FILE_NAME),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
  }

  /** Runs metadata writes for one lesson one after another, never side by side. */
  private queueMetadataWrite<T>(lessonId: string, write: () => Promise<T>): Promise<T> {
    const runAfterPrevious = this.metadataWriteQueues.get(lessonId) ?? Promise.resolve();
    const result = runAfterPrevious.then(write, write);
    // A failed write must not block the writes behind it, so the queue only ever
    // waits for the previous write to settle, not to succeed.
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.metadataWriteQueues.set(lessonId, settled);
    void settled.then(() => {
      if (this.metadataWriteQueues.get(lessonId) === settled) {
        this.metadataWriteQueues.delete(lessonId);
      }
    });
    return result;
  }

  private async readLessonIfPresent(entry: string): Promise<LessonMetadata | null> {
    try {
      return await this.getLesson(entry);
    } catch {
      return null;
    }
  }
}

/**
 * Every log in a lesson directory is JSON Lines, so one reader serves beats, quiz
 * attempts and pause dwells alike, and every bad line is named the same way.
 */
function parseLogLines<T>(
  content: string,
  parseRecord: (candidate: unknown) => T,
  recordLabel: string,
): readonly T[] {
  const records: T[] = [];
  const lines = content.split("\n");

  for (const [index, line] of lines.entries()) {
    if (line.trim().length === 0) {
      continue;
    }
    const lineNumber = index + 1;
    try {
      records.push(parseRecord(JSON.parse(line)));
    } catch (cause) {
      throw new InvalidLessonError(
        `${recordLabel} log line ${lineNumber} is not a valid ${recordLabel}: ${describeCause(cause)}`,
      );
    }
  }

  return records;
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
