import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { TagStrippingHtmlTextExtractor } from "../../../src/references/html-text-extractor.ts";
import { GithubReferenceClient } from "../../../src/references/github-reference-client.ts";
import { PastedTextReferenceClient } from "../../../src/references/pasted-text-reference-client.ts";
import type { StoredReference } from "../../../src/references/reference.ts";
import { ReferenceIngestionService } from "../../../src/references/reference-ingestion-service.ts";
import type { ReferenceIngestionServiceOptions } from "../../../src/references/reference-ingestion-service.ts";
import { FileSystemReferenceRepository } from "../../../src/references/reference-repository.ts";
import { RequestTargetGuard } from "../../../src/references/request-target-guard.ts";
import { SafeHttpClient } from "../../../src/references/safe-http-client.ts";
import { UrlReferenceClient } from "../../../src/references/url-reference-client.ts";
import { FakeGithubApiRunner } from "./fake-github-api-runner.ts";
import { FakeHostAddressResolver } from "./fake-host-address-resolver.ts";
import { FakeHttpTransport } from "./fake-http-transport.ts";

/** A real directory on disk, thrown away by the operating system afterwards. */
export async function emptyLessonsDirectory(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "teach-references-"));
}

export function storedReference(overrides: Partial<StoredReference> = {}): StoredReference {
  return {
    referenceId: "reference-aaaa1111",
    lessonId: "lesson-abc123",
    kind: "url",
    label: "Queue docs",
    sourceUrl: "https://example.com/queues",
    title: "How queues work",
    mediaType: "text/plain",
    byteLength: 12,
    lineCount: 1,
    copiedAt: "2024-05-01T10:00:00.000Z",
    contentFileName: "reference-aaaa1111.txt",
    ...overrides,
  };
}

export interface IngestionTestBench {
  readonly referenceIngestionService: ReferenceIngestionService;
  readonly referenceRepository: FileSystemReferenceRepository;
  readonly hostAddressResolver: FakeHostAddressResolver;
  readonly httpTransport: FakeHttpTransport;
  readonly githubApiRunner: FakeGithubApiRunner;
  readonly lessonsDirectory: string;
}

/**
 * The whole copying path with real files underneath and fakes at both edges — no
 * name lookup, no socket, no `gh`. Tests that care about one client build that
 * client on its own instead of coming through here.
 */
export async function ingestionTestBench(
  overrides: Partial<ReferenceIngestionServiceOptions> = {},
): Promise<IngestionTestBench> {
  const lessonsDirectory = await emptyLessonsDirectory();
  const referenceRepository = new FileSystemReferenceRepository(lessonsDirectory);
  const hostAddressResolver = new FakeHostAddressResolver();
  const httpTransport = new FakeHttpTransport();
  const githubApiRunner = new FakeGithubApiRunner();

  const safeHttpClient = new SafeHttpClient(
    new RequestTargetGuard(hostAddressResolver),
    httpTransport,
  );

  const referenceIngestionService = new ReferenceIngestionService({
    referenceRepository,
    urlReferenceClient: new UrlReferenceClient(safeHttpClient, new TagStrippingHtmlTextExtractor()),
    githubReferenceClient: new GithubReferenceClient(githubApiRunner),
    pastedTextReferenceClient: new PastedTextReferenceClient(),
    now: () => new Date("2024-05-01T10:00:00.000Z"),
    createReferenceId: countingReferenceIds(),
    ...overrides,
  });

  return {
    referenceIngestionService,
    referenceRepository,
    hostAddressResolver,
    httpTransport,
    githubApiRunner,
    lessonsDirectory,
  };
}

function countingReferenceIds(): () => string {
  let nextNumber = 1;
  return () => `reference-${String(nextNumber++).padStart(4, "0")}`;
}
