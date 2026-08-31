import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type {
  CodeBeat,
  ConceptCardBeat,
  DefinitionBeat,
  DiagramBeat,
  ImageBeat,
  LessonEndBeat,
  NarrationChunk,
  PauseBeat,
  QuizBeat,
} from "../../shared/beat.ts";
import { LONGEST_SUGGESTED_WAIT_SECONDS } from "../../shared/beat.ts";
import type { QuizGrade } from "../../shared/learner-history.ts";
import {
  ILLUSTRATION_STYLES,
  IMAGE_SIZES,
  LONGEST_ALTERNATIVE_TEXT_CHARACTERS,
  LONGEST_PROMPT_CHARACTERS,
} from "../../shared/visuals/illustration-request.ts";
import {
  DIAGRAM_DIRECTIONS,
  EDGE_KINDS,
  FIRST_DIAGRAM_REVISION,
  LONGEST_EDGE_LABEL_CHARACTERS,
  LONGEST_GROUP_LABEL_CHARACTERS,
  LONGEST_NODE_LABEL_CHARACTERS,
  LONGEST_TITLE_CHARACTERS,
  MOST_DIAGRAM_REVISIONS,
  MOST_EDGES,
  MOST_EMPHASIZED_PARTS,
  MOST_GROUPS,
  MOST_NODES,
  NODE_SHAPES,
} from "../../shared/visuals/graph-diagram-spec.ts";
import {
  MAXIMUM_EXCERPT_LINES,
} from "../references/reference-excerpt.ts";
import type { ReferenceExcerpt } from "../references/reference-library-service.ts";
import type { StoredReference } from "../references/reference.ts";
import {
  referenceExcerptReport,
  referenceListing,
  referenceNotFound,
} from "../domain/reference-guidance.ts";
import {
  beatRefusedAfterPause,
  codeShown,
  conceptCardTaught,
  definitionTaught,
  diagramDrawn,
  freeTextAnswerGraded,
  illustrationRequested,
  illustrationUnavailable,
  lessonEnded,
  lessonPaused,
  quizAsked,
} from "../domain/tool-guidance.ts";
import type {
  CodeRequest,
  ConceptCardRequest,
  DefinitionRequest,
  DiagramRequest,
  LessonEndRequest,
  PauseRequest,
  QuizRequest,
} from "./beat-publisher.ts";
import { LessonAlreadyPausedError } from "./beat-publisher.ts";
import type { AgentGrade, QuizGradingOutcome } from "./quiz-grading-service.ts";

export const TEACH_CONCEPT_TOOL_NAME = "teach_concept";
export const DEFINE_TERM_TOOL_NAME = "define_term";
export const SHOW_CODE_TOOL_NAME = "show_code";
export const DRAW_DIAGRAM_TOOL_NAME = "draw_diagram";
export const SHOW_ILLUSTRATION_TOOL_NAME = "show_illustration";
export const ASK_QUIZ_QUESTION_TOOL_NAME = "ask_quiz_question";
export const GRADE_FREE_TEXT_ANSWER_TOOL_NAME = "grade_free_text_answer";
export const PAUSE_LESSON_TOOL_NAME = "pause_lesson";
export const END_LESSON_TOOL_NAME = "end_lesson";
export const LIST_LESSON_REFERENCES_TOOL_NAME = "list_lesson_references";
export const READ_LESSON_REFERENCE_TOOL_NAME = "read_lesson_reference";

/** Every tool a lesson may call. The lesson has no file, shell or edit tool. */
export const TEACHING_TOOL_NAMES = [
  TEACH_CONCEPT_TOOL_NAME,
  DEFINE_TERM_TOOL_NAME,
  SHOW_CODE_TOOL_NAME,
  DRAW_DIAGRAM_TOOL_NAME,
  SHOW_ILLUSTRATION_TOOL_NAME,
  ASK_QUIZ_QUESTION_TOOL_NAME,
  GRADE_FREE_TEXT_ANSWER_TOOL_NAME,
  PAUSE_LESSON_TOOL_NAME,
  END_LESSON_TOOL_NAME,
  LIST_LESSON_REFERENCES_TOOL_NAME,
  READ_LESSON_REFERENCE_TOOL_NAME,
] as const;

