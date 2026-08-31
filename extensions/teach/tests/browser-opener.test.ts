import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { browserOpenCommand, openLessonInBrowser } from "../src/browser-opener.ts";

const LESSON_URL = "http://127.0.0.1:51234/?token=abc123";

describe("browserOpenCommand", () => {
  it("uses the macOS open command", () => {
    assert.deepEqual(browserOpenCommand("darwin", LESSON_URL), {
      command: "open",
      commandArguments: [LESSON_URL],
    });
  });

  it("uses the Windows start command", () => {
    assert.deepEqual(browserOpenCommand("win32", LESSON_URL), {
      command: "cmd",
      commandArguments: ["/c", "start", "", LESSON_URL],
    });
  });

  it("uses the desktop open command on Linux", () => {
    assert.deepEqual(browserOpenCommand("linux", LESSON_URL), {
      command: "xdg-open",
      commandArguments: [LESSON_URL],
    });
  });

  it("keeps the address as its own argument so no shell can read it", () => {
    const { commandArguments } = browserOpenCommand(
      "darwin",
      "http://127.0.0.1:1/?token=a;rm -rf /",
    );

    assert.deepEqual(commandArguments, ["http://127.0.0.1:1/?token=a;rm -rf /"]);
  });
});

describe("openLessonInBrowser", () => {
  it("runs the open command for the current system", async () => {
    const startedCommands: Array<{ command: string; commandArguments: readonly string[] }> = [];

    const opened = await openLessonInBrowser(LESSON_URL, {
      platform: "darwin",
      startProcess: async (command, commandArguments) => {
        startedCommands.push({ command, commandArguments });
      },
    });

    assert.equal(opened, true);
    assert.deepEqual(startedCommands, [{ command: "open", commandArguments: [LESSON_URL] }]);
  });

  it("reports that it could not open the browser instead of failing the lesson", async () => {
    const opened = await openLessonInBrowser(LESSON_URL, {
      platform: "darwin",
      startProcess: async () => {
        throw new Error("no browser here");
      },
    });

    assert.equal(opened, false);
  });

  it("refuses to open an address that is not the loopback lesson server", async () => {
    let wasStarted = false;

    const opened = await openLessonInBrowser("https://evil.example.com/", {
      platform: "darwin",
      startProcess: async () => {
        wasStarted = true;
      },
    });

    assert.equal(opened, false);
    assert.equal(wasStarted, false);
  });
});
