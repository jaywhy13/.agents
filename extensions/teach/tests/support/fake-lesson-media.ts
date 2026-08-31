import type {
  LessonImagePort,
  LessonVoicePort,
  NarrationAudioOutcome,
  TranscriptionOutcome,
  TranscriptionRequestFromPage,
} from "../../src/server/lesson-media.ts";

/**
 * Stands in for voice, so a route test is about the address, the body limits, and
 * the status codes — never about the proxy. `isAvailable` false is the "no
 * credential" lesson, which is a first-class case rather than an error.
 */
export class FakeLessonVoice implements LessonVoicePort {
  readonly transcribeRequests: TranscriptionRequestFromPage[] = [];
  readonly narrationRequests: string[] = [];

  isAvailable = true;
  transcriptionOutcome: TranscriptionOutcome = { kind: "transcribed", text: "Because it was busy." };
  narrationOutcome: NarrationAudioOutcome = {
    kind: "ready",
    audio: {
      beatId: "beat-1",
      mimeType: "audio/mpeg",
      lines: [{ lineIndex: 0, text: "A queue holds work.", audioBase64: "SUQz" }],
    },
  };
  /** Set to act like the proxy call itself throwing rather than refusing. */
  throwFromTranscribe: Error | null = null;

  async transcribe(request: TranscriptionRequestFromPage): Promise<TranscriptionOutcome> {
    this.transcribeRequests.push(request);
    if (this.throwFromTranscribe !== null) {
      throw this.throwFromTranscribe;
    }
    return this.transcriptionOutcome;
  }

  async narrationFor(beatId: string): Promise<NarrationAudioOutcome> {
    this.narrationRequests.push(beatId);
    return this.narrationOutcome;
  }
}

/** Stands in for the images on disk. */
export class FakeLessonImages implements LessonImagePort {
  readonly requestedIllustrationIds: string[] = [];
  bytesByIllustrationId = new Map<string, Uint8Array>();

  async readBytes(illustrationId: string): Promise<Uint8Array | null> {
    this.requestedIllustrationIds.push(illustrationId);
    return this.bytesByIllustrationId.get(illustrationId) ?? null;
  }
}
