import {
  createAgentSession,
  DefaultResourceLoader,
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
export function createPiTeachingAgentSessionFactory(): TeachingAgentSessionFactory {
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

    const { session } = await createAgentSession({
      cwd: scratchDirectory,
      resourceLoader,
      tools: [...TEACHING_TOOL_NAMES],
      customTools: createTeachingTools(options.toolHandlers),
      sessionManager: SessionManager.inMemory(scratchDirectory),
    });

    return {
      prompt: (text: string) => session.prompt(text),
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
