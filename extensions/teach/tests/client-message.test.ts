import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAXIMUM_PASTED_REFERENCE_CHARACTERS,
  MAXIMUM_REFERENCE_COUNT,
  MAXIMUM_SELECTION_CHARACTERS,
  MAXIMUM_TOPIC_CHARACTERS,
  parseClientMessage,
} from "../shared/client-message.ts";
import { InvalidClientMessageError } from "../shared/protocol.ts";

function startLessonMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "start_lesson",
    setup: {
      topic: "How a message queue works",
      references: [],
      ...overrides,
    },
  };
}

describe("parseClientMessage start_lesson", () => {
  it("accepts a topic with no references", () => {
    const message = parseClientMessage(startLessonMessage());

    assert.equal(message.type, "start_lesson");
    assert.equal(
      message.type === "start_lesson" ? message.setup.topic : "",
      "How a message queue works",
    );
  });

  it("accepts a link, a GitHub link and pasted notes together", () => {
    const message = parseClientMessage(
      startLessonMessage({
        references: [
          { kind: "url", label: "Guide", value: "https://example.com/queues" },
          { kind: "github", label: "Worker", value: "https://github.com/example/worker" },
          { kind: "pasted", label: "Notes", value: "Queues decouple work." },
        ],
      }),
    );

    assert.equal(message.type === "start_lesson" ? message.setup.references.length : 0, 3);
  });

  it("refuses a blank topic", () => {
    assert.throws(
      () => parseClientMessage(startLessonMessage({ topic: "  " })),
      InvalidClientMessageError,
    );
  });

  it("refuses a topic longer than the allowed length", () => {
    assert.throws(
      () =>
        parseClientMessage(
          startLessonMessage({ topic: "q".repeat(MAXIMUM_TOPIC_CHARACTERS + 1) }),
        ),
      /topic/i,
    );
  });

  it("refuses a link that is not plain web address", () => {
    for (const unsafeValue of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/html,<script>",
    ]) {
      assert.throws(
        () =>
          parseClientMessage(
            startLessonMessage({
              references: [{ kind: "url", label: "Bad", value: unsafeValue }],
            }),
          ),
        InvalidClientMessageError,
        `expected ${unsafeValue} to be refused`,
      );
    }
  });

  it("refuses a GitHub reference that does not point at GitHub", () => {
    assert.throws(
      () =>
        parseClientMessage(
          startLessonMessage({
            references: [
              { kind: "github", label: "Fake", value: "https://github.evil.com/example/worker" },
            ],
          }),
        ),
      /github/i,
    );
  });

  it("accepts a gist as a GitHub reference", () => {
    const message = parseClientMessage(
      startLessonMessage({
        references: [
          {
            kind: "github",
            label: "Snippet",
            value: "https://gist.github.com/example/aaaabbbbccccddddeeeeffff00001111",
          },
        ],
      }),
    );

    assert.equal(message.type === "start_lesson" ? message.setup.references.length : 0, 1);
  });

  it("refuses the GitHub documentation site as a GitHub reference", () => {
    assert.throws(
      () =>
        parseClientMessage(
          startLessonMessage({
            references: [
              { kind: "github", label: "Docs", value: "https://docs.github.com/en/rest" },
            ],
          }),
        ),
      /github/i,
    );
  });

  it("takes the GitHub documentation site as an ordinary web page", () => {
    const message = parseClientMessage(
      startLessonMessage({
        references: [{ kind: "url", label: "Docs", value: "https://docs.github.com/en/rest" }],
      }),
    );

    assert.equal(
      message.type === "start_lesson" ? message.setup.references[0]?.kind : null,
      "url",
    );
  });

  it("refuses more references than the allowed count", () => {
    const tooManyReferences = Array.from(
      { length: MAXIMUM_REFERENCE_COUNT + 1 },
      (_unused, index) => ({
        kind: "url",
        label: `Link ${index}`,
        value: `https://example.com/${index}`,
      }),
    );

    assert.throws(
      () => parseClientMessage(startLessonMessage({ references: tooManyReferences })),
      /references/i,
    );
  });

  it("refuses pasted notes longer than the allowed length", () => {
    assert.throws(
      () =>
        parseClientMessage(
          startLessonMessage({
            references: [
              {
                kind: "pasted",
                label: "Notes",
                value: "n".repeat(MAXIMUM_PASTED_REFERENCE_CHARACTERS + 1),
              },
            ],
          }),
        ),
      /pasted/i,
    );
  });
});

