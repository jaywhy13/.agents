/**
 * Captures what the learner says, using the browser's own MediaRecorder.
 *
 * The recording is sent to the lesson server exactly as the browser produced it:
 * WebM/Opus on Chrome and Firefox, MP4/AAC on Safari. Nothing is transcoded in the
 * page, because the transcription route decodes all of them and a decoder in the
 * page would be a large dependency for no gain.
 *
 * A recording ends in one of four ways: the learner stops it, it reaches the time
 * limit, it reaches the size limit, or the browser's recorder fails. All four end
 * the same way here — the microphone track is stopped and the outcome is settled
 * once — because the three the learner did not ask for are exactly the ones that
 * used to leave the page waiting.
 *
 * Two rules hold, and both are load-bearing:
 *
 * - **The microphone is released the moment the recorder goes inactive**, not when
 *   the caller next asks for the recording. A page that leaves a track open leaves
 *   the browser's recording indicator on, which reads as the lesson listening when
 *   it is not — and a recording that stopped itself at sixty seconds may not be
 *   collected for minutes.
 * - **Asking for the recording always settles.** The stop handler is attached when
 *   the recording starts rather than when it is collected, so a recording that has
 *   already stopped is handed over at once instead of waiting for a `stop` event
 *   that the browser has already fired and will never fire again. That wait was a
 *   transcription that never finished.
 */

import {
  LARGEST_RECORDING_BYTES,
  LONGEST_RECORDING_MILLISECONDS,
  PREFERRED_RECORDING_MIME_TYPES,
  RECORDING_CHUNK_MILLISECONDS,
  SHORTEST_USEFUL_RECORDING_BYTES,
} from "./browser-voice-limits.ts";

export class MicrophoneUnavailableError extends Error {
  constructor(message: string, options?: { cause: unknown }) {
    super(message, options);
    this.name = "MicrophoneUnavailableError";
  }
}

export class RecordingTooShortError extends Error {
  constructor(byteLength: number) {
    super(`That recording is only ${byteLength} bytes. Hold Space a little longer.`);
    this.name = "RecordingTooShortError";
  }
}

export type RecordingStopReason = "learner_stopped" | "reached_time_limit" | "reached_size_limit";

export interface Recording {
  readonly audio: Blob;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly stopReason: RecordingStopReason;
}

/** Lets a test stand in for `navigator.mediaDevices`, `MediaRecorder` and the clock. */
export interface RecordingEnvironment {
  requestMicrophone(): Promise<MediaStream>;
  createRecorder(stream: MediaStream, mimeType: string): MediaRecorder;
  isMimeTypeSupported(mimeType: string): boolean;
  /**
   * Schedules the time limit and hands back the way to cancel it. Injected so the
   * limit stays the real sixty seconds and a test never waits for it.
   */
  startTimer(runWhenDue: () => void, milliseconds: number): () => void;
}

export function browserRecordingEnvironment(): RecordingEnvironment {
  return {
    requestMicrophone: () => navigator.mediaDevices.getUserMedia({ audio: true }),
    createRecorder: (stream, mimeType) => new MediaRecorder(stream, { mimeType }),
    isMimeTypeSupported: (mimeType) => MediaRecorder.isTypeSupported(mimeType),
    startTimer: (runWhenDue, milliseconds) => {
      const timer = setTimeout(runWhenDue, milliseconds);
      return () => clearTimeout(timer);
    },
  };
}

export function isMicrophoneCaptureSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    navigator.mediaDevices !== undefined
  );
}

export class MicrophoneRecorder {
  private readonly environment: RecordingEnvironment;
  private session: RecordingSession | null = null;

  constructor(environment: RecordingEnvironment = browserRecordingEnvironment()) {
    this.environment = environment;
  }

  /**
   * True only while the microphone is actually open. A recording that stopped
   * itself at a limit is over, even though nobody has collected it yet.
   */
  get isRecording(): boolean {
    return this.session !== null && this.session.isCapturing;
  }

  /**
   * Opens the microphone and starts recording. Asking again while a recording is
   * running is a bug in the caller, not a second recording.
   */
  async start(): Promise<void> {
    if (this.session !== null) {
      throw new MicrophoneUnavailableError("A recording is already running.");
    }

    const mimeType = this.firstSupportedMimeType();

    let stream: MediaStream;
    try {
      stream = await this.environment.requestMicrophone();
    } catch (cause) {
      throw new MicrophoneUnavailableError(
        "The microphone is not available. Check the browser's permission for this page.",
        { cause },
      );
    }

    try {
      this.session = new RecordingSession({
        recorder: this.environment.createRecorder(stream, mimeType),
        stream,
        mimeType,
        startTimer: (runWhenDue, milliseconds) =>
          this.environment.startTimer(runWhenDue, milliseconds),
      });
    } catch (cause) {
      stopEveryTrack(stream);
      throw new MicrophoneUnavailableError("The browser could not start recording.", { cause });
    }
  }

