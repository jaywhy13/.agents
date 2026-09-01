import { lessonBasePath } from "../../../shared/lesson-route.ts";
import type { Recording } from "./microphone-recorder.ts";

/**
 * The page's side of the two voice addresses.
 *
 * Every address is built from the address this page was served at, so the lesson
 * token stays in the path and is never written down anywhere the browser would send
 * it to another program on this machine. The recording goes to the lesson server and
 * nowhere else; the lesson server is the only thing that speaks to the proxy.
 */

export interface NarrationLineAudio {
  readonly lineIndex: number;
  readonly text: string;
  readonly audio: Blob;
}

export type NarrationFetchOutcome =
  | { readonly kind: "ready"; readonly lines: readonly NarrationLineAudio[] }
  /** This lesson has no voice at all. The page says so once and stops asking. */
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "failed"; readonly reason: string };

interface NarrationAudioReply {
  readonly beatId: string;
  readonly mimeType: string;
  readonly lines: ReadonlyArray<{
    readonly lineIndex: number;
    readonly text: string;
    readonly audioBase64: string;
  }>;
}

export class LessonVoiceTransport {
  private readonly basePath: string;

  constructor(basePath: string = lessonBasePath(window.location.pathname)) {
    this.basePath = basePath;
  }

  /** Sends the recording to the lesson server and returns what was heard. */
  async transcribe(recording: Recording): Promise<string> {
    const response = await fetch(`${this.basePath}api/voice/transcribe`, {
      method: "POST",
      headers: { "Content-Type": recording.mimeType },
      body: recording.audio,
    });

    if (!response.ok) {
      throw new Error(await refusalReason(response, "That recording could not be written down."));
    }

    const reply = (await response.json()) as { text?: unknown };
    if (typeof reply.text !== "string") {
      throw new Error("The lesson server answered without a transcript.");
    }
    return reply.text;
  }

  /**
   * Asks for the spoken lines of one narration beat. A refusal is an outcome, not an
   * exception: the page carries on showing the words either way.
   */
  async narrationFor(beatId: string): Promise<NarrationFetchOutcome> {
    let response: Response;
    try {
      response = await fetch(`${this.basePath}api/voice/narration/${encodeURIComponent(beatId)}`);
    } catch (cause) {
      return { kind: "failed", reason: messageFor(cause) };
    }

    if (response.status === 503) {
      return { kind: "unavailable", reason: await refusalReason(response, "Voice is off.") };
    }
    if (!response.ok) {
      return {
        kind: "failed",
        reason: await refusalReason(response, "The lesson could not be read out loud."),
      };
    }

    try {
      const reply = (await response.json()) as NarrationAudioReply;
      return {
        kind: "ready",
        lines: reply.lines.map((line) => ({
          lineIndex: line.lineIndex,
          text: line.text,
          audio: new Blob([base64ToBytes(line.audioBase64).buffer as ArrayBuffer], {
            type: reply.mimeType,
          }),
        })),
      };
    } catch (cause) {
      return { kind: "failed", reason: messageFor(cause) };
    }
  }
}

async function refusalReason(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => "");
  return text.trim().length === 0 ? `${fallback} (${response.status})` : text.trim();
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function messageFor(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