/**
 * What the tools are allowed to do. The adapters below only translate: they turn
 * tool parameters into a service request and the service's answer into words the
 * model can act on. Every teaching decision lives behind this interface.
 */
export interface TeachingToolHandlers {
  publishConceptCard(request: ConceptCardRequest): Promise<ConceptCardBeat>;
  publishDefinition(request: DefinitionRequest): Promise<DefinitionBeat>;
  publishCode(request: CodeRequest): Promise<CodeBeat>;
  publishDiagram(request: DiagramRequest): Promise<DiagramBeat>;
  /**
   * Returns null when the lesson cannot draw pictures at all. The picture itself is
   * drawn after this resolves, so a lesson turn is never held up by it.
   */
  requestIllustration(request: IllustrationToolRequest): Promise<ImageBeat | null>;
  publishQuiz(request: QuizRequest): Promise<QuizBeat>;
  publishPause(request: PauseRequest): Promise<PauseBeat>;
  publishLessonEnd(request: LessonEndRequest): Promise<LessonEndBeat>;
  gradeFreeTextAnswer(grade: AgentGrade): Promise<QuizGradingOutcome>;
  listReferences(): Promise<readonly StoredReference[]>;
  /** Null when this lesson has no reference under that id. */
  readReference(request: ReferenceReadRequest): Promise<ReferenceExcerpt | null>;
}

export interface IllustrationToolRequest {
  readonly prompt: string;
  readonly size: string;
  readonly style: string;
  readonly alternativeText: string;
  readonly narration: readonly NarrationChunk[];
}

export interface ReferenceReadRequest {
  readonly referenceId: string;
  readonly offset: number;
  readonly limit: number;
}

const narrationParameter = Type.Optional(
  Type.Array(
    Type.Object({
      kind: Type.Union([Type.Literal("sentence"), Type.Literal("emphasis"), Type.Literal("term")]),
      text: Type.String({ description: "Spoken words only. No markup, no lists, no code." }),
    }),
    {
      maxItems: 12,
      description:
        "What to say out loud about this beat, cut into short chunks. Mark a glossary term as a term chunk.",
    },
  ),
);

export function createTeachingTools(handlers: TeachingToolHandlers) {
  return [
    createTeachConceptTool(handlers),
    createDefineTermTool(handlers),
    createShowCodeTool(handlers),
    createDrawDiagramTool(handlers),
    createShowIllustrationTool(handlers),
    createAskQuizQuestionTool(handlers),
    createGradeFreeTextAnswerTool(handlers),
    createPauseLessonTool(handlers),
    createEndLessonTool(handlers),
    createListLessonReferencesTool(handlers),
    createReadLessonReferenceTool(handlers),
  ];
}

export function createTeachConceptTool(handlers: TeachingToolHandlers) {
  return defineTool({
    name: TEACH_CONCEPT_TOOL_NAME,
    label: "Teach concept",
    description:
      "Show one concept to the learner as a concept card, and narrate it. Call this once per concept. " +
      "Anything you do not send through a tool is never seen by the learner.",
    parameters: Type.Object({
      title: Type.String({ description: "A short name for this one concept. No acronyms." }),
      plainLanguageSummary: Type.String({
        description:
          "The concept in a few short sentences of plain language. Shown on screen. One idea per sentence.",
      }),
      keyPoints: Type.Array(Type.String(), {
        minItems: 1,
        maxItems: 6,
        description:
          "Short lines the learner can scan. Each line must make sense on its own, without the title.",
      }),
      narrationScript: Type.String({
        description:
          "The same concept written to be read out loud. Spoken words only: no markup, no lists, no code.",
      }),
      pauseForLearner: Type.Boolean({
        description:
          "True when the lesson should stop and wait for the learner before the next concept. Use this often.",
      }),
    }),
    execute: async (_toolCallId, parameters) =>
      publishing(async () => {
        const beat = await handlers.publishConceptCard({
          title: parameters.title,
          plainLanguageSummary: parameters.plainLanguageSummary,
          keyPoints: parameters.keyPoints,
          narrationScript: parameters.narrationScript,
          pauseForLearner: parameters.pauseForLearner,
        });
        return { text: conceptCardTaught(beat), details: beat };
      }),
  });
}

