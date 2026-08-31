/**
 * Decides what the lesson says out loud, and hands back the audio for it.
 *
 * This is the service layer for voice: it owns the rule that narration is spoken
 * as short lines, the rule that the same words are only paid for once, and the
 * rule that a failure is a failure. It never returns stand-in audio, never returns
 * an empty buffer as if it were speech, and never caches a failed attempt — a beat
 * that could not be spoken is reported so the page can show the words instead.
 *
 * The speech client and the cache are constructor dependencies, so a test drives
 * this with a fake client and no network at all.
 */

import type { NarrationChunk } from "../../shared/beat.ts";
import type { NarrationAudioCache } from "./narration-audio-cache.ts";
import { narrationAudioKey } from "./narration-audio-cache.ts";
import { speechTextForNarration, splitIntoSpeechLines } from "./narration-speech-text.ts";
import type { SpeechRequest, SpokenAudio } from "./proxy-speech-client.ts";
import { SPOKEN_AUDIO_MIME_TYPE } from "./proxy-speech-client.ts";
import { NarrationAudioUnavailableError } from "./voice-errors.ts";
import type { AudioBytes } from "./voice-limits.ts";

/**
 * What this service needs from something that can speak. `ProxySpeechClient`
 * satisfies it; a test satisfies it with no network. The service owns the shape,
 * so the dependency arrow points inward.
 */
export interface SpeechForNarration {
  readonly longestTextCharacters: number;
  readonly defaultSpeechModel: string;
  readonly defaultSpeechVoice: string;
  speak(request: SpeechRequest): Promise<SpokenAudio>;
}

export interface NarrationRequest {
  readonly lessonId: string;
  /** The beat these words speak, so the cache and the page agree on what is playing. */
  readonly beatId: string;
  readonly chunks: readonly NarrationChunk[];
}

/** One short line of a beat, in the order it is spoken. */
export interface NarratedLine {
  readonly lineIndex: number;
  readonly text: string;
  readonly audio: AudioBytes;
  readonly mimeType: typeof SPOKEN_AUDIO_MIME_TYPE;
  readonly cacheKey: string;
  readonly servedFromCache: boolean;
}

export interface NarratedBeat {
  readonly lessonId: string;
  readonly beatId: string;
  readonly lines: readonly NarratedLine[];
}

/** One line's audio plus how it was obtained. Internal to the service. */
interface LineAudio {
  readonly audio: AudioBytes;
  readonly model: string;
  readonly voice: string;
  readonly servedFromCache: boolean;
}

export class NarrationVoiceService {
  private readonly speechClient: SpeechForNarration;
  private readonly audioCache: NarrationAudioCache;

  constructor(speechClient: SpeechForNarration, audioCache: NarrationAudioCache) {
    this.speechClient = speechClient;
    this.audioCache = audioCache;
  }

  /**
   * Speaks a whole beat, line by line, in order. Throws as soon as one line cannot
   * be spoken: half a beat read aloud is worse than a beat the page says it could
   * not read. Lines already spoken stay cached and cost nothing on the retry.
   */
  async narrateBeat(request: NarrationRequest): Promise<NarratedBeat> {
    const lines: NarratedLine[] = [];

    for (const [lineIndex, text] of this.speechLinesFor(request.chunks).entries()) {
      lines.push(await this.narrateLine(request, lineIndex, text));
    }

    return { lessonId: request.lessonId, beatId: request.beatId, lines };
  }

  /** Drops every cached line for a lesson that has closed. */
  forgetLesson(lessonId: string): void {
    this.audioCache.forgetLesson(lessonId);
  }

  private speechLinesFor(chunks: readonly NarrationChunk[]): readonly string[] {
    return splitIntoSpeechLines(
      speechTextForNarration(chunks),
      this.speechClient.longestTextCharacters,
    );
  }

  private async narrateLine(
    request: NarrationRequest,
    lineIndex: number,
    text: string,
  ): Promise<NarratedLine> {
    const spoken = await this.speakOrFail(request, text);
    const cacheKey = this.cacheKeyFor(request, text, spoken.model, spoken.voice);

    return {
      lineIndex,
      text,
      audio: spoken.audio,
      mimeType: SPOKEN_AUDIO_MIME_TYPE,
      cacheKey,
      servedFromCache: spoken.servedFromCache,
    };
  }

  /**
   * The cache is read with the configured model and voice, and written with the
   * ones the client reports it actually used, so a per-line override can never be
   * read back as if it were the default voice.
   */
  private async speakOrFail(request: NarrationRequest, text: string): Promise<LineAudio> {
    const defaultModel = this.speechClient.defaultSpeechModel;
    const defaultVoice = this.speechClient.defaultSpeechVoice;

    const cachedAudio = this.audioCache.get(
      this.cacheKeyFor(request, text, defaultModel, defaultVoice),
    );
    if (cachedAudio !== null) {
      return {
        audio: cachedAudio,
        model: defaultModel,
        voice: defaultVoice,
        servedFromCache: true,
      };
    }

    let spoken: SpokenAudio;
    try {
      spoken = await this.speechClient.speak({ text });
    } catch (cause) {
      throw new NarrationAudioUnavailableError(request.lessonId, request.beatId, { cause });
    }

    this.audioCache.set(this.cacheKeyFor(request, text, spoken.model, spoken.voice), spoken.audio);
    return {
      audio: spoken.audio,
      model: spoken.model,
      voice: spoken.voice,
      servedFromCache: false,
    };
  }

  private cacheKeyFor(
    request: NarrationRequest,
    text: string,
    model: string,
    voice: string,
  ): string {
    return narrationAudioKey({
      lessonId: request.lessonId,
      beatId: request.beatId,
      text,
      model,
      voice,
    });
  }
}
