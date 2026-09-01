import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ConceptCardBeat, DefinitionBeat } from "../shared/beat.ts";
import { FakeTeachingToolHandlers } from "./support/fake-teaching-tool-handlers.ts";

function firstTextOf(content: ReadonlyArray<{ type: string }>): string {
  const firstPart = content[0];
  if (firstPart === undefined || firstPart.type !== "text") {
    throw new Error("The tool did not answer with text.");
  }
  return (firstPart as unknown as { text: string }).text;
}

const piPackagesAreAvailable = await import("@earendil-works/pi-coding-agent").then(
  () => true,
  () => false,
);

interface RunnableTool {
  readonly name: string;
  readonly parameters: unknown;
  execute(
    toolCallId: string,
    parameters: never,
    a: undefined,
    b: undefined,
    c: never,
  ): Promise<{ content: ReadonlyArray<{ type: string }>; details?: unknown }>;
}

async function runTool(
  tool: RunnableTool,
  parameters: Record<string, unknown>,
): Promise<{ text: string; details: unknown }> {
  const result = await tool.execute(
    "call-1",
    parameters as never,
    undefined,
    undefined,
    {} as never,
  );
  return { text: firstTextOf(result.content), details: result.details };
}

function requiredParametersOf(tool: RunnableTool): readonly string[] {
  return [...((tool.parameters as { required?: readonly string[] }).required ?? [])].sort();
}