export function createDefineTermTool(handlers: TeachingToolHandlers) {
  return defineTool({
    name: DEFINE_TERM_TOOL_NAME,
    label: "Define term",
    description:
      "Give the learner one word or phrase, in plain language. The term goes into the glossary panel, " +
      "stays there for the whole lesson, and is highlighted wherever it appears. Define a term before you use it.",
    parameters: Type.Object({
      term: Type.String({ description: "The word or phrase exactly as the lesson will use it." }),
      fullForm: Type.Optional(
        Type.String({
          description:
            "The term written out in full when it is an acronym or an abbreviation. Leave out otherwise.",
        }),
      ),
      plainLanguageMeaning: Type.String({
        description:
          "What it means, in one or two short sentences a beginner would understand. No jargon, no other acronyms.",
      }),
      example: Type.Optional(
        Type.String({ description: "One short everyday example of the term in use." }),
      ),
      narration: narrationParameter,
    }),
    execute: async (_toolCallId, parameters) =>
      publishing(async () => {
        const beat = await handlers.publishDefinition({
          term: parameters.term,
          fullForm: parameters.fullForm ?? null,
          plainLanguageMeaning: parameters.plainLanguageMeaning,
          example: parameters.example ?? null,
          narration: narrationChunksOf(parameters.narration),
        });
        return { text: definitionTaught(beat), details: beat };
      }),
  });
}

export function createShowCodeTool(handlers: TeachingToolHandlers) {
  return defineTool({
    name: SHOW_CODE_TOOL_NAME,
    label: "Show code",
    description:
      "Show a short piece of code, highlighted, with a copy button. Keep it small: show the few lines " +
      "that carry the idea, not a whole file.",
    parameters: Type.Object({
      language: Type.String({
        description: 'The language, for highlighting. For example "typescript", "python", "sql".',
      }),
      fileName: Type.Optional(
        Type.String({ description: "The file this came from, when there is one." }),
      ),
      code: Type.String({ description: "The code itself. No surrounding fences." }),
      explanation: Type.String({
        description: "What this code does, in a few short sentences of plain language.",
      }),
      emphasizedLineRanges: Type.Optional(
        Type.Array(
          Type.Object({
            startLine: Type.Integer({ minimum: 1 }),
            endLine: Type.Integer({ minimum: 1 }),
          }),
          {
            maxItems: 5,
            description:
              "The lines the learner should look at, counted from 1. Both ends are included.",
          },
        ),
      ),
      narration: narrationParameter,
    }),
    execute: async (_toolCallId, parameters) =>
      publishing(async () => {
        const beat = await handlers.publishCode({
          language: parameters.language,
          fileName: parameters.fileName ?? null,
          code: parameters.code,
          explanation: parameters.explanation,
          emphasizedLineRanges: parameters.emphasizedLineRanges ?? [],
          narration: narrationChunksOf(parameters.narration),
        });
        return { text: codeShown(beat), details: beat };
      }),
  });
}

