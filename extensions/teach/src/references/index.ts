import {
  ExecutedGithubCommandProbe,
  GhCommandGithubApiRunner,
  GithubCommandOrPublicApiRunner,
  PublicHttpGithubApiRunner,
} from "./github-api-runner.ts";
import type { GithubApiRunner, GithubCommandProbe } from "./github-api-runner.ts";
import { GithubReferenceClient } from "./github-reference-client.ts";
import { SystemHostAddressResolver } from "./host-address-resolver.ts";
import type { HtmlTextExtractor } from "./html-text-extractor.ts";
import { TagStrippingHtmlTextExtractor } from "./html-text-extractor.ts";
import { NodeHttpTransport } from "./http-transport.ts";
import { PastedTextReferenceClient } from "./pasted-text-reference-client.ts";
import { ReferenceIngestionService } from "./reference-ingestion-service.ts";
import { ReferenceLibraryService } from "./reference-library-service.ts";
import { FileSystemReferenceRepository } from "./reference-repository.ts";
import { RequestTargetGuard } from "./request-target-guard.ts";
import type { SafeHttpClientOptions } from "./safe-http-client.ts";
import { SafeHttpClient } from "./safe-http-client.ts";
import { UrlReferenceClient } from "./url-reference-client.ts";

export type {
  GithubTarget,
  Reference,
  ReferenceContent,
  ReferenceInput,
  StoredReference,
  UrlReference,
} from "./reference.ts";
export { InvalidReferenceError, ReferenceCopyError } from "./reference.ts";
export { normalizeReference, normalizeReferences } from "./reference-normalizer.ts";
export type { ExcerptWindow, TextExcerpt } from "./reference-excerpt.ts";
export {
  MAXIMUM_EXCERPT_BYTES,
  MAXIMUM_EXCERPT_LINES,
  takeTextExcerpt,
} from "./reference-excerpt.ts";
export type { ReferenceRepository } from "./reference-repository.ts";
export { FileSystemReferenceRepository } from "./reference-repository.ts";
export type { ReferenceIngestionOutcome } from "./reference-ingestion-service.ts";
export { ReferenceIngestionService } from "./reference-ingestion-service.ts";
export type { ReferenceExcerpt } from "./reference-library-service.ts";
export { ReferenceLibraryService, ReferenceNotFoundError } from "./reference-library-service.ts";
export { BlockedRequestError, RequestTargetGuard } from "./request-target-guard.ts";
export { SafeHttpClient } from "./safe-http-client.ts";

export interface ReferenceModuleOptions {
  /** The same lessons directory the lesson repository writes to. */
  readonly lessonsDirectory: string;
  /**
   * Prefer the learner's own `gh` command, so a private repository they can already
   * see works too. It is a preference rather than a switch: when `gh` is missing or
   * signed out, references are read through the guarded public GitHub API instead.
   */
  readonly preferGithubCommand?: boolean;
  /** Injected so a test never starts a process to find out whether `gh` is there. */
  readonly githubCommandProbe?: GithubCommandProbe;
  readonly htmlTextExtractor?: HtmlTextExtractor;
  readonly safeHttpClientOptions?: SafeHttpClientOptions;
}

export interface ReferenceModule {
  readonly referenceIngestionService: ReferenceIngestionService;
  readonly referenceLibraryService: ReferenceLibraryService;
}

/**
 * Wires the real implementations together. This is the only place the module says
 * which concrete client is used, so a caller integrating it has one call to make
 * and a test never has to go through here at all.
 */
export function createReferenceModule(options: ReferenceModuleOptions): ReferenceModule {
  const safeHttpClient = new SafeHttpClient(
    new RequestTargetGuard(new SystemHostAddressResolver()),
    new NodeHttpTransport(),
    options.safeHttpClientOptions ?? {},
  );
  const publicApiRunner = new PublicHttpGithubApiRunner(safeHttpClient);
  const githubApiRunner: GithubApiRunner =
    options.preferGithubCommand === true
      ? new GithubCommandOrPublicApiRunner({
          githubCommandRunner: new GhCommandGithubApiRunner(),
          publicApiRunner,
          githubCommandProbe: options.githubCommandProbe ?? new ExecutedGithubCommandProbe(),
        })
      : publicApiRunner;
  const referenceRepository = new FileSystemReferenceRepository(options.lessonsDirectory);

  return {
    referenceIngestionService: new ReferenceIngestionService({
      referenceRepository,
      urlReferenceClient: new UrlReferenceClient(
        safeHttpClient,
        options.htmlTextExtractor ?? new TagStrippingHtmlTextExtractor(),
      ),
      githubReferenceClient: new GithubReferenceClient(githubApiRunner),
      pastedTextReferenceClient: new PastedTextReferenceClient(),
    }),
    referenceLibraryService: new ReferenceLibraryService({ referenceRepository }),
  };
}
