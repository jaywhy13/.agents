import type { ReferenceIngestionService } from "../references/reference-ingestion-service.ts";
import type { ReferenceLibraryService } from "../references/reference-library-service.ts";

/**
 * The two halves of the reference module the lesson uses, named by the service
 * layer so the conductor names what it needs rather than importing a factory.
 *
 * They are separate because they run at different times and for different reasons:
 * copying talks to the network and happens once, at setup; reading happens over and
 * over while the lesson teaches, and never leaves the machine.
 */
export interface LessonReferenceServices {
  readonly referenceIngestionService: ReferenceIngestionService;
  readonly referenceLibraryService: ReferenceLibraryService;
}
