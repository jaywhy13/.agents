import type { TeachingToolHandlers } from "./teaching-tools.ts";

/**
 * The part of a pi agent session the lesson needs. Keeping it this small means the
 * teaching logic can be tested without a model and without the pi runtime.
 */
export interface TeachingAgentSession {
  prompt(text: string): Promise<void>;
  /** Stops the current turn at once, including any tool call in flight. */
  abort(): Promise<void>;
  dispose(): void;
  readonly isStreaming: boolean;
}

export interface TeachingAgentSessionOptions {
  readonly systemPrompt: string;
  /** What the lesson's tools are allowed to do. Nothing else is exposed. */
  readonly toolHandlers: TeachingToolHandlers;
}

export type TeachingAgentSessionFactory = (
  options: TeachingAgentSessionOptions,
) => Promise<TeachingAgentSession>;
