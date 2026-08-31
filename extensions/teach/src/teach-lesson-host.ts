import type { NarrationBeat } from "../shared/beat.ts";
import { createReferenceModule } from "./references/index.ts";
import { ConnectionHub } from "./server/connection-hub.ts";
import type { LessonImagePort } from "./server/lesson-media.ts";
import {
  LessonServer,
  LessonServerStoppedError,
  type RunningLessonServer,
} from "./server/lesson-server.ts";
import { StaticAssetRepository } from "./server/static-asset-repository.ts";
import type { IllustrationDrawerFactory } from "./services/lesson-illustrator.ts";
import { LessonRepository } from "./services/lesson-repository.ts";
import type { TeachingAgentSessionFactory } from "./services/teaching-agent-session.ts";
import { TeachingLessonConductor } from "./services/teaching-lesson-conductor.ts";
import type { Environment } from "./proxy/shopify-proxy-credential.ts";
import { readProxyCredential } from "./proxy/shopify-proxy-credential.ts";
import { LessonVoiceAdapter } from "./voice/lesson-voice-adapter.ts";
import { createTeachVoice } from "./voice/index.ts";
import { illustrationIdFor, IllustrationService } from "./visuals/illustration-service.ts";
import { LessonImageRepository } from "./visuals/lesson-image-repository.ts";
import { ShopifyAiProxyImageClient } from "./visuals/shopify-ai-proxy-image-client.ts";

export interface TeachLessonHostOptions {
  readonly lessonsDirectory: string;
  readonly publicDirectory: string;
  readonly createTeachingAgentSession: TeachingAgentSessionFactory;
  /**
   * Where the Shopify AI Proxy credential is read from. Voice and pictures are both
   * built only when it is there; without it the lesson still teaches and says so.
   */
  readonly environment?: Environment;
  /** Injected so no test ever reaches the proxy. */
  readonly fetchImplementation?: typeof fetch;
  readonly onError?: (error: Error) => void;
}

/**
 * Ties the lesson pieces together and owns their lifetime. One host lives for one
 * pi session: `/teach` starts it, session shutdown stops it. Stopping is safe to
 * call more than once; starting again after a stop is refused, because the pieces
 * underneath cannot be reopened. `/teach` builds a new host instead.
 *
 * This is where the two optional halves of the lesson are decided. Voice and drawn
 * pictures both need the Shopify AI Proxy credential, so both are built here or not
 * at all — the layers below take a `null` rather than a flag, so nothing deeper has
 * to know why they are missing.
 */
export class TeachLessonHost {
  private readonly connectionHub = new ConnectionHub();
  private readonly conductor: TeachingLessonConductor;
  private readonly lessonServer: LessonServer;
  private readonly voiceAdapter: LessonVoiceAdapter;
  private readonly illustrationDrawer: IllustrationDrawerFactory | null;
  private startingServer: Promise<RunningLessonServer> | null = null;
  private runningServer: RunningLessonServer | null = null;
  private hasStopped = false;

  constructor(options: TeachLessonHostOptions) {
    const environment = options.environment ?? process.env;
    const fetchImplementation = options.fetchImplementation ?? fetch;
    const lessonRepository = new LessonRepository(options.lessonsDirectory);
    const imageRepository = new LessonImageRepository(options.lessonsDirectory);

    // Built before the conductor, which needs to tell it when a lesson is retired.
    this.voiceAdapter = new LessonVoiceAdapter({
      voice: createTeachVoice(environment, fetchImplementation),
      findNarrationBeat: (beatId) => this.findNarrationBeat(beatId),
    });

    this.illustrationDrawer = illustrationDrawerFactory({
      environment,
      fetchImplementation,
      imageRepository,
    });

    this.conductor = new TeachingLessonConductor({
      lessonRepository,
      beatBroadcaster: this.connectionHub,
      createTeachingAgentSession: options.createTeachingAgentSession,
      references: createReferenceModule({
        lessonsDirectory: options.lessonsDirectory,
        // The learner's own `gh` when they have it, so a repository only they can see
        // works too; the public GitHub API otherwise.
        preferGithubCommand: true,
      }),
      createIllustrationDrawer: this.illustrationDrawer,
      // A lesson that has been closed will never be spoken again, so its audio is
      // let go rather than held for the rest of the pi session.
      onLessonRetired: (lessonId) => this.voiceAdapter.forgetLesson(lessonId),
      ...(options.onError === undefined ? {} : { onError: options.onError }),
    });

    this.lessonServer = new LessonServer({
      conductor: this.conductor,
      connectionHub: this.connectionHub,
      staticAssetRepository: new StaticAssetRepository(options.publicDirectory),
      voice: this.voiceAdapter,
      images: this.lessonImagePort(imageRepository),
      ...(options.onError === undefined ? {} : { onError: options.onError }),
    });
  }