describe(
  "the teaching tools",
  { skip: piPackagesAreAvailable ? false : "pi packages are not linked" },
  () => {
    async function toolsWith(handlers: FakeTeachingToolHandlers) {
      const { createTeachingTools, TEACHING_TOOL_NAMES } = await import(
        "../src/services/teaching-tools.ts"
      );
      const tools = createTeachingTools(handlers) as unknown as RunnableTool[];
      const byName = new Map(tools.map((tool) => [tool.name, tool]));
      return { tools, byName, toolNames: TEACHING_TOOL_NAMES };
    }

    async function toolNamed(name: string, handlers = new FakeTeachingToolHandlers()) {
      const { byName } = await toolsWith(handlers);
      const tool = byName.get(name);
      if (tool === undefined) {
        throw new Error(`There is no ${name} tool.`);
      }
      return { tool, handlers };
    }

    it("gives the lesson one tool per thing it can do, and nothing else", async () => {
      const { tools, toolNames } = await toolsWith(new FakeTeachingToolHandlers());

      assert.deepEqual(
        tools.map((tool) => tool.name),
        [...toolNames],
      );
    });

    it("gives the lesson no tool that could touch the learner's machine", async () => {
      const { tools } = await toolsWith(new FakeTeachingToolHandlers());

      // Named rather than matched on a word, because one teaching tool does read:
      // `read_lesson_reference` reads a copy the lesson itself made, inside the
      // lesson directory, by identifier. It cannot name a path at all.
      const forbidden = [
        "read",
        "write",
        "edit",
        "multi_edit",
        "shell",
        "bash",
        "glob",
        "grep",
        "web_fetch",
        "web_search",
      ];
      for (const tool of tools) {
        assert.equal(forbidden.includes(tool.name), false, tool.name);
        assert.equal(/^(read|write|edit)$/.test(tool.name), false, tool.name);
      }
    });

    describe("teach_concept", () => {
      it("publishes the concept the model supplied", async () => {
        const { tool, handlers } = await toolNamed("teach_concept");

        await runTool(tool, {
          title: "Backpressure",
          plainLanguageSummary: "Slowing the producer down.",
          keyPoints: ["The producer waits."],
          narrationScript: "Slowing the producer down.",
          pauseForLearner: true,
        });

        assert.deepEqual(
          handlers.conceptCards.map((request) => request.title),
          ["Backpressure"],
        );
      });

      it("tells the model to wait when the beat asks the learner to pause", async () => {
        const { tool } = await toolNamed("teach_concept");

        const { text } = await runTool(tool, {
          title: "Backpressure",
          plainLanguageSummary: "Slowing the producer down.",
          keyPoints: ["The producer waits."],
          narrationScript: "Slowing the producer down.",
          pauseForLearner: true,
        });

        assert.match(text, /Wait for the learner/);
      });

      it("hands the stored beat back as the tool details", async () => {
        const { tool } = await toolNamed("teach_concept");

        const { details } = await runTool(tool, {
          title: "Backpressure",
          plainLanguageSummary: "Slowing the producer down.",
          keyPoints: ["The producer waits."],
          narrationScript: "Slowing the producer down.",
          pauseForLearner: false,
        });

        assert.equal((details as ConceptCardBeat).kind, "concept_card");
      });
    });

    describe("define_term", () => {
      it("asks only for the term and its meaning, because most terms are not acronyms", async () => {
        const { tool } = await toolNamed("define_term");

        assert.deepEqual(requiredParametersOf(tool), ["plainLanguageMeaning", "term"]);
      });

      it("publishes the definition the model supplied", async () => {
        const { tool, handlers } = await toolNamed("define_term");

        await runTool(tool, {
          term: "FSM",
          fullForm: "Finite State Machine",
          plainLanguageMeaning: "One of a fixed set of states at a time.",
          example: "A traffic light.",
        });

        assert.equal(handlers.definitions[0]?.term, "FSM");
        assert.equal(handlers.definitions[0]?.fullForm, "Finite State Machine");
      });

      it("treats a term with no full form as having none", async () => {
        const { tool, handlers } = await toolNamed("define_term");

        await runTool(tool, { term: "queue", plainLanguageMeaning: "A line of waiting work." });

        assert.equal(handlers.definitions[0]?.fullForm, null);
        assert.equal(handlers.definitions[0]?.example, null);
      });

      it("passes the narration chunks through for the later speech step", async () => {
        const { tool, handlers } = await toolNamed("define_term");

        await runTool(tool, {
          term: "queue",
          plainLanguageMeaning: "A line of waiting work.",
          narration: [{ kind: "term", text: "queue" }],
        });

        assert.deepEqual(handlers.definitions[0]?.narration, [{ kind: "term", text: "queue" }]);
      });

      it("tells the model the term is now in the glossary", async () => {
        const { tool } = await toolNamed("define_term");

        const { text } = await runTool(tool, {
          term: "queue",
          plainLanguageMeaning: "A line of waiting work.",
        });

        assert.match(text, /glossary/i);
      });

      it("hands the stored beat back as the tool details", async () => {
        const { tool } = await toolNamed("define_term");

        const { details } = await runTool(tool, {
          term: "queue",
          plainLanguageMeaning: "A line of waiting work.",
        });

        assert.equal((details as DefinitionBeat).kind, "definition");
      });
    });

    describe("show_code", () => {
      it("publishes the code, and treats no marked lines as none", async () => {
        const { tool, handlers } = await toolNamed("show_code");

        await runTool(tool, {
          language: "python",
          code: "queue.append(job)",
          explanation: "This adds one job.",
        });

        assert.equal(handlers.codeSnippets[0]?.language, "python");
        assert.equal(handlers.codeSnippets[0]?.fileName, null);
        assert.deepEqual(handlers.codeSnippets[0]?.emphasizedLineRanges, []);
      });

      it("passes the marked lines through", async () => {
        const { tool, handlers } = await toolNamed("show_code");

        await runTool(tool, {
          language: "python",
          fileName: "worker.py",
          code: "queue.append(job)\nreturn job",
          explanation: "This adds one job.",
          emphasizedLineRanges: [{ startLine: 1, endLine: 1 }],
        });

        assert.deepEqual(handlers.codeSnippets[0]?.emphasizedLineRanges, [
          { startLine: 1, endLine: 1 },
        ]);
      });
    });

    describe("ask_quiz_question", () => {
      it("publishes a multiple choice question with its correct answers", async () => {
        const { tool, handlers } = await toolNamed("ask_quiz_question");

        await runTool(tool, {
          questionId: "queue-order-1",
          question: "Which item goes first?",
          answerFormat: "multiple_choice",
          choices: [
            { choiceId: "a", text: "The oldest." },
            { choiceId: "b", text: "The newest." },
          ],
          correctChoiceIds: ["a"],
          explanation: "Oldest first.",
          relatedTerms: ["queue"],
        });

        const request = handlers.quizQuestions[0];
        assert.equal(request?.answerFormat, "multiple_choice");
        if (request?.answerFormat !== "multiple_choice") return;
        assert.deepEqual(request.correctChoiceIds, ["a"]);
      });

      it("publishes a free text question with its criteria, and no choices", async () => {
        const { tool, handlers } = await toolNamed("ask_quiz_question");

        await runTool(tool, {
          questionId: "queue-purpose-1",
          question: "Why does a queue help?",
          answerFormat: "short_text",
          correctAnswerCriteria: "Says work can wait.",
          explanation: "Work can wait.",
        });

        const request = handlers.quizQuestions[0];
        assert.equal(request?.answerFormat, "short_text");
        if (request?.answerFormat !== "short_text") return;
        assert.equal(request.correctAnswerCriteria, "Says work can wait.");
      });

      it("tells the model that asking a question ends its turn", async () => {
        const { tool } = await toolNamed("ask_quiz_question");

        const { text } = await runTool(tool, {
          questionId: "queue-order-1",
          question: "Which item goes first?",
          answerFormat: "short_text",
          correctAnswerCriteria: "Says the oldest.",
          explanation: "Oldest first.",
        });

        assert.match(text, /End your turn/i);
      });
    });

    describe("grade_free_text_answer", () => {
      it("hands the grade to the grading service", async () => {
        const { tool, handlers } = await toolNamed("grade_free_text_answer");

        await runTool(tool, {
          questionId: "queue-purpose-1",
          grade: "partly_correct",
          explanation: "Half of it.",
        });

        assert.deepEqual(handlers.agentGrades, [
          {
            questionId: "queue-purpose-1",
            grade: "partly_correct",
            explanation: "Half of it.",
          },
        ]);
      });

      it("asks for a simpler explanation when the grade was only partly correct", async () => {
        const handlers = new FakeTeachingToolHandlers();
        handlers.gradingOutcome = {
          kind: "graded",
          attempt: {
            attemptId: "attempt-1",
            lessonId: "lesson-abc123",
            beatId: "beat-1",
            questionId: "queue-purpose-1",
            answerFormat: "short_text",
            submittedAnswer: "Work can wait.",
            selectedChoiceIds: [],
            grade: "partly_correct",
            gradedBy: "teaching_agent",
            explanation: "Half of it.",
            relatedTerms: [],
            answeredAt: "2024-05-01T10:00:00.000Z",
          },
        };
        const { tool } = await toolNamed("grade_free_text_answer", handlers);

        const { text } = await runTool(tool, {
          questionId: "queue-purpose-1",
          grade: "partly_correct",
          explanation: "Half of it.",
        });

        assert.match(text, /simpler/i);
      });

      it("says so when there is no answer waiting to be graded", async () => {
        const handlers = new FakeTeachingToolHandlers();
        handlers.gradingOutcome = { kind: "no_answer_waiting", questionId: "queue-purpose-1" };
        const { tool } = await toolNamed("grade_free_text_answer", handlers);

        const { text } = await runTool(tool, {
          questionId: "queue-purpose-1",
          grade: "correct",
          explanation: "Good.",
        });

        assert.match(text, /already been graded/i);
      });
    });

    describe("pause_lesson", () => {
      it("publishes the pause the model asked for", async () => {
        const { tool, handlers } = await toolNamed("pause_lesson");

        await runTool(tool, { reason: "Read that again.", suggestedWaitSeconds: 15 });

        assert.equal(handlers.pauses[0]?.reason, "Read that again.");
        assert.equal(handlers.pauses[0]?.suggestedWaitSeconds, 15);
      });

      it("tells the model to end its turn, so a pause never pins a tool call", async () => {
        const { tool } = await toolNamed("pause_lesson");

        const { text } = await runTool(tool, {
          reason: "Read that again.",
          suggestedWaitSeconds: 15,
        });

        assert.match(text, /End your turn now/i);
        assert.match(text, /no further tools/i);
      });
    });

    describe("end_lesson", () => {
      it("publishes the recap and what to learn next", async () => {
        const { tool, handlers } = await toolNamed("end_lesson");

        await runTool(tool, {
          recap: "A queue holds work.",
          masteredConcepts: ["queue"],
          suggestedNextTopics: ["Dead letter queues"],
        });

        assert.equal(handlers.lessonEndings[0]?.recap, "A queue holds work.");
        assert.deepEqual(handlers.lessonEndings[0]?.suggestedNextTopics, ["Dead letter queues"]);
      });

      it("tells the model the learner can start another lesson", async () => {
        const { tool } = await toolNamed("end_lesson");

        const { text } = await runTool(tool, { recap: "A queue holds work." });

        assert.match(text, /another lesson/i);
      });
    });

    describe("a tool called after the turn has already paused", () => {
      it("shows the learner nothing and asks the model to end its turn", async () => {
        const handlers = new FakeTeachingToolHandlers();
        handlers.refuseBecausePaused = true;
        const { tool } = await toolNamed("define_term", handlers);

        const { text } = await runTool(tool, {
          term: "queue",
          plainLanguageMeaning: "A line of waiting work.",
        });

        assert.match(text, /Nothing was shown/i);
        assert.match(text, /End your turn now/i);
        assert.deepEqual(handlers.definitions, []);
      });

      it("does not fail the turn, so the learner never sees an error for it", async () => {
        const handlers = new FakeTeachingToolHandlers();
        handlers.refuseBecausePaused = true;
        const { tool } = await toolNamed("pause_lesson", handlers);

        const { details } = await runTool(tool, {
          reason: "Read that again.",
          suggestedWaitSeconds: 15,
        });

        assert.deepEqual(details, { refused: "lesson_already_paused" });
      });
    });

    describe("draw_diagram", () => {
      it("passes the diagram on, with no coordinates or colours to supply", async () => {
        const { tool, handlers } = await toolNamed("draw_diagram");

        const { text } = await runTool(tool, {
          diagramId: "queue-basics",
          title: "How a message queue moves work",
          direction: "left_to_right",
          nodes: [
            { nodeId: "producer", label: "Producer", shape: "endpoint" },
            { nodeId: "queue", label: "Queue", shape: "step" },
          ],
          edges: [
            { edgeId: "put", fromNodeId: "producer", toNodeId: "queue", kind: "directed" },
          ],
          emphasizedNodeIds: ["queue"],
        });

        const spec = handlers.diagrams[0]?.spec as Record<string, unknown>;
        assert.equal(spec["title"], "How a message queue moves work");
        assert.match(text, /2 parts and 1 joins?/);
        assert.doesNotMatch(JSON.stringify(requiredParametersOf(tool)), /colour|color|width|x|y/);
      });

      it("treats a diagram with no joins as having none", async () => {
        const { tool, handlers } = await toolNamed("draw_diagram");

        await runTool(tool, {
          diagramId: "one-thing",
          title: "One thing",
          direction: "top_to_bottom",
          nodes: [{ nodeId: "only", label: "Only", shape: "step" }],
        });

        const spec = handlers.diagrams[0]?.spec as Record<string, unknown>;
        assert.deepEqual(spec["edges"], []);
        assert.deepEqual(spec["groups"], []);
      });

      it("tells the model the learner can also read the diagram as sentences", async () => {
        const { tool } = await toolNamed("draw_diagram");

        const { text } = await runTool(tool, {
          diagramId: "one-thing",
          title: "One thing",
          direction: "top_to_bottom",
          nodes: [{ nodeId: "only", label: "Only", shape: "step" }],
        });

        assert.match(text, /list of sentences/);
      });
    });

    describe("show_illustration", () => {
      const illustrationParameters = {
        prompt: "A line of parcels waiting on a belt.",
        size: "1024x1024",
        style: "diagram_sketch",
        alternativeText: "Parcels queued on a belt.",
      };

      it("asks for the picture and says it is not there yet", async () => {
        const { tool, handlers } = await toolNamed("show_illustration");

        const { text } = await runTool(tool, { ...illustrationParameters });

        assert.equal(handlers.illustrations[0]?.prompt, "A line of parcels waiting on a belt.");
        assert.match(text, /being drawn/);
        assert.match(text, /Never say what the picture shows/);
      });

      it("requires words for a learner who cannot see the picture", async () => {
        const { tool } = await toolNamed("show_illustration");

        assert.ok(requiredParametersOf(tool).includes("alternativeText"));
      });

      it("says plainly that there are no pictures, rather than failing the turn", async () => {
        const handlers = new FakeTeachingToolHandlers();
        handlers.canDrawPictures = false;
        const { tool } = await toolNamed("show_illustration", handlers);

        const { text, details } = await runTool(tool, { ...illustrationParameters });

        assert.match(text, /cannot draw pictures/);
        assert.match(text, /do not offer a picture again/);
        assert.deepEqual(details, { refused: "no_image_provider" });
      });
    });

    describe("list_lesson_references", () => {
      it("says there is no background when the learner supplied none", async () => {
        const { tool } = await toolNamed("list_lesson_references");

        const { text } = await runTool(tool, {});

        assert.match(text, /supplied no background/);
      });

      it("names each reference by id and label, and never its content", async () => {
        const handlers = new FakeTeachingToolHandlers();
        handlers.storedReferences = [
          {
            referenceId: "reference-1",
            lessonId: "lesson-abc123",
            kind: "url",
            label: "Queue guide",
            sourceUrl: "https://example.com/queues",
            title: "Queue guide",
            mediaType: "text/html",
            byteLength: 400,
            lineCount: 12,
            copiedAt: "2024-05-01T10:00:00.000Z",
            contentFileName: "reference-1.txt",
          },
        ];
        const { tool } = await toolNamed("list_lesson_references", handlers);

        const { text } = await runTool(tool, {});

        assert.match(text, /reference-1/);
        assert.match(text, /Queue guide/);
        assert.match(text, /12 lines/);
        assert.match(text, /read_lesson_reference/);
      });
    });

    describe("read_lesson_reference", () => {
      function excerpt(overrides: Record<string, unknown> = {}) {
        return {
          text: "A queue holds work.\nA worker takes the oldest item.",
          firstLineNumber: 1,
          lineCount: 2,
          totalLineCount: 40,
          byteLength: 50,
          totalByteLength: 900,
          truncated: true,
          truncationReason: "line_limit" as const,
          nextLineNumber: 3,
          referenceId: "reference-1",
          lessonId: "lesson-abc123",
          label: "Queue guide",
          sourceUrl: "https://example.com/queues",
          ...overrides,
        };
      }

      it("reads a window and says where to carry on from", async () => {
        const handlers = new FakeTeachingToolHandlers();
        handlers.referenceExcerpt = excerpt();
        const { tool } = await toolNamed("read_lesson_reference", handlers);

        const { text } = await runTool(tool, { referenceId: "reference-1", offset: 1, limit: 2 });

        assert.match(text, /lines 1 to 2 of 40/);
        assert.match(text, /Read on from line 3/);
        assert.match(text, /A queue holds work\./);
        assert.deepEqual(handlers.referenceReads, [
          { referenceId: "reference-1", offset: 1, limit: 2 },
        ]);
      });

      it("starts at the top when the model asks for no particular line", async () => {
        const handlers = new FakeTeachingToolHandlers();
        handlers.referenceExcerpt = excerpt();
        const { tool } = await toolNamed("read_lesson_reference", handlers);

        await runTool(tool, { referenceId: "reference-1" });

        assert.equal(handlers.referenceReads[0]?.offset, 1);
        assert.equal(handlers.referenceReads[0]?.limit, 2000);
      });

      it("says when the end has been reached, so the model stops asking", async () => {
        const handlers = new FakeTeachingToolHandlers();
        handlers.referenceExcerpt = excerpt({ nextLineNumber: null, truncated: false });
        const { tool } = await toolNamed("read_lesson_reference", handlers);

        const { text } = await runTool(tool, { referenceId: "reference-1" });

        assert.match(text, /end of the reference/);
      });

      it("does not repeat the text in the tool details, which would double the cost", async () => {
        const handlers = new FakeTeachingToolHandlers();
        handlers.referenceExcerpt = excerpt();
        const { tool } = await toolNamed("read_lesson_reference", handlers);

        const { details } = await runTool(tool, { referenceId: "reference-1" });

        assert.equal((details as Record<string, unknown>)["text"], undefined);
        assert.equal((details as Record<string, unknown>)["nextLineNumber"], 3);
      });

      it("tells the model to check the id rather than failing the turn", async () => {
        const handlers = new FakeTeachingToolHandlers();
        handlers.referenceExcerpt = null;
        const { tool } = await toolNamed("read_lesson_reference", handlers);

        const { text, details } = await runTool(tool, { referenceId: "reference-9" });

        assert.match(text, /has no reference "reference-9"/);
        assert.match(text, /list_lesson_references/);
        assert.deepEqual(details, { refused: "unknown_reference" });
      });
    });
  },
);