export function createDrawDiagramTool(handlers: TeachingToolHandlers) {
  return defineTool({
    name: DRAW_DIAGRAM_TOOL_NAME,
    label: "Draw a diagram",
    description:
      "Draw the shape of an idea: the parts, and how they join. Say what the diagram means; the lesson " +
      "decides what it looks like, so do not describe colours, sizes or positions. The learner can move the " +
      "boxes about, and gets the same diagram as a list of sentences. Use this when the idea is a flow, a " +
      "pipeline, or a set of parts that talk to each other. To build one diagram up in stages, draw it again " +
      "with the same diagramId and the next revision.",
    parameters: Type.Object({
      diagramId: Type.String({
        description:
          'A short stable name for this diagram, letters, digits, hyphen or underscore. For example "queue-basics".',
      }),
      revision: Type.Optional(
        Type.Integer({
          minimum: FIRST_DIAGRAM_REVISION,
          maximum: MOST_DIAGRAM_REVISIONS,
          description:
            "Which drawing of this diagram this is. Leave it out for the first one. To show the same diagram " +
            "again with more on it, keep the diagramId and give the next number: the learner then sees the new " +
            "drawing, and anything they drew on the earlier one is kept with that one.",
        }),
      ),
      title: Type.String({
        description: "What the diagram is about, in a few words.",
        maxLength: LONGEST_TITLE_CHARACTERS,
      }),
      direction: Type.Union(
        DIAGRAM_DIRECTIONS.map((direction) => Type.Literal(direction)),
        {
          description:
            "left_to_right for a flow the learner reads across, top_to_bottom for one they read down.",
        },
      ),
      nodes: Type.Array(
        Type.Object({
          nodeId: Type.String({ description: 'A short name such as "queue".' }),
          label: Type.String({
            description: "What this part is called, in the learner's words.",
            maxLength: LONGEST_NODE_LABEL_CHARACTERS,
          }),
          shape: Type.Union(
            NODE_SHAPES.map((shape) => Type.Literal(shape)),
            {
              description:
                "endpoint for where something starts or ends, decision for a question, step for everything else.",
            },
          ),
        }),
        {
          minItems: 1,
          maxItems: MOST_NODES,
          description: "The parts of the diagram. Keep it to the few that carry the idea.",
        },
      ),
      edges: Type.Optional(
        Type.Array(
          Type.Object({
            edgeId: Type.String({ description: 'A short name such as "put".' }),
            fromNodeId: Type.String({ description: "A nodeId from the list above." }),
            toNodeId: Type.String({ description: "A nodeId from the list above." }),
            kind: Type.Union(
              EDGE_KINDS.map((kind) => Type.Literal(kind)),
              { description: "directed when it goes one way, undirected when it goes both." },
            ),
            label: Type.Optional(
              Type.String({
                description:
                  "What the join means, when the two labels do not already say it. A few words.",
                maxLength: LONGEST_EDGE_LABEL_CHARACTERS,
              }),
            ),
          }),
          { maxItems: MOST_EDGES, description: "How the parts join." },
        ),
      ),
      groups: Type.Optional(
        Type.Array(
          Type.Object({
            groupId: Type.String(),
            label: Type.String({ maxLength: LONGEST_GROUP_LABEL_CHARACTERS }),
            memberNodeIds: Type.Array(Type.String(), { minItems: 1 }),
          }),
          {
            maxItems: MOST_GROUPS,
            description: "Parts that belong together, drawn inside one named box.",
          },
        ),
      ),
      emphasizedNodeIds: Type.Optional(
        Type.Array(Type.String(), {
          maxItems: MOST_EMPHASIZED_PARTS,
          description: "The parts this beat is actually about. The lesson marks them.",
        }),
      ),
      emphasizedEdgeIds: Type.Optional(
        Type.Array(Type.String(), { maxItems: MOST_EMPHASIZED_PARTS }),
      ),
      narration: narrationParameter,
    }),
    execute: async (_toolCallId, parameters) =>
      publishing(async () => {
        const beat = await handlers.publishDiagram({
          spec: {
            diagramId: parameters.diagramId,
            revision: parameters.revision ?? FIRST_DIAGRAM_REVISION,
            title: parameters.title,
            direction: parameters.direction,
            nodes: parameters.nodes,
            edges: (parameters.edges ?? []).map((edge) => ({
              edgeId: edge.edgeId,
              fromNodeId: edge.fromNodeId,
              toNodeId: edge.toNodeId,
              kind: edge.kind,
              label: edge.label ?? null,
            })),
            groups: parameters.groups ?? [],
            emphasis: {
              nodeIds: parameters.emphasizedNodeIds ?? [],
              edgeIds: parameters.emphasizedEdgeIds ?? [],
            },
          },
          narration: narrationChunksOf(parameters.narration),
        });
        return { text: diagramDrawn(beat), details: beat };
      }),
  });
}