describe("parseClientMessage other messages", () => {
  it("accepts an answer to a question", () => {
    const message = parseClientMessage({
      type: "answer",
      questionId: "question-1",
      text: "Because the worker was busy.",
    });

    assert.equal(message.type, "answer");
  });

  it("refuses an answer with no question", () => {
    assert.throws(
      () => parseClientMessage({ type: "answer", text: "Something" }),
      InvalidClientMessageError,
    );
  });

  it("accepts a request to carry on", () => {
    assert.equal(parseClientMessage({ type: "continue" }).type, "continue");
  });

  it("accepts a request to stop the lesson at once", () => {
    assert.equal(parseClientMessage({ type: "interrupt" }).type, "interrupt");
  });

  it("accepts a request to be quizzed", () => {
    assert.equal(parseClientMessage({ type: "request_quiz" }).type, "request_quiz");
  });

  it("accepts a request for a simpler explanation", () => {
    const message = parseClientMessage({ type: "learner_signal", signal: "simpler" });

    assert.equal(message.type === "learner_signal" ? message.signal : null, "simpler");
  });

  it("accepts a request to go deeper", () => {
    const message = parseClientMessage({ type: "learner_signal", signal: "go_deeper" });

    assert.equal(message.type === "learner_signal" ? message.signal : null, "go_deeper");
  });

  it("refuses a learner signal the lesson has no rule for", () => {
    assert.throws(
      () => parseClientMessage({ type: "learner_signal", signal: "bored" }),
      InvalidClientMessageError,
    );
    assert.throws(
      () => parseClientMessage({ type: "learner_signal" }),
      InvalidClientMessageError,
    );
  });

  it("refuses a message type it does not know", () => {
    assert.throws(
      () => parseClientMessage({ type: "drop_database" }),
      InvalidClientMessageError,
    );
  });

  it("refuses something that is not a message object", () => {
    assert.throws(() => parseClientMessage("start_lesson"), InvalidClientMessageError);
    assert.throws(() => parseClientMessage(null), InvalidClientMessageError);
    assert.throws(() => parseClientMessage([]), InvalidClientMessageError);
  });
});

describe("parseClientMessage quiz_answer", () => {
  function multipleChoiceAnswer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      type: "quiz_answer",
      questionId: "queue-order-1",
      answer: { format: "multiple_choice", selectedChoiceIds: ["a"], ...overrides },
    };
  }

  it("accepts a chosen answer", () => {
    const message = parseClientMessage(multipleChoiceAnswer());

    assert.equal(message.type, "quiz_answer");
    if (message.type !== "quiz_answer" || message.answer.format !== "multiple_choice") return;
    assert.deepEqual(message.answer.selectedChoiceIds, ["a"]);
  });

  it("accepts several chosen answers, because a question may have more than one", () => {
    const message = parseClientMessage(multipleChoiceAnswer({ selectedChoiceIds: ["a", "c"] }));

    if (message.type !== "quiz_answer" || message.answer.format !== "multiple_choice") return;
    assert.deepEqual(message.answer.selectedChoiceIds, ["a", "c"]);
  });

  it("refuses an answer that chose nothing", () => {
    assert.throws(
      () => parseClientMessage(multipleChoiceAnswer({ selectedChoiceIds: [] })),
      InvalidClientMessageError,
    );
  });

  it("refuses a choice identifier that is not a choice identifier", () => {
    assert.throws(
      () => parseClientMessage(multipleChoiceAnswer({ selectedChoiceIds: ["../../etc"] })),
      InvalidClientMessageError,
    );
  });

  it("refuses more chosen answers than a question can offer", () => {
    assert.throws(
      () =>
        parseClientMessage(
          multipleChoiceAnswer({ selectedChoiceIds: ["a", "b", "c", "d", "e", "f", "g"] }),
        ),
      InvalidClientMessageError,
    );
  });

  it("accepts an answer written in the learner's own words", () => {
    const message = parseClientMessage({
      type: "quiz_answer",
      questionId: "queue-order-1",
      answer: { format: "short_text", text: "The oldest item goes first." },
    });

    if (message.type !== "quiz_answer" || message.answer.format !== "short_text") return;
    assert.equal(message.answer.text, "The oldest item goes first.");
  });

  it("refuses a free text answer that is blank", () => {
    assert.throws(
      () =>
        parseClientMessage({
          type: "quiz_answer",
          questionId: "queue-order-1",
          answer: { format: "short_text", text: "   " },
        }),
      InvalidClientMessageError,
    );
  });

  it("refuses an answer format the lesson does not offer", () => {
    assert.throws(
      () =>
        parseClientMessage({
          type: "quiz_answer",
          questionId: "queue-order-1",
          answer: { format: "essay", text: "Long essay." },
        }),
      InvalidClientMessageError,
    );
  });

  it("refuses a question id that could not name a stored question", () => {
    assert.throws(
      () => parseClientMessage({ ...multipleChoiceAnswer(), questionId: "../secrets" }),
      InvalidClientMessageError,
    );
  });
});

describe("parseClientMessage define_selection", () => {
  it("accepts the words the learner highlighted", () => {
    const message = parseClientMessage({ type: "define_selection", text: "back pressure" });

    assert.equal(message.type, "define_selection");
    assert.equal(message.type === "define_selection" ? message.text : "", "back pressure");
  });

  it("refuses a selection longer than a phrase, because a definition is about a term", () => {
    assert.throws(
      () =>
        parseClientMessage({
          type: "define_selection",
          text: "q".repeat(MAXIMUM_SELECTION_CHARACTERS + 1),
        }),
      InvalidClientMessageError,
    );
  });

  it("refuses an empty selection", () => {
    assert.throws(
      () => parseClientMessage({ type: "define_selection", text: "  " }),
      InvalidClientMessageError,
    );
  });
});
