import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TurnTrigger } from "../src/domain/turn-prompt.ts";
import { buildTurnPrompt } from "../src/domain/turn-prompt.ts";

const BRIEFING = "The learner right now:\n- Teach at depth 3 of 5.";

function promptFor(trigger: TurnTrigger): string {
  return buildTurnPrompt(trigger, BRIEFING);
}

describe("buildTurnPrompt", () => {
  it("carries the briefing into every turn", () => {
    assert.equal(promptFor({ kind: "first_turn" }).includes(BRIEFING), true);
  });

  it("asks the first turn to frame the whole topic", () => {
    assert.match(promptFor({ kind: "first_turn" }), /high level/i);
  });

  it("asks a continue turn for the next idea", () => {
    assert.match(promptFor({ kind: "continue" }), /next/i);
  });

  it("gives the learner's question to the turn that answers it", () => {
    const prompt = promptFor({
      kind: "learner_question",
      questionId: "question-1",
      text: "Why not just call the worker directly?",
    });

    assert.match(prompt, /Why not just call the worker directly\?/);
  });

  it("gives the highlighted words to a definition request", () => {
    const prompt = promptFor({ kind: "define_selection", text: "back pressure" });

    assert.match(prompt, /back pressure/);
    assert.match(prompt, /define_term/);
  });

  it("asks for exactly one definition, so a selection cannot restart the lesson", () => {
    assert.match(promptFor({ kind: "define_selection", text: "back pressure" }), /one definition/i);
  });
});

describe("buildTurnPrompt after an answer was graded", () => {
  function gradedTrigger(grade: "correct" | "partly_correct" | "incorrect"): TurnTrigger {
    return {
      kind: "graded_answer",
      grade,
      question: "Which item does a worker take first?",
      submittedAnswer: "The newest item.",
    };
  }

  it("lets the lesson go deeper after a correct answer", () => {
    const prompt = promptFor(gradedTrigger("correct"));

    assert.match(prompt, /correct/i);
    assert.match(prompt, /deeper/i);
  });

  it("asks for a simpler explanation after a partly correct answer", () => {
    const prompt = promptFor(gradedTrigger("partly_correct"));

    assert.match(prompt, /partly/i);
    assert.match(prompt, /simpler/i);
  });

  it("asks for the simplest explanation again after a wrong answer", () => {
    const prompt = promptFor(gradedTrigger("incorrect"));

    assert.match(prompt, /wrong|incorrect/i);
    assert.match(prompt, /simpler|simplest/i);
  });

  it("never asks the model to teach on after a wrong answer without re-explaining", () => {
    assert.equal(promptFor(gradedTrigger("incorrect")).includes("Teach the next concept"), false);
  });

  it("repeats what the learner actually answered, so the turn can address it", () => {
    assert.match(promptFor(gradedTrigger("incorrect")), /The newest item\./);
  });
});

describe("buildTurnPrompt when the teaching agent must grade an answer", () => {
  const trigger: TurnTrigger = {
    kind: "grade_free_text_answer",
    questionId: "queue-purpose-1",
    question: "Why does a queue help?",
    correctAnswerCriteria: "Says work can wait instead of being lost.",
    submittedAnswer: "So nothing is lost when workers are busy.",
  };

  it("names the tool the grade must come back through", () => {
    assert.match(promptFor(trigger), /grade_free_text_answer/);
  });

  it("gives the question, the criteria and the learner's words", () => {
    const prompt = promptFor(trigger);

    assert.match(prompt, /Why does a queue help\?/);
    assert.match(prompt, /Says work can wait instead of being lost\./);
    assert.match(prompt, /So nothing is lost when workers are busy\./);
  });

  it("names the question id, so the grade is recorded against the right question", () => {
    assert.match(promptFor(trigger), /queue-purpose-1/);
  });
});

describe("buildTurnPrompt when the learner asks to be quizzed", () => {
  const trigger: TurnTrigger = { kind: "quiz_me" };

  it("asks for exactly one question, through the quiz tool", () => {
    const prompt = promptFor(trigger);

    assert.match(prompt, /ask_quiz_question/);
    assert.match(prompt, /exactly once/i);
  });

  it("keeps the question to what the lesson has already taught", () => {
    assert.match(promptFor(trigger), /already taught/i);
  });

  it("does not carry the lesson on in the same turn", () => {
    assert.match(promptFor(trigger), /Teach nothing else/i);
  });
});

/**
 * These two come from a button the learner pressed, so the turn does what it says.
 * Nothing here reads a mood into it or asks the model to guess at one.
 */
describe("buildTurnPrompt when the learner asks for something outright", () => {
  it("says the same idea again more plainly when the learner asked for simpler", () => {
    const prompt = promptFor({ kind: "learner_signal", signal: "simpler" });

    assert.match(prompt, /same idea again/i);
    assert.match(prompt, /do not add anything new/i);
  });

  it("stays on the same idea and adds detail when the learner asked to go deeper", () => {
    const prompt = promptFor({ kind: "learner_signal", signal: "go_deeper" });

    assert.match(prompt, /same idea/i);
    assert.match(prompt, /deeper/i);
  });

  it("pauses for the learner either way, so the lesson stays theirs", () => {
    assert.match(promptFor({ kind: "learner_signal", signal: "simpler" }), /pause for the learner/i);
    assert.match(
      promptFor({ kind: "learner_signal", signal: "go_deeper" }),
      /pause for the learner/i,
    );
  });
});
