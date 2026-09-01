import type { StoredReference } from "./reference.ts";
import type { ExcerptWindow, TextExcerpt } from "./reference-excerpt.ts";
import { takeTextExcerpt } from "./reference-excerpt.ts";
import type { ReferenceRepository } from "./reference-repository.ts";

export interface ReferenceLibraryServiceOptions {
  readonly referenceRepository: ReferenceRepository;
}

/** One window of one reference, with enough about the reference to quote it. */
export interface ReferenceExcerpt extends TextExcerpt {
  readonly referenceId: string;
  readonly lessonId: string;
  readonly label: string;
  readonly sourceUrl: string | null;
}

export class ReferenceNotFoundError extends Error {
  readonly referenceId: string;

  constructor(lessonId: string, referenceId: string) {
    super(`Lesson ${lessonId} has no reference ${referenceId}.`);
    this.name = "ReferenceNotFoundError";
    this.referenceId = referenceId;
  }
}

/**
 * Reads stored references back for the lesson.
 *
 * It is separate from copying on purpose: copying talks to the network and runs
 * once at setup, while reading runs over and over while the lesson teaches, and
 * has to stay cheap. Reading is always a window — never the whole reference — so
 * evidence can be looked at without any of it living in the lesson's prompt.
 */
export class ReferenceLibraryService {
  private readonly referenceRepository: ReferenceRepository;

  constructor(options: ReferenceLibraryServiceOptions) {
    this.referenceRepository = options.referenceRepository;
  }

  async list(lessonId: string): Promise<readonly StoredReference[]> {
    return this.referenceRepository.list(lessonId);
  }

  async get(lessonId: string, referenceId: string): Promise<StoredReference | null> {
    return this.referenceRepository.get(lessonId, referenceId);
  }

  async readExcerpt(
    lessonId: string,
    referenceId: string,
    window: ExcerptWindow = {},
  ): Promise<ReferenceExcerpt> {
    const reference = await this.referenceRepository.get(lessonId, referenceId);
    const content = await this.referenceRepository.readContent(lessonId, referenceId);
    if (reference === null || content === null) {
      throw new ReferenceNotFoundError(lessonId, referenceId);
    }

    return {
      ...takeTextExcerpt(content, window),
      referenceId: reference.referenceId,
      lessonId: reference.lessonId,
      label: reference.label,
      sourceUrl: reference.sourceUrl,
    };
  }
}
