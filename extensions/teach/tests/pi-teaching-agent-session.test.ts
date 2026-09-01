import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { throwForFailedTeachingTurn } from "../src/services/pi-teaching-agent-session.ts";

describe("teaching agent turn result", () => {
  it("turns a provider error message into a rejected teaching turn", () => {
    assert.throws(
      () =>
        throwForFailedTeachingTurn([
          {
            role: "assistant",
            stopReason: "error",
            errorMessage: "401 invalid x-api-key",
            content: [],
          },
        ]),
      /401 invalid x-api-key/,
    );
  });

  it("refuses an ordinary assistant reply because the browser cannot show it", () => {
    assert.throws(
      () =>
        throwForFailedTeachingTurn([
          {
            role: "assistant",
            stopReason: "stop",
            content: [{ type: "text", text: "Here is the lesson." }],
          },
        ]),
      /no lesson content/,
    );
  });

  it("accepts a turn that called a teaching tool", () => {
    assert.doesNotThrow(() =>
      throwForFailedTeachingTurn([
        {
          role: "assistant",
          stopReason: "toolUse",
          content: [{ type: "toolCall", name: "teach_concept", arguments: {} }],
        },
      ]),
    );
  });

  it("does not report a learner-requested abort as a model failure", () => {
    assert.doesNotThrow(() =>
      throwForFailedTeachingTurn([
        { role: "assistant", stopReason: "aborted", content: [] },
      ]),
    );
  });
});
