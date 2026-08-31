import type { RecordingEnvironment } from "../../../frontend/src/voice/microphone-recorder.ts";
import { PREFERRED_RECORDING_MIME_TYPES } from "../../../frontend/src/voice/browser-voice-limits.ts";

/**
 * A microphone, a recorder and a timer that a test drives by hand.
 *
 * The real `MediaRecorder` is the only part of the recorder that needs a browser,
 * so it is stood in for wholesale. The stand-in keeps the two orderings the browser
 * guarantees and that the recorder depends on: the last `dataavailable` is handed
 * over before `stop` is reported, and neither is reported after the recorder has
 * gone inactive.
 */
export class FakeMediaRecorder {
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  startCount = 0;
  stopCount = 0;
  timesliceMilliseconds: number | null = null;
  /** A final chunk the browser hands over as the recorder stops, if a test wants one. */
  finalChunk: Blob | null = null;

  readonly mimeType: string;

  constructor(mimeType: string) {
    this.mimeType = mimeType;
  }

  start(timesliceMilliseconds: number): void {
    this.startCount += 1;
    this.timesliceMilliseconds = timesliceMilliseconds;
    this.state = "recording";
  }

  stop(): void {
    this.stopCount += 1;
    if (this.state === "inactive") {
      return;
    }
    this.state = "inactive";
    if (this.finalChunk !== null) {
      this.ondataavailable?.({ data: this.finalChunk });
    }
    this.onstop?.();
  }

  /** What the browser does every `RECORDING_CHUNK_MILLISECONDS` while recording. */
  handOverChunk(chunk: Blob): void {
    this.ondataavailable?.({ data: chunk });
  }

  reportError(message: string): void {
    this.state = "inactive";
    this.onerror?.({ error: new Error(message) });
  }

  get asMediaRecorder(): MediaRecorder {
    return this as unknown as MediaRecorder;
  }
}

export class FakeMicrophoneTrack {
  stopCount = 0;

  stop(): void {
    this.stopCount += 1;
  }
}

export class FakeMicrophoneStream {
  readonly tracks: FakeMicrophoneTrack[] = [new FakeMicrophoneTrack()];

  getTracks(): FakeMicrophoneTrack[] {
    return this.tracks;
  }

  get asMediaStream(): MediaStream {
    return this as unknown as MediaStream;
  }
}

export interface ScheduledTimer {
  readonly milliseconds: number;
  fire(): void;
  readonly wasCancelled: boolean;
}

export class FakeRecordingEnvironment implements RecordingEnvironment {
  readonly stream = new FakeMicrophoneStream();
  readonly timers: ScheduledTimer[] = [];
  recorder: FakeMediaRecorder | null = null;
  microphoneRequestCount = 0;
  /** Set to refuse the microphone, the way a denied permission does. */
  refuseMicrophone: Error | null = null;
  /** Set to refuse to build a recorder, the way an unusable container does. */
  refuseRecorder: Error | null = null;
  supportedMimeTypes: readonly string[] = PREFERRED_RECORDING_MIME_TYPES;

  async requestMicrophone(): Promise<MediaStream> {
    this.microphoneRequestCount += 1;
    if (this.refuseMicrophone !== null) {
      throw this.refuseMicrophone;
    }
    return this.stream.asMediaStream;
  }

  createRecorder(_stream: MediaStream, mimeType: string): MediaRecorder {
    if (this.refuseRecorder !== null) {
      throw this.refuseRecorder;
    }
    const recorder = new FakeMediaRecorder(mimeType);
    this.recorder = recorder;
    return recorder.asMediaRecorder;
  }

  isMimeTypeSupported(mimeType: string): boolean {
    return this.supportedMimeTypes.includes(mimeType);
  }

  startTimer(runWhenDue: () => void, milliseconds: number): () => void {
    let wasCancelled = false;
    const timer: ScheduledTimer = {
      milliseconds,
      fire: () => {
        if (!wasCancelled) {
          runWhenDue();
        }
      },
      get wasCancelled(): boolean {
        return wasCancelled;
      },
    };
    this.timers.push(timer);
    return () => {
      wasCancelled = true;
    };
  }

  /** The recorder the test just started. Fails loudly rather than returning null. */
  get startedRecorder(): FakeMediaRecorder {
    if (this.recorder === null) {
      throw new Error("No recorder has been created yet.");
    }
    return this.recorder;
  }

  get timeLimitTimer(): ScheduledTimer {
    const timer = this.timers[0];
    if (timer === undefined) {
      throw new Error("No timer has been scheduled yet.");
    }
    return timer;
  }

  get stoppedTrackCount(): number {
    return this.stream.tracks.filter((track) => track.stopCount > 0).length;
  }

  get trackStopCalls(): number {
    return this.stream.tracks.reduce((total, track) => total + track.stopCount, 0);
  }
}

/**
 * A chunk of recorded audio of a given size. Real bytes, because the recorder joins
 * the chunks into one blob and reports that blob's own size.
 */
export function chunkOfBytes(byteLength: number): Blob {
  return new Blob([new Uint8Array(byteLength)], { type: "audio/webm" });
}