  get running(): RunningLessonServer | null {
    return this.runningServer;
  }

  /** True when this pi session has the credential voice needs. */
  get hasVoice(): boolean {
    return this.voiceAdapter.isAvailable;
  }

  /**
   * True when this pi session has the credential pictures need. It is the same
   * credential voice needs, so this and `hasVoice` always agree.
   */
  get canDrawPictures(): boolean {
    return this.illustrationDrawer !== null;
  }

  async start(): Promise<RunningLessonServer> {
    if (this.hasStopped) {
      throw new LessonServerStoppedError();
    }
    if (this.runningServer !== null) {
      return this.runningServer;
    }
    // Two quick `/teach` runs must not start two servers.
    this.startingServer ??= this.lessonServer.start();
    const started = await this.startingServer;
    // A stop may have landed while the server was still coming up.
    if (this.hasStopped) {
      throw new LessonServerStoppedError();
    }
    this.runningServer = started;
    return started;
  }

  setSuggestedTopic(topic: string | null): void {
    this.lessonServer.setSuggestedTopic(topic);
  }

  async stop(): Promise<void> {
    if (this.hasStopped) {
      return;
    }
    this.hasStopped = true;

    // A start that is still in flight has to finish before the pieces it is opening
    // can be closed, or it would leave a listening socket behind.
    const pendingStart = this.startingServer;
    this.startingServer = null;
    this.runningServer = null;
    if (pendingStart !== null) {
      await pendingStart.catch(() => {});
    }

    // Disposing retires the lesson, which is what lets go of its spoken audio.
    await this.conductor.dispose();
    await this.lessonServer.stop();
  }

  /** The image bytes route reads through the lesson that is open, and no other. */
  private lessonImagePort(imageRepository: LessonImageRepository): LessonImagePort {
    return {
      readBytes: async (illustrationId) => {
        const lessonId = await this.currentLessonId();
        if (lessonId === null) {
          return null;
        }
        return imageRepository.readBytes(lessonId, illustrationId);
      },
    };
  }

  private async currentLessonId(): Promise<string | null> {
    const transcript = await this.conductor.getTranscript().catch(() => null);
    return transcript?.metadata.lessonId ?? null;
  }

  private async findNarrationBeat(
    beatId: string,
  ): Promise<{ readonly lessonId: string; readonly beat: NarrationBeat } | null> {
    const transcript = await this.conductor.getTranscript().catch(() => null);
    if (transcript === null) {
      return null;
    }
    for (const beat of transcript.beats) {
      if (beat.kind === "narration" && beat.beatId === beatId) {
        return { lessonId: transcript.metadata.lessonId, beat };
      }
    }
    return null;
  }
}

/**
 * Builds the picture drawer, or nothing at all.
 *
 * `ShopifyAiProxyImageClient` refuses to be built without a credential, which is the
 * right behaviour for a client and the wrong behaviour for `/teach`: a lesson without
 * pictures is still a lesson. So the credential is read here, and a missing one
 * becomes `null` — the teaching prompt then says the lesson cannot draw, and the tool
 * refuses plainly instead of failing a turn.
 *
 * It is the same credential the voice path reads, so voice and pictures are switched
 * on and off together rather than by different rules.
 */
function illustrationDrawerFactory(parts: {
  readonly environment: Environment;
  readonly fetchImplementation: typeof fetch;
  readonly imageRepository: LessonImageRepository;
}): IllustrationDrawerFactory | null {
  const authorizationHeaderValue = readProxyCredential(parts.environment);
  if (authorizationHeaderValue === null) {
    return null;
  }

  const imageClient = new ShopifyAiProxyImageClient({
    fetchImplementation: parts.fetchImplementation,
    authorizationHeaderValue,
  });

  return (publishState) => {
    const illustrationService = new IllustrationService({
      imageClient,
      imageRepository: parts.imageRepository,
      publishState,
      now: () => new Date(),
    });
    return {
      illustrationIdFor,
      illustrate: (lessonId, request) => illustrationService.illustrate(lessonId, request),
    };
  };
}
