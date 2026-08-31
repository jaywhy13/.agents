import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nextSetupProgress } from "../shared/setup-progress.ts";

describe("nextSetupProgress", () => {
  it("waits once the learner has asked for the lesson", () => {
    assert.equal(nextSetupProgress("idle", { kind: "start_requested" }), "starting");
  });

  it("stops waiting once the lesson is on screen", () => {
    assert.equal(nextSetupProgress("starting", { kind: "lesson_started" }), "idle");
  });

  it("stops waiting when the start failed, so the learner can try again", () => {
    assert.equal(nextSetupProgress("starting", { kind: "start_failed" }), "idle");
  });

  it("stops waiting when the lesson server has gone", () => {
    assert.equal(nextSetupProgress("starting", { kind: "socket_closed" }), "idle");
  });

  it("stops waiting when the learner asks for a new lesson", () => {
    assert.equal(nextSetupProgress("starting", { kind: "setup_form_shown" }), "idle");
  });

  it("ignores a failure that arrives when nothing was being started", () => {
    assert.equal(nextSetupProgress("idle", { kind: "start_failed" }), "idle");
  });
});
