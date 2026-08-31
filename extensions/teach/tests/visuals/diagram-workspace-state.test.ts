import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InvalidGraphDiagramError } from "../../shared/visuals/diagram-spec-fields.ts";
import type { LearnerDiagramScene } from "../../shared/visuals/diagram-workspace-state.ts";
import {
  discardLearnerEdits,
  displayedScene,
  hasLearnerEdits,
  isNewerRevisionOf,
  MOST_LEARNER_SCENE_ELEMENTS,
  parseLearnerDiagramScene,
  recordLearnerEdit,
  startDiagramWorkspace,
} from "../../shared/visuals/diagram-workspace-state.ts";
import { graphDiagramSpec } from "./support/graph-diagram-factory.ts";

function learnerScene(overrides: Partial<LearnerDiagramScene> = {}): LearnerDiagramScene {
  return {
    elements: [{ id: "learner-drawn-note", type: "text" }],
    appState: { viewBackgroundColor: "#ffffff" },
    savedAt: "2024-05-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("a diagram the lesson draws again with more on it", () => {
  it("holds the revision it was started from", () => {
    const workspace = startDiagramWorkspace(graphDiagramSpec({ revision: 2 }));

    assert.equal(workspace.revision, 2);
  });

  it("recognises a later drawing of the same diagram", () => {
    const workspace = startDiagramWorkspace(graphDiagramSpec({ revision: 1 }));

    assert.equal(isNewerRevisionOf(workspace, graphDiagramSpec({ revision: 2 })), true);
  });

  it("does not treat the same drawing as a later one", () => {
    const workspace = startDiagramWorkspace(graphDiagramSpec({ revision: 2 }));

    assert.equal(isNewerRevisionOf(workspace, graphDiagramSpec({ revision: 2 })), false);
    assert.equal(isNewerRevisionOf(workspace, graphDiagramSpec({ revision: 1 })), false);
  });

  it("does not treat another diagram as a later drawing of this one", () => {
    const workspace = startDiagramWorkspace(graphDiagramSpec({ revision: 1 }));

    assert.equal(
      isNewerRevisionOf(workspace, graphDiagramSpec({ diagramId: "other", revision: 5 })),
      false,
    );
  });

  it("starts a new revision from the taught drawing, with no edits carried over", () => {
    const editedFirstRevision = recordLearnerEdit(
      startDiagramWorkspace(graphDiagramSpec({ revision: 1 })),
      learnerScene(),
    );

    const secondRevision = startDiagramWorkspace(graphDiagramSpec({ revision: 2 }));

    assert.equal(hasLearnerEdits(editedFirstRevision), true);
    assert.equal(hasLearnerEdits(secondRevision), false);
    assert.equal(displayedScene(secondRevision).origin, "generated");
  });
});

describe("keeping the taught diagram and the learner's edits apart", () => {
  it("starts with the taught diagram and no edits", () => {
    const workspace = startDiagramWorkspace(graphDiagramSpec());

    assert.equal(hasLearnerEdits(workspace), false);
    assert.equal(displayedScene(workspace).origin, "generated");
  });

  it("shows the learner's version once they have changed something", () => {
    const workspace = recordLearnerEdit(startDiagramWorkspace(graphDiagramSpec()), learnerScene());

    const displayed = displayedScene(workspace);
    assert.equal(displayed.origin, "learner_edited");
  });

  it("leaves the taught diagram untouched when the learner edits", () => {
    const started = startDiagramWorkspace(graphDiagramSpec());
    const taughtScene = started.generatedScene;

    const edited = recordLearnerEdit(started, learnerScene());

    assert.deepEqual(edited.generatedScene, taughtScene);
  });

  it("gives the taught diagram back when the edits are discarded", () => {
    const started = startDiagramWorkspace(graphDiagramSpec());
    const edited = recordLearnerEdit(started, learnerScene());

    const reset = discardLearnerEdits(edited);

    assert.equal(hasLearnerEdits(reset), false);
    assert.deepEqual(displayedScene(reset), { origin: "generated", scene: started.generatedScene });
  });

  it("replaces the previous edit rather than stacking edits up", () => {
    const workspace = recordLearnerEdit(
      recordLearnerEdit(startDiagramWorkspace(graphDiagramSpec()), learnerScene()),
      learnerScene({ savedAt: "2024-05-01T11:00:00.000Z" }),
    );

    assert.equal(workspace.learnerScene?.savedAt, "2024-05-01T11:00:00.000Z");
  });

  it("changes nothing in place, so an earlier state stays usable", () => {
    const started = startDiagramWorkspace(graphDiagramSpec());

    recordLearnerEdit(started, learnerScene());

    assert.equal(started.learnerScene, null);
  });
});

describe("reading a learner scene that arrived from the page", () => {
  it("accepts a scene the editor would send", () => {
    const parsed = parseLearnerDiagramScene({
      elements: [{ id: "one" }],
      appState: { viewBackgroundColor: "#ffffff" },
      savedAt: "2024-05-01T10:00:00.000Z",
    });

    assert.equal(parsed.elements.length, 1);
  });

  it("treats a missing app state as an empty one", () => {
    const parsed = parseLearnerDiagramScene({
      elements: [],
      savedAt: "2024-05-01T10:00:00.000Z",
    });

    assert.deepEqual(parsed.appState, {});
  });

  it("refuses a scene with no element list", () => {
    assert.throws(
      () => parseLearnerDiagramScene({ savedAt: "2024-05-01T10:00:00.000Z" }),
      InvalidGraphDiagramError,
    );
  });

  it("refuses more elements than a lesson diagram could hold", () => {
    const tooManyElements = Array.from({ length: MOST_LEARNER_SCENE_ELEMENTS + 1 }, () => ({}));

    assert.throws(
      () =>
        parseLearnerDiagramScene({
          elements: tooManyElements,
          savedAt: "2024-05-01T10:00:00.000Z",
        }),
      /at most 2000 elements/,
    );
  });

  it("refuses a scene with no time on it", () => {
    assert.throws(
      () => parseLearnerDiagramScene({ elements: [], savedAt: "not a time" }),
      /ISO 8601/,
    );
  });
});
