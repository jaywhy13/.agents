import type { LessonReference } from "../../shared/lesson.ts";
import type { ReferenceIngestionOutcome } from "../../src/references/reference-ingestion-service.ts";
import type { ReferenceExcerpt } from "../../src/references/reference-library-service.ts";
import { ReferenceNotFoundError } from "../../src/references/reference-library-service.ts";
import type { StoredReference } from "../../src/references/reference.ts";
import type { LessonReferenceServices } from "../../src/services/lesson-reference-services.ts";

/**
 * Stands in for the reference module, so a lesson test never touches the network,
 * `gh`, or a disk. Copying is recorded, and each reference can be told to fail so
 * the "one bad link must not stop the lesson" behaviour can be driven directly.
 */
export class FakeReferenceServices {
  readonly copiedLessons: Array<{
    readonly lessonId: string;
    readonly references: readonly LessonReference[];
  }> = [];
  readonly excerptReads: Array<{ readonly lessonId: string; readonly referenceId: string }> = [];

  /** Labels that will fail to copy, with the reason the learner is told. */
  readonly failureReasonsByLabel = new Map<string, string>();
  /** Set to act like the module itself breaking, rather than one reference failing. */
  copyAllThrows: Error | null = null;
  contentByReferenceId = new Map<string, string>();

  private storedByLessonId = new Map<string, StoredReference[]>();
  private referenceCount = 0;

  get services(): LessonReferenceServices {
    // Cast, because the fake supplies only the two methods a lesson actually calls.
    // A real class would drag the whole reference module into every lesson test.
    return {
      referenceIngestionService: {
        copyAll: (lessonId: string, references: readonly LessonReference[]) =>
          this.copyAll(lessonId, references),
      },
      referenceLibraryService: {
        list: (lessonId: string) => this.list(lessonId),
        readExcerpt: (lessonId: string, referenceId: string) =>
          this.readExcerpt(lessonId, referenceId),
      },
    } as unknown as LessonReferenceServices;
  }

  storedFor(lessonId: string): readonly StoredReference[] {
    return this.storedByLessonId.get(lessonId) ?? [];
  }

  private async copyAll(
    lessonId: string,
    references: readonly LessonReference[],
  ): Promise<readonly ReferenceIngestionOutcome[]> {
    this.copiedLessons.push({ lessonId, references });
    if (this.copyAllThrows !== null) {
      throw this.copyAllThrows;
    }

    const outcomes: ReferenceIngestionOutcome[] = [];
    const stored = this.storedByLessonId.get(lessonId) ?? [];
    for (const reference of references) {
      const failure = this.failureReasonsByLabel.get(reference.label);
      if (failure !== undefined) {
        outcomes.push({ status: "failed", label: reference.label, reason: failure });
        continue;
      }
      this.referenceCount += 1;
      const copied: StoredReference = {
        referenceId: `reference-${this.referenceCount}`,
        lessonId,
        kind: reference.kind,
        label: reference.label,
        sourceUrl: reference.kind === "pasted" ? null : reference.value,
        title: reference.label,
        mediaType: "text/plain",
        byteLength: reference.value.length,
        lineCount: reference.value.split("\n").length,
        copiedAt: "2024-05-01T10:00:00.000Z",
        contentFileName: `reference-${this.referenceCount}.txt`,
      };
      stored.push(copied);
      this.contentByReferenceId.set(copied.referenceId, reference.value);
      outcomes.push({ status: "copied", reference: copied });
    }
    this.storedByLessonId.set(lessonId, stored);
    return outcomes;
  }

  private async list(lessonId: string): Promise<readonly StoredReference[]> {
    return this.storedFor(lessonId);
  }

  private async readExcerpt(lessonId: string, referenceId: string): Promise<ReferenceExcerpt> {
    this.excerptReads.push({ lessonId, referenceId });
    const reference = this.storedFor(lessonId).find(
      (candidate) => candidate.referenceId === referenceId,
    );
    const content = this.contentByReferenceId.get(referenceId);
    if (reference === undefined || content === undefined) {
      throw new ReferenceNotFoundError(lessonId, referenceId);
    }

    const lines = content.split("\n");
    return {
      text: content,
      firstLineNumber: 1,
      lineCount: lines.length,
      totalLineCount: lines.length,
      byteLength: content.length,
      totalByteLength: content.length,
      truncated: false,
      truncationReason: null,
      nextLineNumber: null,
      referenceId,
      lessonId,
      label: reference.label,
      sourceUrl: reference.sourceUrl,
    };
  }
}
