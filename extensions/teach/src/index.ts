import path from "node:path";
import { fileURLToPath } from "node:url";

import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";

import { openLessonInBrowser } from "./browser-opener.ts";
import { LatestNotifier } from "./latest-notifier.ts";
import { describeMissingPrerequisites, inspectSetup } from "./setup-prerequisites.ts";
import type { TeachLessonHost } from "./teach-lesson-host.ts";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIRECTORY = path.join(packageDirectory, "dist", "public");

export function lessonsDirectory(agentDirectory: string): string {
  return path.join(agentDirectory, "teach", "lessons");
}

/**
 * `/teach [topic]` opens a lesson page in the browser. The page is served by a
 * small web server on the loopback address, which lives as long as the pi session.
 */
export default function teachExtension(pi: ExtensionAPI): void {
  // The server is a long-lived resource, so it is only created when /teach runs,
  // never from this factory.
  let lessonHost: TeachLessonHost | null = null;
  // A lesson outlives the /teach run that opened it, so failures are reported
  // through whichever run is on screen now, never the first one.
  const notifier = new LatestNotifier();

  pi.registerCommand("teach", {
    description: "Learn a topic in an interactive lesson in your browser",
    handler: async (topicArgument, ctx) => {
      notifier.useContext(ctx);
      const topic = topicArgument.trim();

      // `pi install <path>` copies this extension in but installs nothing, so say
      // exactly what is missing rather than failing somewhere deeper.
      const setupProblem = describeMissingPrerequisites(
        await inspectSetup({ packageDirectory }),
        packageDirectory,
      );
      if (setupProblem !== null) {
        ctx.ui.notify(setupProblem, "error");
        return;
      }

      // Loaded here, not at the top, so a clone with no dependencies installed
      // still loads the extension and gets the message above.
      const [{ TeachLessonHost: LessonHost }, { createPiTeachingAgentSessionFactory }] =
        await Promise.all([
          import("./teach-lesson-host.ts"),
          import("./services/pi-teaching-agent-session.ts"),
        ]);

      lessonHost ??= new LessonHost({
        lessonsDirectory: lessonsDirectory(getAgentDir()),
        publicDirectory: PUBLIC_DIRECTORY,
        createTeachingAgentSession: createPiTeachingAgentSessionFactory(),
        onError: (error) => notifier.report(error),
      });

      const running = await lessonHost.start();
      lessonHost.setSuggestedTopic(topic.length > 0 ? topic : null);

      const opened = await openLessonInBrowser(running.url);
      // Voice and drawn pictures both need the Shopify AI Proxy credential. Saying so
      // here, once, is kinder than letting the learner wonder why nothing speaks.
      const withoutProxy = lessonHost.hasVoice
        ? ""
        : " Voice and drawn pictures are off: there is no Shopify AI Proxy credential. Start pi through `devx pi` to turn them on.";
      ctx.ui.notify(
        `${opened ? `Lesson open at ${running.url}` : `Open your lesson at ${running.url}`}${withoutProxy}`,
        "info",
      );
    },
  });

  pi.on("session_shutdown", async () => {
    const hostToStop = lessonHost;
    lessonHost = null;
    notifier.forget();
    await hostToStop?.stop();
  });
}
