import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NarrationHotkeyEvent, NarrationHotkeyState } from "../shared/narration-hotkey.ts";
import { applyNarrationHotkey } from "../shared/narration-hotkey.ts";

function pressSpace(overrides: Partial<NarrationHotkeyEvent> = {}): NarrationHotkeyEvent {
  return {
    key: " ",
    targetIsEditable: false,
    isRepeat: false,
    hasModifier: false,
    ...overrides,
  };
}

function pressEscape(overrides: Partial<NarrationHotkeyEvent> = {}): NarrationHotkeyEvent {
  return { ...pressSpace(overrides), key: "Escape" };
}

function apply(state: NarrationHotkeyState, event: NarrationHotkeyEvent) {
  return applyNarrationHotkey(state, event);
}

describe("Space while the lesson is speaking", () => {
  it("stops the narration and starts listening", () => {
    const outcome = apply("narrating", pressSpace());

    assert.deepEqual(outcome.effects, ["interrupt_narration", "start_recording"]);
    assert.equal(outcome.state, "recording");
  });

  it("claims the key so the page does not scroll", () => {
    assert.equal(apply("narrating", pressSpace()).handled, true);
  });
});

describe("Space while the lesson is quiet", () => {
  it("starts listening without an interruption", () => {
    const outcome = apply("idle", pressSpace());

    assert.deepEqual(outcome.effects, ["start_recording"]);
    assert.equal(outcome.state, "recording");
  });
});

describe("Space while listening", () => {
  it("stops listening and sends what the learner said", () => {
    const outcome = apply("recording", pressSpace());

    assert.deepEqual(outcome.effects, ["submit_recording"]);
    assert.equal(outcome.state, "idle");
  });
});

describe("Escape", () => {
  it("throws away what the learner said and stops listening", () => {
    const outcome = apply("recording", pressEscape());

    assert.deepEqual(outcome.effects, ["cancel_recording"]);
    assert.equal(outcome.state, "idle");
  });

  it("does nothing when the lesson is not listening", () => {
    for (const state of ["idle", "narrating"] as const) {
      const outcome = apply(state, pressEscape());

      assert.deepEqual(outcome.effects, []);
      assert.equal(outcome.state, state);
      assert.equal(outcome.handled, false);
    }
  });
});

describe("keys the lesson must not steal", () => {
  it("leaves Space alone inside a text box or other editable control", () => {
    const outcome = apply("narrating", pressSpace({ targetIsEditable: true }));

    assert.deepEqual(outcome.effects, []);
    assert.equal(outcome.state, "narrating");
    assert.equal(outcome.handled, false);
  });

  it("leaves Escape alone inside a text box so the control can handle it", () => {
    const outcome = apply("recording", pressEscape({ targetIsEditable: true }));

    assert.deepEqual(outcome.effects, []);
    assert.equal(outcome.handled, false);
  });

  it("leaves Space with a held modifier key to the browser", () => {
    const outcome = apply("narrating", pressSpace({ hasModifier: true }));

    assert.deepEqual(outcome.effects, []);
    assert.equal(outcome.handled, false);
  });

  it("ignores a held down Space but still stops the page scrolling", () => {
    const outcome = apply("recording", pressSpace({ isRepeat: true }));

    assert.deepEqual(outcome.effects, []);
    assert.equal(outcome.state, "recording");
    assert.equal(outcome.handled, true);
  });

  it("ignores every other key", () => {
    const outcome = apply("narrating", pressSpace({ key: "a" }));

    assert.deepEqual(outcome.effects, []);
    assert.equal(outcome.handled, false);
  });
});

describe("a full learner interruption", () => {
  it("returns to quiet after interrupt, listen and send", () => {
    const afterFirstSpace = apply("narrating", pressSpace());
    const afterSecondSpace = apply(afterFirstSpace.state, pressSpace());

    assert.equal(afterSecondSpace.state, "idle");
    assert.deepEqual(
      [...afterFirstSpace.effects, ...afterSecondSpace.effects],
      ["interrupt_narration", "start_recording", "submit_recording"],
    );
  });
});
