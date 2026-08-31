import type { LearnerDiagramScene } from "../../../shared/visuals/diagram-workspace-state.ts";
import { parseLearnerDiagramScene } from "../../../shared/visuals/diagram-workspace-state.ts";

/**
 * Keeps what the learner drew, on the learner's own machine.
 *
 * A learner who moves the boxes about and then reloads the page should find their
 * version, not the taught one. The edits are kept in the browser's own storage,
 * under the lesson, the diagram and the revision of that diagram, so:
 *
 * - nothing the learner draws is sent anywhere, including to the lesson server;
 * - one lesson's edits never show up in another's;
 * - a lesson that draws the same diagram again with more on it shows the new taught
 *   drawing, rather than the learner's edits to the old one drawn over the top;
 * - the taught diagram is untouched, so "Reset" stays truthful.
 *
 * Anything read back is checked, because storage is shared with every other page on
 * `127.0.0.1` and so is not trusted input. A record that does not check out is
 * treated as no record and thrown away.
 */

const STORAGE_KEY_PREFIX = "pi-teach:diagram:";

/**
 * The key is these three values joined by colons, so none of them may hold a colon:
 * `lesson-1:queue` and `lesson` + `1:queue` would otherwise be the same key. Both ids
 * are already checked to this alphabet where the beat is parsed; checking again here
 * is what makes the key's own rule true rather than inherited.
 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** Which taught drawing a set of learner edits belongs to. */
export interface TaughtDiagramIdentity {
  readonly lessonId: string;
  readonly diagramId: string;
  /** Which taught revision of that diagram. Counts from one. */
  readonly revision: number;
}

export class UnusableDiagramIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnusableDiagramIdentityError";
  }
}

/** Lets a test drive this without a browser, and a page with storage turned off. */
export interface LearnerSceneStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserSceneStorage(): LearnerSceneStorage | null {
  try {
    // Reading it is enough: a browser with storage blocked throws right here.
    const storage = window.localStorage;
    const probeKey = `${STORAGE_KEY_PREFIX}probe`;
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}

export function learnerDiagramStorageKey(diagram: TaughtDiagramIdentity): string {
  requireIdentifier(diagram.lessonId, "lesson id");
  requireIdentifier(diagram.diagramId, "diagram id");
  if (!Number.isInteger(diagram.revision) || diagram.revision < 1) {
    throw new UnusableDiagramIdentityError(
      `A diagram revision must be a whole number of 1 or more. Received ${String(diagram.revision)}.`,
    );
  }
  return `${STORAGE_KEY_PREFIX}${diagram.lessonId}:${diagram.diagramId}:r${diagram.revision}`;
}

/**
 * The store keeps the learner's edits, or keeps none.
 *
 * A diagram this store cannot name is treated as a diagram with no saved edits: the
 * taught drawing is shown and nothing is written. That is deliberately not how the
 * key itself behaves — `learnerDiagramStorageKey` refuses an unusable name outright,
 * so the collision rule is enforced rather than worked around. Turning that refusal
 * into "no edits" happens only here, because this is page code: a lesson that showed
 * the taught diagram is far better than a lesson that showed a blank screen.
 */
export class LearnerDiagramStore {
  private readonly storage: LearnerSceneStorage | null;

  constructor(storage: LearnerSceneStorage | null = browserSceneStorage()) {
    this.storage = storage;
  }

  load(diagram: TaughtDiagramIdentity): LearnerDiagramScene | null {
    const key = this.keyOrNull(diagram);
    const stored = key === null ? null : (this.storage?.getItem(key) ?? null);
    if (stored === null) {
      return null;
    }

    try {
      return parseLearnerDiagramScene(JSON.parse(stored));
    } catch {
      // A record that cannot be read is worse than none: it would draw something
      // the learner never made. It is removed so the taught diagram comes back.
      this.forget(diagram);
      return null;
    }
  }

  save(diagram: TaughtDiagramIdentity, scene: LearnerDiagramScene): void {
    const key = this.keyOrNull(diagram);
    if (key === null) {
      return;
    }
    try {
      this.storage?.setItem(key, JSON.stringify(scene));
    } catch {
      // Storage full or blocked. The learner keeps their edits for this visit; they
      // just will not survive a reload. Losing that must never break the lesson.
    }
  }

  forget(diagram: TaughtDiagramIdentity): void {
    const key = this.keyOrNull(diagram);
    if (key === null) {
      return;
    }
    try {
      this.storage?.removeItem(key);
    } catch {
      // Nothing to do: the record is either gone or unreachable.
    }
  }

  private keyOrNull(diagram: TaughtDiagramIdentity): string | null {
    try {
      return learnerDiagramStorageKey(diagram);
    } catch {
      return null;
    }
  }
}

function requireIdentifier(candidate: string, fieldName: string): void {
  if (!IDENTIFIER_PATTERN.test(candidate)) {
    throw new UnusableDiagramIdentityError(
      `A ${fieldName} must be 1 to 64 letters, digits, hyphens or underscores. Received "${candidate}".`,
    );
  }
}