export function createShowIllustrationTool(handlers: TeachingToolHandlers) {
  return defineTool({
    name: SHOW_ILLUSTRATION_TOOL_NAME,
    label: "Show an illustration",
    description:
      "Ask for a drawn picture of something the learner has no picture of yet, such as a physical thing or an " +
      "everyday comparison. Use draw_diagram instead for parts and how they join. The picture takes a few " +
      "seconds and may fail, so keep teaching after this and never say what the picture shows beyond the " +
      "words you give in alternativeText.",
    parameters: Type.Object({
      prompt: Type.String({
        description:
          "What to draw, in plain words. No art direction and no style words: the style is the field below.",
        maxLength: LONGEST_PROMPT_CHARACTERS,
      }),
      size: Type.Union(
        IMAGE_SIZES.map((size) => Type.Literal(size)),
        { description: "Square unless the idea is clearly wide or clearly tall." },
      ),
      style: Type.Union(
        ILLUSTRATION_STYLES.map((style) => Type.Literal(style)),
        {
          description:
            "diagram_sketch for an explanatory drawing, flat_illustration for a simple picture, photograph for a real thing.",
        },
      ),
      alternativeText: Type.String({
        description:
          "What the picture shows, for a learner who cannot see it. This is shown while the picture is drawn, " +
          "and instead of it if the drawing fails, so it has to teach on its own.",
        maxLength: LONGEST_ALTERNATIVE_TEXT_CHARACTERS,
      }),
      narration: narrationParameter,
    }),
    execute: async (_toolCallId, parameters) =>
      publishing(async () => {
        const beat = await handlers.requestIllustration({
          prompt: parameters.prompt,
          size: parameters.size,
          style: parameters.style,
          alternativeText: parameters.alternativeText,
          narration: narrationChunksOf(parameters.narration),
        });
        if (beat === null) {
          return { text: illustrationUnavailable(), details: { refused: "no_image_provider" } };
        }
        return { text: illustrationRequested(beat), details: beat };
      }),
  });
}

export function createListLessonReferencesTool(handlers: TeachingToolHandlers) {
  return defineTool({
    name: LIST_LESSON_REFERENCES_TOOL_NAME,
    label: "List lesson references",
    description:
      "List the background the learner supplied for this lesson: an id, a label, and how long each one is. " +
      "None of the material itself is in your prompt, so this is how you find out what there is to read.",
    parameters: Type.Object({}),
    execute: async () => {
      const references = await handlers.listReferences();
      return toolResult(referenceListing(references), references);
    },
  });
}

export function createReadLessonReferenceTool(handlers: TeachingToolHandlers) {
  return defineTool({
    name: READ_LESSON_REFERENCE_TOOL_NAME,
    label: "Read a lesson reference",
    description:
      "Read part of one reference, by line number. A read hands back at most " +
      `${MAXIMUM_EXCERPT_LINES} lines or 50 KB, and says which line to carry on from. Read a reference ` +
      "before you claim what it says.",
    parameters: Type.Object({
      referenceId: Type.String({
        description: "The id from list_lesson_references.",
      }),
      offset: Type.Optional(
        Type.Integer({
          minimum: 1,
          description: "The first line to read, counting from 1. Leave out to start at the top.",
        }),
      ),
      limit: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: MAXIMUM_EXCERPT_LINES,
          description: "How many lines to read. Ask for what you need, not for everything.",
        }),
      ),
    }),
    execute: async (_toolCallId, parameters) => {
      const excerpt = await handlers.readReference({
        referenceId: parameters.referenceId,
        offset: parameters.offset ?? 1,
        limit: parameters.limit ?? MAXIMUM_EXCERPT_LINES,
      });
      if (excerpt === null) {
        return toolResult(referenceNotFound(parameters.referenceId), {
          refused: "unknown_reference",
        });
      }
      return toolResult(referenceExcerptReport(excerpt), excerptDetailsWithoutText(excerpt));
    },
  });
}

/**
 * The excerpt's text is already in the tool result the model reads. Repeating it in
 * the structured details would double what a long read costs.
 */
function excerptDetailsWithoutText(excerpt: ReferenceExcerpt): Record<string, unknown> {
  const { text: alreadyInTheResultText, ...rest } = excerpt;
  void alreadyInTheResultText;
  return rest;
}

