import { spawn } from "node:child_process";

import { LOOPBACK_ADDRESS } from "./server/request-guard.ts";

export interface BrowserOpenCommand {
  readonly command: string;
  readonly commandArguments: readonly string[];
}

export type StartProcess = (
  command: string,
  commandArguments: readonly string[],
) => Promise<void>;

export interface OpenLessonInBrowserOptions {
  readonly platform?: NodeJS.Platform | string;
  readonly startProcess?: StartProcess;
}

export function browserOpenCommand(
  platform: NodeJS.Platform | string,
  lessonUrl: string,
): BrowserOpenCommand {
  switch (platform) {
    case "darwin":
      return { command: "open", commandArguments: [lessonUrl] };
    case "win32":
      // The empty argument is the window title `start` expects before the address.
      return { command: "cmd", commandArguments: ["/c", "start", "", lessonUrl] };
    default:
      return { command: "xdg-open", commandArguments: [lessonUrl] };
  }
}

/**
 * Opens the lesson page. The address is always passed as its own argument, never
 * through a shell, because it carries the lesson token.
 *
 * Returns false rather than throwing: the address is printed in the terminal, so a
 * machine with no browser command can still open the lesson by hand.
 */
export async function openLessonInBrowser(
  lessonUrl: string,
  options: OpenLessonInBrowserOptions = {},
): Promise<boolean> {
  if (!isLoopbackLessonUrl(lessonUrl)) {
    return false;
  }

  const platform = options.platform ?? process.platform;
  const startProcess = options.startProcess ?? spawnDetached;
  const { command, commandArguments } = browserOpenCommand(platform, lessonUrl);

  try {
    await startProcess(command, commandArguments);
    return true;
  } catch {
    return false;
  }
}

function isLoopbackLessonUrl(lessonUrl: string): boolean {
  try {
    const parsedUrl = new URL(lessonUrl);
    return parsedUrl.protocol === "http:" && parsedUrl.hostname === LOOPBACK_ADDRESS;
  } catch {
    return false;
  }
}

const spawnDetached: StartProcess = async (command, commandArguments) => {
  const child = spawn(command, [...commandArguments], {
    stdio: "ignore",
    detached: true,
    shell: false,
  });
  child.unref();
};
