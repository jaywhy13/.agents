import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LearnerDiagramScene } from "../../shared/visuals/diagram-workspace-state.ts";
import type {
  LearnerSceneStorage,
  TaughtDiagramIdentity,
} from "../../frontend/src/visuals/learner-diagram-store.ts";
import {
  learnerDiagramStorageKey,
  LearnerDiagramStore,
  UnusableDiagramIdentityError,
} from "../../frontend/src/visuals/learner-diagram-store.ts";

/** The browser's own storage, as a map, so a test needs no browser. */
class FakeStorage implements LearnerSceneStorage {
  readonly items = new Map<string, string>();
  failOnWrite = false;

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failOnWrite) {
      throw new Error("The storage area is full.");
    }
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

function learnerScene(overrides: Partial<LearnerDiagramScene> = {}): LearnerDiagramScene {
  return {
    elements: [{ id: "queue", x: 40 }],
    appState: { viewBackgroundColor: "#ffffff" },
    savedAt: "2024-05-01T10:00:00.000Z",
    ...overrides,
  };
}

function diagram(overrides: Partial<TaughtDiagramIdentity> = {}): TaughtDiagramIdentity {
  return { lessonId: "lesson-1", diagramId: "queue-basics", revision: 1, ...overrides };
}

describe("LearnerDiagramStore", () => {
  it("gives back what the learner drew, for this lesson and this diagram", () => {
    const store = new LearnerDiagramStore(new FakeStorage());

    store.save(diagram(), learnerScene());

    assert.deepEqual(store.load(diagram()), learnerScene());
  });

  it("keeps one lesson's drawing out of another's", () => {
    const store = new LearnerDiagramStore(new FakeStorage());

    store.save(diagram(), learnerScene());

    assert.equal(store.load(diagram({ lessonId: "lesson-2" })), null);
    assert.equal(store.load(diagram({ diagramId: "other-diagram" })), null);
  });

  it("forgets a drawing when the learner resets it", () => {
    const store = new LearnerDiagramStore(new FakeStorage());
    store.save(diagram(), learnerScene());

    store.forget(diagram());

    assert.equal(store.load(diagram()), null);
  });

  it("throws away a record that does not check out, rather than drawing it", () => {
    const storage = new FakeStorage();
    storage.items.set(learnerDiagramStorageKey(diagram()), '{"elements":"not a list"}');
    const store = new LearnerDiagramStore(storage);

    assert.equal(store.load(diagram()), null);
    // Removed, so the taught diagram comes back instead of failing every time.
    assert.equal(storage.items.size, 0);
  });

  it("throws away a record that is not readable at all", () => {
    const storage = new FakeStorage();
    storage.items.set(learnerDiagramStorageKey(diagram()), "{oh dear");
    const store = new LearnerDiagramStore(storage);

    assert.equal(store.load(diagram()), null);
  });

  it("carries on when the browser refuses to store anything", () => {
    const storage = new FakeStorage();
    storage.failOnWrite = true;
    const store = new LearnerDiagramStore(storage);

    // Losing the edits at the next reload must never break the lesson.
    store.save(diagram(), learnerScene());

    assert.equal(store.load(diagram()), null);
  });

  it("carries on when there is no storage at all", () => {
    const store = new LearnerDiagramStore(null);

    store.save(diagram(), learnerScene());

    assert.equal(store.load(diagram()), null);
  });
});

/**
 * A lesson may draw the same diagram again with more on it. Each taught revision is
 * a separate drawing to edit, so the learner's work on the earlier one is neither
 * shown on top of the newer one nor thrown away.
 */
describe("LearnerDiagramStore and an evolving diagram", () => {
  it("does not show edits made to an earlier revision on the new one", () => {
    const store = new LearnerDiagramStore(new FakeStorage());
    store.save(diagram({ revision: 1 }), learnerScene());

    assert.equal(store.load(diagram({ revision: 2 })), null);
  });

  it("keeps the edits made to an earlier revision", () => {
    const store = new LearnerDiagramStore(new FakeStorage());
    store.save(diagram({ revision: 1 }), learnerScene());

    store.save(diagram({ revision: 2 }), learnerScene({ elements: [{ id: "queue", x: 900 }] }));

    assert.deepEqual(store.load(diagram({ revision: 1 })), learnerScene());
  });

  it("forgets only the revision the learner reset", () => {
    const store = new LearnerDiagramStore(new FakeStorage());
    store.save(diagram({ revision: 1 }), learnerScene());
    store.save(diagram({ revision: 2 }), learnerScene());

    store.forget(diagram({ revision: 2 }));

    assert.deepEqual(store.load(diagram({ revision: 1 })), learnerScene());
    assert.equal(store.load(diagram({ revision: 2 })), null);
  });
});

/**
 * The key is built from three values joined by colons, so any of the three holding a
 * colon would let one diagram's key be spelled as another's.
 */
describe("the storage key for one taught diagram", () => {
  it("names the lesson, the diagram and the revision", () => {
    assert.equal(
      learnerDiagramStorageKey(diagram({ revision: 3 })),
      "pi-teach:diagram:lesson-1:queue-basics:r3",
    );
  });

  it("gives two different diagrams two different keys", () => {
    const oneDiagram = learnerDiagramStorageKey({
      lessonId: "lesson-1",
      diagramId: "queue",
      revision: 1,
    });
    const anotherDiagram = learnerDiagramStorageKey({
      lessonId: "lesson-1",
      diagramId: "queue-2",
      revision: 1,
    });

    assert.notEqual(oneDiagram, anotherDiagram);
  });

  it("refuses a lesson id that could be read as two parts of a key", () => {
    assert.throws(
      () => learnerDiagramStorageKey(diagram({ lessonId: "lesson-1:queue-basics" })),
      UnusableDiagramIdentityError,
    );
  });

  it("refuses a diagram id that could be read as two parts of a key", () => {
    assert.throws(
      () => learnerDiagramStorageKey(diagram({ diagramId: "queue:r1" })),
      UnusableDiagramIdentityError,
    );
  });

  it("refuses a revision that is not a counting number", () => {
    assert.throws(
      () => learnerDiagramStorageKey(diagram({ revision: 0 })),
      UnusableDiagramIdentityError,
    );
    assert.throws(
      () => learnerDiagramStorageKey(diagram({ revision: 1.5 })),
      UnusableDiagramIdentityError,
    );
  });
});

/**
 * The identity comes from a beat the lesson server already checked, so an unusable
 * one is a bug rather than something a learner can cause. It still must not take the
 * lesson page down: the taught diagram is shown instead of nothing at all.
 */
describe("LearnerDiagramStore given a diagram it cannot name", () => {
  it("reports no saved edits rather than failing the page", () => {
    const store = new LearnerDiagramStore(new FakeStorage());

    assert.equal(store.load({ lessonId: "lesson-1", diagramId: "queue", revision: 0 }), null);
  });

  it("writes nothing rather than failing the page", () => {
    const storage = new FakeStorage();
    const store = new LearnerDiagramStore(storage);

    store.save({ lessonId: "lesson-1", diagramId: "queue:r1", revision: 1 }, learnerScene());

    assert.equal(storage.items.size, 0);
  });

  it("forgets nothing rather than failing the page", () => {
    const store = new LearnerDiagramStore(new FakeStorage());

    assert.doesNotThrow(() =>
      store.forget({ lessonId: "lesson-1", diagramId: "queue", revision: -1 }),
    );
  });
});