export function createAskQuizQuestionTool(handlers: TeachingToolHandlers) {
  return defineTool({
    name: ASK_QUIZ_QUESTION_TOOL_NAME,
    label: "Ask quiz question",
    description:
      "Ask the learner one question about what you just taught. Choices are graded by the lesson itself; " +
      "an answer in the learner's own words comes back to you to grade. Asking a question ends your turn.",
    parameters: Type.Object({
      questionId: Type.String({
        description:
          'A short stable name for this question, letters, digits, hyphen or underscore. For example "queue-order-1".',
      }),
      question: Type.String({ description: "The question, in one short sentence." }),
      answerFormat: Type.Union([Type.Literal("multiple_choice"), Type.Literal("short_text")], {
        description:
          "Use multiple_choice when the answer is a fixed set. Use short_text when you want the learner's own words.",
      }),
      choices: Type.Optional(
        Type.Array(
          Type.Object({
            choiceId: Type.String({ description: 'A short name such as "a".' }),
            text: Type.String(),
          }),
          { maxItems: 6, description: "Two to six choices. Multiple choice questions only." },
        ),
      ),
      correctChoiceIds: Type.Optional(
        Type.Array(Type.String(), {
          maxItems: 6,
          description: "Which choices are right. Multiple choice questions only.",
        }),
      ),
      correctAnswerCriteria: Type.Optional(
        Type.String({
          description:
            "What a correct answer in the learner's own words must say. Free text questions only.",
        }),
      ),
      explanation: Type.String({
        description: "The short explanation shown once the learner has answered.",
      }),
      relatedTerms: Type.Optional(
        Type.Array(Type.String(), {
          maxItems: 6,
          description:
            "The glossary terms this question tests. The lesson tracks which terms the learner is shaky on.",
        }),
      ),
      narration: narrationParameter,
    }),
    execute: async (_toolCallId, parameters) =>
      publishing(async () => {
        const beat = await handlers.publishQuiz(
          quizRequestFrom({
            questionId: parameters.questionId,
            question: parameters.question,
            answerFormat: parameters.answerFormat,
            choices: parameters.choices ?? [],
            correctChoiceIds: parameters.correctChoiceIds ?? [],
            correctAnswerCriteria: parameters.correctAnswerCriteria ?? "",
            explanation: parameters.explanation,
            relatedTerms: parameters.relatedTerms ?? [],
            narration: narrationChunksOf(parameters.narration),
          }),
        );
        return { text: quizAsked(beat), details: beat };
      }),
  });
}

export function createGradeFreeTextAnswerTool(handlers: TeachingToolHandlers) {
  return defineTool({
    name: GRADE_FREE_TEXT_ANSWER_TOOL_NAME,
    label: "Grade free text answer",
    description:
      "Grade an answer the learner wrote in their own words. Call this once, when the lesson asks you to. " +
      "Judge the meaning, not the wording.",
    parameters: Type.Object({
      questionId: Type.String({ description: "The question id the lesson gave you." }),
      grade: Type.Union(
        [Type.Literal("correct"), Type.Literal("partly_correct"), Type.Literal("incorrect")],
        {
          description:
            "correct when they have the whole idea, partly_correct when part is missing, incorrect otherwise.",
        },
      ),
      explanation: Type.String({
        description:
          "One or two short sentences the learner sees: what was right, and what was missing.",
      }),
    }),
    execute: async (_toolCallId, parameters) => {
      const outcome = await handlers.gradeFreeTextAnswer({
        questionId: parameters.questionId,
        grade: parameters.grade as QuizGrade,
        explanation: parameters.explanation,
      });
      return toolResult(freeTextAnswerGraded(outcome, parameters.questionId), outcome);
    },
  });
}