  /** Stops recording and hands back what was captured. */
  async stop(): Promise<Recording> {
    const session = this.takeSession();
    if (session === null) {
      throw new MicrophoneUnavailableError("There is no recording to stop.");
    }

    const recording = await session.finish();
    if (recording.byteLength < SHORTEST_USEFUL_RECORDING_BYTES) {
      throw new RecordingTooShortError(recording.byteLength);
    }
    return recording;
  }

  /** Throws the recording away. Safe to call when nothing is recording. */
  cancel(): void {
    this.takeSession()?.discard();
  }

  private takeSession(): RecordingSession | null {
    const session = this.session;
    this.session = null;
    return session;
  }

  private firstSupportedMimeType(): string {
    for (const mimeType of PREFERRED_RECORDING_MIME_TYPES) {
      if (this.environment.isMimeTypeSupported(mimeType)) {
        return mimeType;
      }
    }
    throw new MicrophoneUnavailableError(
      `This browser records none of: ${PREFERRED_RECORDING_MIME_TYPES.join(", ")}.`,
    );
  }
}

interface RecordingSessionParts {
  readonly recorder: MediaRecorder;
  readonly stream: MediaStream;
  readonly mimeType: string;
  readonly startTimer: (runWhenDue: () => void, milliseconds: number) => () => void;
}

/** One recording, from the first chunk to the blob. Owns the track and the timer. */
class RecordingSession {
  private readonly recorder: MediaRecorder;
  private readonly stream: MediaStream;
  private readonly mimeType: string;
  private readonly cancelTimeLimit: () => void;
  private readonly chunks: Blob[] = [];
  private capturedBytes = 0;
  private stopReason: RecordingStopReason = "learner_stopped";
  /** Set when the browser's own recorder failed, so `finish` reports it. */
  private failure: Error | null = null;
  private hasReleasedHardware = false;
  private settleEnded: (() => void) | null = null;
  private readonly ended: Promise<void>;

  constructor(parts: RecordingSessionParts) {
    this.recorder = parts.recorder;
    this.stream = parts.stream;
    this.mimeType = parts.mimeType;

    this.ended = new Promise<void>((resolve) => {
      this.settleEnded = resolve;
    });

    // Both handlers are attached before the recorder is started, so a recording
    // that ends on its own is complete and released without anyone asking.
    this.recorder.ondataavailable = (event: BlobEvent) => this.collect(event.data);
    this.recorder.onstop = () => this.noteEnded();
    this.recorder.onerror = () => {
      this.failure = new MicrophoneUnavailableError(
        "The browser's recorder stopped working, so nothing was recorded.",
      );
      this.stopRecorder();
      this.noteEnded();
    };

    this.cancelTimeLimit = parts.startTimer(() => {
      this.stopReason = "reached_time_limit";
      this.stopRecorder();
    }, LONGEST_RECORDING_MILLISECONDS);

    this.recorder.start(RECORDING_CHUNK_MILLISECONDS);
  }

  get isCapturing(): boolean {
    return !this.hasReleasedHardware;
  }

  /**
   * Waits for the recorder to go inactive and hands over what was captured. A
   * recording that has already stopped is handed over without any waiting.
   */
  async finish(): Promise<Recording> {
    this.stopRecorder();
    await this.ended;

    if (this.failure !== null) {
      throw this.failure;
    }

    const audio = new Blob(this.chunks, { type: this.mimeType });
    return {
      audio,
      mimeType: this.mimeType,
      byteLength: audio.size,
      stopReason: this.stopReason,
    };
  }

  discard(): void {
    this.stopRecorder();
    this.noteEnded();
    this.chunks.length = 0;
  }

  private collect(chunk: Blob): void {
    if (chunk.size === 0 || this.hasReleasedHardware) {
      return;
    }
    if (this.capturedBytes + chunk.size > LARGEST_RECORDING_BYTES) {
      this.stopReason = "reached_size_limit";
      this.stopRecorder();
      return;
    }
    this.capturedBytes += chunk.size;
    this.chunks.push(chunk);
  }

  private stopRecorder(): void {
    if (this.recorder.state !== "inactive") {
      this.recorder.stop();
      return;
    }
    // The browser has already finished with this recorder, so no `stop` event is
    // coming. Ending here is what keeps a collected recording from waiting for ever.
    this.noteEnded();
  }

  /**
   * The one place a recording ends, whatever ended it, and it runs its work once.
   * Everything after this point — a late chunk, a second cancel, the learner
   * pressing Space on a recording that stopped itself — finds the work already done.
   */
  private noteEnded(): void {
    if (this.hasReleasedHardware) {
      return;
    }
    this.hasReleasedHardware = true;

    this.cancelTimeLimit();
    this.recorder.ondataavailable = null;
    this.recorder.onstop = null;
    this.recorder.onerror = null;
    stopEveryTrack(this.stream);

    this.settleEnded?.();
    this.settleEnded = null;
  }
}

function stopEveryTrack(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
