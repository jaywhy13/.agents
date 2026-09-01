import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import type {
  TeachingAgentSession,
  TeachingAgentSessionFactory,
  TeachingAgentSessionOptions,
} from "./teaching-agent-session.ts";
import { createTeachingTools, TEACHING_TOOL_NAMES } from "./teaching-tools.ts";
import {
  createTeachingScratchDirectory,
  removeTeachingScratchDirectory,
} from "./teaching-scratch-directory.ts";
import type { TeachingSessionConfiguration } from "./teaching-session-configuration.ts";

/**
 * Builds the dedicated pi agent session a lesson runs on.
 *
 * Three deliberate restrictions:
 * - `tools` lists only the teaching tools, so the lesson has no file, shell or edit
 *   tools and cannot touch the learner's machine while it teaches.
 * - discovery is pointed at empty scratch directories, so the learner's own
 *   extensions, skills and AGENTS.md files do not dilute the teaching prompt.
 * - the conversation is kept in memory, because the lesson itself is already
 *   stored as beats under the teach lessons directory.
 *
 * The scratch directory belongs to the session and is taken away with it.
 */
export function createPiTeachingAgentSessionFactory(
  configuration: TeachingSessionConfiguration,
): TeachingAgentSessionFactory {
  return async (options: TeachingAgentSessionOptions): Promise<TeachingAgentSession> => {
    const scratchDirectory = await createTeachingScratchDirectory();

    const resourceLoader = new DefaultResourceLoader({
      cwd: scratchDirectory,
      agentDir: scratchDirectory,
      systemPromptOverride: () => options.systemPrompt,
      agentsFilesOverride: () => ({ agentsFiles: [] }),
      skillsOverride: (current) => ({ skills: [], diagnostics: current.diagnostics }),
      promptsOverride: (current) => ({ prompts: [], diagnostics: current.diagnostics }),
    });
    await resourceLoader.reload();

    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    await modelRuntime.setRuntimeApiKey(configuration.model.provider, configuration.apiKey);
    const model = {
      ...configuration.model,
      ...(configuration.baseUrl === undefined ? {} : { baseUrl: configuration.baseUrl }),
      headers: {
        ...configuration.model.headers,
        ...headersWithoutNulls(configuration.headers),
      },
    };

    const { session } = await createAgentSession({
      cwd: scratchDirectory,
      resourceLoader,
      modelRuntime,
      model,
      ...(configuration.thinkingLevel === undefined
        ? {}
        : { thinkingLevel: configuration.thinkingLevel }),
      tools: [...TEACHING_TOOL_NAMES],
      customTools: createTeachingTools(options.toolHandlers),
      sessionManager: SessionManager.inMemory(scratchDirectory),
    });

    return {
      prompt: async (text: string) => {
        const firstNewMessage = session.state.messages.length;
        await session.prompt(text);
        throwForFailedTeachingTurn(session.state.messages.slice(firstNewMessage));
      },
      abort: () => session.abort(),
      dispose: () => {
        session.dispose();
        // Removal never rejects, so this cannot leave an unhandled rejection
        // behind while the lesson is being closed.
        void removeTeachingScratchDirectory(scratchDirectory);
      },
      get isStreaming(): boolean {
        return session.isStreaming;
      },
    };
  };
}

/** Pi resolves provider failures as assistant messages, so turn callers must inspect them. */
export function throwForFailedTeachingTurn(messages: readonly unknown[]): void {
  let calledTeachingTool = false;

  for (const message of messages) {
    if (!isRecord(message) || message.role !== "assistant") {
      continue;
    }
    if (message.stopReason === "aborted") {
      return;
    }
    if (message.stopReason === "error") {
      const detail =
        typeof message.errorMessage === "string" && message.errorMessage.trim().length > 0
          ? message.errorMessage
          : "The teaching model failed without an error message.";
      throw new Error(detail);
    }

    const content = message.content;
    if (!Array.isArray(content)) {
      continue;
    }
    calledTeachingTool ||= content.some(
      (part) =>
        isRecord(part) &&
        part.type === "toolCall" &&
        typeof part.name === "string" &&
        (TEACHING_TOOL_NAMES as readonly string[]).includes(part.name),
    );
  }

  if (!calledTeachingTool) {
    throw new Error("The teaching model returned no lesson content.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function headersWithoutNulls(
  headers: Readonly<Record<string, string | null>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter((entry): entry is [string, string] => entry[1] !== null),
  );
}
