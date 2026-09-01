import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LatestNotifier } from "../src/latest-notifier.ts";
import { FakeCommandContext } from "./support/fake-extension-api.ts";

describe("LatestNotifier", () => {
  it("reports through the context of the command run that is on screen now", () => {
    const notifier = new LatestNotifier();
    const firstRun = new FakeCommandContext();
    const secondRun = new FakeCommandContext();
    notifier.useContext(firstRun);
    notifier.useContext(secondRun);

    notifier.report(new Error("the model went away"));

    assert.deepEqual(firstRun.notifications, []);
    assert.deepEqual(secondRun.notifications, [
      { text: "Lesson problem: the model went away", level: "error" },
    ]);
  });

  it("says nothing when the command has never been run", () => {
    new LatestNotifier().report(new Error("the model went away"));
  });

  it("says nothing once the pi session has ended", () => {
    const notifier = new LatestNotifier();
    const commandRun = new FakeCommandContext();
    notifier.useContext(commandRun);
    notifier.forget();

    notifier.report(new Error("the model went away"));

    assert.deepEqual(commandRun.notifications, []);
  });

  it("survives a context that has gone bad, so one failure never becomes two", () => {
    const notifier = new LatestNotifier();
    notifier.useContext({
      ui: {
        notify: () => {
          throw new Error("the pi session has gone");
        },
      },
    });

    notifier.report(new Error("the model went away"));
  });
});
