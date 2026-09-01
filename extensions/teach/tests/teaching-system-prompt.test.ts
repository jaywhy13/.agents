import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LessonSetup } from "../shared/lesson.ts";
import { buildTeachingSystemPrompt } from "../src/domain/teaching-system-prompt.ts";

function lessonSetup(overrides: Partial<LessonSetup> = {}): LessonSetup {
  return {
    topic: "How a message queue works",
    references: [],
    ...overrides,
  };
}

describe("buildTeachingSystemPrompt", () => {
  it("names the topic the learner asked about", () => {
    const prompt = buildTeachingSystemPrompt(lessonSetup());

    assert.match(prompt, /How a message queue works/);
  });

  it("tells the model to teach the high level first", () => {
    const prompt = buildTeachingSystemPrompt(lessonSetup());

    assert.match(prompt, /high level/i);
  });

  it("tells the model to keep sentences short but the lesson thorough", () => {
    const prompt = buildTeachingSystemPrompt(lessonSetup());

    assert.match(prompt, /short sentences/i);
    assert.match(prompt, /thorough/i);
  });

  it("forbids acronyms the learner has not been given in full", () => {
    const prompt = buildTeachingSystemPrompt(lessonSetup());

    assert.match(prompt, /acronym/i);
    assert.match(prompt, /never/i);
  });

  it("allows exactly one concept per beat", () => {
    const prompt = buildTeachingSystemPrompt(lessonSetup());

    assert.match(prompt, /one concept/i);
  });

  it("asks for a pause after every concept and every question", () => {
    const prompt = buildTeachingSystemPrompt(lessonSetup());

    assert.match(prompt, /pause_lesson/);
    assert.match(prompt, /after every concept/i);
  });

  it("says a pause ends the turn, so the lesson never runs on while the learner is away", () => {
    const prompt = buildTeachingSystemPrompt(lessonSetup());

    assert.match(prompt, /ends your turn/i);
  });

  it("names every tool the lesson may use", () => {
    const prompt = buildTeachingSystemPrompt(lessonSetup());

    for (const toolName of [
      "teach_concept",
      "define_term",
      "show_code",
      "ask_quiz_question",
      "grade_free_text_answer",
      "pause_lesson",
      "end_lesson",
    ]) {
      assert.match(prompt, new RegExp(toolName));
    }
  });

  it("tells the model to define a term before using it", () => {
    const prompt = buildTeachingSystemPrompt(lessonSetup());

    assert.match(prompt, /define_term/);
    assert.match(prompt, /before you use it/i);
  });

  it("tells the model to check understanding with a question", () => {
    const prompt = buildTeachingSystemPrompt(lessonSetup());

    assert.match(prompt, /ask_quiz_question/);
  });

  it("tells the model the lesson decides the depth of each turn", () => {
    const prompt = buildTeachingSystemPrompt(lessonSetup());

    assert.match(prompt, /depth/i);
  });

  it("carries no lesson history, because that is sent per turn instead", () => {
    const prompt = buildTeachingSystemPrompt(lessonSetup());

    assert.equal(/the last few things the learner saw/i.test(prompt), false);
  });

  it("names every reference the learner supplied, by label", () => {
    const prompt = buildTeachingSystemPrompt(setupWithReferences());

    assert.match(prompt, /Queue guide/);
    assert.match(prompt, /Worker code/);
    assert.match(prompt, /Notes/);
  });

  it("carries none of the material itself, so a reference never fills the prompt", () => {
    const prompt = buildTeachingSystemPrompt(setupWithReferences());

    assert.doesNotMatch(prompt, /https:\/\/example\.com\/queues/);
    assert.doesNotMatch(prompt, /https:\/\/github\.com\/example\/worker/);
    assert.doesNotMatch(prompt, /Queues decouple producers from consumers\./);
  });

  it("says how to read a reference, since none of it is in the prompt", () => {
    const prompt = buildTeachingSystemPrompt(setupWithReferences());

    assert.match(prompt, /list_lesson_references/);
    assert.match(prompt, /read_lesson_reference/);
  });

  it("leaves out the reference section when the learner supplied none", () => {
    const prompt = buildTeachingSystemPrompt(lessonSetup());

    assert.equal(/piece of background/i.test(prompt), false);
  });

  it("offers the picture tool only when the lesson can draw pictures", () => {
    const withPictures = buildTeachingSystemPrompt(lessonSetup(), { canDrawPictures: true });
    const withoutPictures = buildTeachingSystemPrompt(lessonSetup(), { canDrawPictures: false });

    assert.match(withPictures, /show_illustration/);
    assert.doesNotMatch(withoutPictures, /show_illustration/);
    assert.match(withoutPictures, /cannot draw pictures/);
  });

  it("always offers the diagram tool, which needs no credential", () => {
    assert.match(buildTeachingSystemPrompt(lessonSetup(), { canDrawPictures: false }), /draw_diagram/);
  });

  it("tells the model to keep beats short, because every beat is read out loud", () => {
    const prompt = buildTeachingSystemPrompt(lessonSetup());

    assert.match(prompt, /read out loud/);
    assert.match(prompt, /keep every beat short/);
  });
});

function setupWithReferences() {
  return lessonSetup({
    references: [
      { kind: "url", label: "Queue guide", value: "https://example.com/queues" },
      { kind: "github", label: "Worker code", value: "https://github.com/example/worker" },
      { kind: "pasted", label: "Notes", value: "Queues decouple producers from consumers." },
    ],
  });
}
