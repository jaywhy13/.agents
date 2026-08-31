import type { SpeechRequest, SpokenAudio } from "../../../src/voice/proxy-speech-client.ts";
import { SPOKEN_AUDIO_MIME_TYPE } from "../../../src/voice/proxy-speech-client.ts";
import type { SpeechForNarration } from "../../../src/voice/narration-voice-service.ts";

/**
 * Speaks without a network. It records every line it was asked for, which is how a
 * test tells a cache hit from a second call to the proxy.
 */
export class FakeSpeechClient implements SpeechForNarration {
  readonly spokenTexts: string[] = [];
  readonly longestTextCharacters: number;
  defaultSpeechModel = "gpt-4o-mini-tts";
  defaultSpeechVoice = "alloy";

  private nextFailure: Error | null = null;

  constructor(longestTextCharacters = 900) {
    this.longestTextCharacters = longestTextCharacters;
  }

  get callCount(): number {
    return this.spokenTexts.length;
  }

  /** Makes the next `speak` fail, the way a proxy outage would. */
  failNextCall(cause: Error): void {
    this.nextFailure = cause;
  }

  async speak(request: SpeechRequest): Promise<SpokenAudio> {
    const failure = this.nextFailure;
    this.nextFailure = null;
    if (failure !== null) {
      throw failure;
    }

    this.spokenTexts.push(request.text);
    return {
      // Audio the test can trace back to the words that produced it.
      audio: new TextEncoder().encode(`spoken:${request.text}`),
      mimeType: SPOKEN_AUDIO_MIME_TYPE,
      model: (request.model ?? this.defaultSpeechModel) as SpokenAudio["model"],
      voice: (request.voice ?? this.defaultSpeechVoice) as SpokenAudio["voice"],
    };
  }
}

export function spokenTextOf(audio: Uint8Array<ArrayBufferLike>): string {
  return new TextDecoder().decode(audio).replace(/^spoken:/, "");
}
