/**
 * Plays the lesson's narration, and stops the instant it is told to.
 *
 * "Stop" here means stop, not fade and not finish the current line. When the
 * learner presses Space the lesson has to fall silent before the microphone opens,
 * or the microphone records the lesson talking over itself.
 *
 * Each clip is played from an object URL, which is released as soon as the clip
 * ends, is replaced, or is stopped. An unreleased object URL keeps the whole audio
 * buffer alive for the life of the page.
 */

export type PlaybackEndReason = "finished" | "stopped" | "replaced" | "failed";

export interface PlaybackOutcome {
  readonly reason: PlaybackEndReason;
  readonly error?: Error;
}

/** Lets a test stand in for a real `HTMLAudioElement`. */
export interface AudioElementFactory {
  (): HTMLAudioElement;
}

export interface ObjectUrlFactory {
  create(audio: Blob): string;
  revoke(url: string): void;
}

export function browserObjectUrlFactory(): ObjectUrlFactory {
  return {
    create: (audio) => URL.createObjectURL(audio),
    revoke: (url) => URL.revokeObjectURL(url),
  };
}

export class AudioPlaybackController {
  private readonly createAudioElement: AudioElementFactory;
  private readonly objectUrls: ObjectUrlFactory;
  private current: CurrentClip | null = null;

  constructor(
    createAudioElement: AudioElementFactory = () => new Audio(),
    objectUrls: ObjectUrlFactory = browserObjectUrlFactory(),
  ) {
    this.createAudioElement = createAudioElement;
    this.objectUrls = objectUrls;
  }

  get isPlaying(): boolean {
    return this.current !== null && !this.current.element.paused;
  }

  get isPaused(): boolean {
    return this.current !== null && this.current.element.paused;
  }

  /**
   * Plays one clip and resolves when it ends, whatever ended it. Starting a clip
   * while another is playing replaces it, so lines never overlap.
   */
  async play(audio: Blob): Promise<PlaybackOutcome> {
    this.finishCurrent({ reason: "replaced" });

    const element = this.createAudioElement();
    const objectUrl = this.objectUrls.create(audio);
    element.src = objectUrl;

    return new Promise<PlaybackOutcome>((resolve) => {
      const clip: CurrentClip = { element, objectUrl, resolve };
      this.current = clip;

      element.onended = () => this.finishCurrent({ reason: "finished" });
      element.onerror = () =>
        this.finishCurrent({
          reason: "failed",
          error: new Error("The browser could not play the lesson's audio."),
        });

      void element.play().catch((cause: unknown) => {
        this.finishCurrent({ reason: "failed", error: asError(cause) });
      });
    });
  }

  pause(): void {
    this.current?.element.pause();
  }

  resume(): void {
    const element = this.current?.element;
    if (element === undefined || !element.paused) {
      return;
    }
    void element.play().catch((cause: unknown) => {
      this.finishCurrent({ reason: "failed", error: asError(cause) });
    });
  }

  /** Silence, now. Used by Space before the microphone opens. */
  stopNow(): void {
    this.finishCurrent({ reason: "stopped" });
  }

  dispose(): void {
    this.stopNow();
  }

  private finishCurrent(outcome: PlaybackOutcome): void {
    const clip = this.current;
    if (clip === null) {
      return;
    }
    this.current = null;

    clip.element.onended = null;
    clip.element.onerror = null;
    clip.element.pause();
    // Detaching the source stops the browser fetching or buffering the released URL.
    clip.element.removeAttribute("src");
    clip.element.load();
    this.objectUrls.revoke(clip.objectUrl);

    clip.resolve(outcome);
  }
}

interface CurrentClip {
  readonly element: HTMLAudioElement;
  readonly objectUrl: string;
  readonly resolve: (outcome: PlaybackOutcome) => void;
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
