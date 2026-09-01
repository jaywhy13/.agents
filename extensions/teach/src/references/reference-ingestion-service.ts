import { randomBytes } from "node:crypto";

import type { GithubReferenceClient } from "./github-reference-client.ts";
import type { PastedTextReferenceClient } from "./pasted-text-reference-client.ts";
import type { Reference, ReferenceContent, ReferenceInput, StoredReference } from "./reference.ts";
import { InvalidReferenceError, ReferenceCopyError } from "./reference.ts";
import { normalizeReference } from "./reference-normalizer.ts";
import { contentFileName } from "./reference-repository.ts";
import type { ReferenceRepository } from "./reference-repository.ts";
import type { UrlReferenceClient } from "./url-reference-client.ts";

export interface ReferenceIngestionServiceOptions {
  readonly referenceRepository: ReferenceRepository;
  readonly urlReferenceClient: UrlReferenceClient;
  readonly githubReferenceClient: GithubReferenceClient;
  readonly pastedTextReferenceClient: PastedTextReferenceClient;
  readonly now?: () => Date;
  readonly createReferenceId?: () => string;
}

export type ReferenceIngestionOutcome =
  | { readonly status: "copied"; readonly reference: StoredReference }
  | { readonly status: "failed"; readonly label: string; readonly reason: string };

/**
 * Takes what the learner gave the lesson and turns it into copied, stored
 * evidence.
 *
 * One reference failing must not stop a lesson starting, so `copyAll` reports one
 * outcome per reference instead of throwing on the first bad link. The caller
 * decides what to tell the learner about the ones that did not work.
 */
export class ReferenceIngestionService {
  private readonly referenceRepository: ReferenceRepository;
  private readonly urlReferenceClient: UrlReferenceClient;
  private readonly githubReferenceClient: GithubReferenceClient;
  private readonly pastedTextReferenceClient: PastedTextReferenceClient;
  private readonly now: () => Date;
  private readonly createReferenceId: () => string;

  constructor(options: ReferenceIngestionServiceOptions) {
    this.referenceRepository = options.referenceRepository;
    this.urlReferenceClient = options.urlReferenceClient;
    this.githubReferenceClient = options.githubReferenceClient;
    this.pastedTextReferenceClient = options.pastedTextReferenceClient;
    this.now = options.now ?? (() => new Date());
    this.createReferenceId = options.createReferenceId ?? createRandomReferenceId;
  }

  async copy(lessonId: string, input: ReferenceInput): Promise<StoredReference> {
    const reference = normalizeReference(input);
    const content = await this.copyContentOf(reference);
    return this.store(lessonId, reference, content);
  }

  async copyAll(
    lessonId: string,
    inputs: readonly ReferenceInput[],
  ): Promise<readonly ReferenceIngestionOutcome[]> {
    const outcomes: ReferenceIngestionOutcome[] = [];
    for (const input of inputs) {
      outcomes.push(await this.copyOneOutcome(lessonId, input));
    }
    return outcomes;
  }

  private async copyOneOutcome(
    lessonId: string,
    input: ReferenceInput,
  ): Promise<ReferenceIngestionOutcome> {
    try {
      return { status: "copied", reference: await this.copy(lessonId, input) };
    } catch (cause) {
      if (cause instanceof InvalidReferenceError || cause instanceof ReferenceCopyError) {
        return { status: "failed", label: input.label, reason: cause.message };
      }
      throw cause;
    }
  }

  /** One branch per reference kind, so a new kind cannot be quietly forgotten. */
  private async copyContentOf(reference: Reference): Promise<ReferenceContent> {
    if (reference.kind === "url") {
      return this.urlReferenceClient.copy(reference);
    }
    if (reference.kind === "github") {
      return this.githubReferenceClient.copy(reference);
    }
    if (reference.kind === "pasted") {
      return this.pastedTextReferenceClient.copy(reference);
    }
    throw new InvalidReferenceError(
      `Unknown reference kind: ${String((reference as { kind: string }).kind)}`,
    );
  }

  private async store(
    lessonId: string,
    reference: Reference,
    content: ReferenceContent,
  ): Promise<StoredReference> {
    const referenceId = this.createReferenceId();
    const storedReference: StoredReference = {
      referenceId,
      lessonId,
      kind: reference.kind,
      label: reference.label,
      sourceUrl: content.sourceUrl,
      title: content.title,
      mediaType: content.mediaType,
      byteLength: Buffer.byteLength(content.text, "utf8"),
      lineCount: content.text.split("\n").length,
      copiedAt: this.now().toISOString(),
      contentFileName: contentFileName(referenceId),
    };
    return this.referenceRepository.create(storedReference, content.text);
  }
}

function createRandomReferenceId(): string {
  return `reference-${randomBytes(8).toString("hex")}`;
}