export function createPauseLessonTool(handlers: TeachingToolHandlers) {
  return defineTool({
    name: PAUSE_LESSON_TOOL_NAME,
    label: "Pause the lesson",
    description:
      "Stop and hand the lesson back to the learner. This ends your turn: return straight after calling it " +
      "and teach nothing else. The learner's next move starts a new turn.",
    parameters: Type.Object({
      reason: Type.String({
        description:
          "Why you are pausing, in one short sentence the learner reads. Say what to do while paused.",
      }),
      suggestedWaitSeconds: Type.Integer({
        minimum: 1,
        maximum: LONGEST_SUGGESTED_WAIT_SECONDS,
        description: "Roughly how long this should take the learner.",
      }),
      narration: narrationParameter,
    }),
    execute: async (_toolCallId, parameters) =>
      publishing(async () => {
        const beat = await handlers.publishPause({
          reason: parameters.reason,
          suggestedWaitSeconds: parameters.suggestedWaitSeconds,
          narration: narrationChunksOf(parameters.narration),
        });
        return { text: lessonPaused(beat), details: beat };
      }),
  });
}

export function createEndLessonTool(handlers: TeachingToolHandlers) {
  return defineTool({
    name: END_LESSON_TOOL_NAME,
    label: "End the lesson",
    description:
      "Finish the lesson with a short recap, what the learner now has, and what to learn next. " +
      "Call this once, at the end, and then stop.",
    parameters: Type.Object({
      recap: Type.String({
        description: "The whole lesson in a few short sentences of plain language.",
      }),
      masteredConcepts: Type.Optional(
        Type.Array(Type.String(), {
          maxItems: 10,
          description: "What the learner answered correctly about, in their words, not yours.",
        }),
      ),
      suggestedNextTopics: Type.Optional(
        Type.Array(Type.String(), {
          maxItems: 5,
          description: "What would sensibly come next, one short line each.",
        }),
      ),
      narration: narrationParameter,
    }),
    execute: async (_toolCallId, parameters) =>
      publishing(async () => {
        const beat = await handlers.publishLessonEnd({
          recap: parameters.recap,
          masteredConcepts: parameters.masteredConcepts ?? [],
          suggestedNextTopics: parameters.suggestedNextTopics ?? [],
          narration: narrationChunksOf(parameters.narration),
        });
        return { text: lessonEnded(beat), details: beat };
      }),
  });
}

interface PublishedToolOutcome {
  readonly text: string;
  readonly details: unknown;
}

/**
 * A beat refused because the turn already paused is not a failure of the lesson:
 * it is the guard doing its job. The model is told so and asked to end its turn,
 * rather than the turn failing and the learner seeing an error.
 */
async function publishing(publish: () => Promise<PublishedToolOutcome>) {
  try {
    const outcome = await publish();
    return toolResult(outcome.text, outcome.details);
  } catch (cause) {
    if (cause instanceof LessonAlreadyPausedError) {
      return toolResult(beatRefusedAfterPause(), { refused: "lesson_already_paused" });
    }
    throw cause;
  }
}

function toolResult(text: string, details: unknown) {
  return { content: [{ type: "text" as const, text }], details };
}

function narrationChunksOf(
  narration: ReadonlyArray<{ kind: string; text: string }> | undefined,
): readonly NarrationChunk[] {
  return (narration ?? []).map((chunk) => ({
    kind: chunk.kind as NarrationChunk["kind"],
    text: chunk.text,
  }));
}

/** One explicit branch per answer format, so the wrong fields cannot travel. */
function quizRequestFrom(parameters: {
  questionId: string;
  question: string;
  answerFormat: "multiple_choice" | "short_text";
  choices: ReadonlyArray<{ choiceId: string; text: string }>;
  correctChoiceIds: readonly string[];
  correctAnswerCriteria: string;
  explanation: string;
  relatedTerms: readonly string[];
  narration: readonly NarrationChunk[];
}): QuizRequest {
  const sharedFields = {
    questionId: parameters.questionId,
    question: parameters.question,
    explanation: parameters.explanation,
    relatedTerms: parameters.relatedTerms,
    narration: parameters.narration,
  };

  switch (parameters.answerFormat) {
    case "multiple_choice":
      return {
        ...sharedFields,
        answerFormat: "multiple_choice",
        choices: parameters.choices,
        correctChoiceIds: parameters.correctChoiceIds,
      };
    case "short_text":
      return {
        ...sharedFields,
        answerFormat: "short_text",
        correctAnswerCriteria: parameters.correctAnswerCriteria,
      };
  }
}
