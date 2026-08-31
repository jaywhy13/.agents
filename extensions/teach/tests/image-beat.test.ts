import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBeat, parseImageBeat } from "../shared/beat.ts";

const ILLUSTRATION_ID = "a".repeat(64);

function imagePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "image",
    beatId: "beat-10",
    lessonId: "lesson-1",
    sequenceNumber: 10,
    createdAt: "2024-05-01T10:00:00.000Z",
    illustrationId: ILLUSTRATION_ID,
    request: {
      prompt: "A line of parcels waiting on a conveyor belt for one worker to pick up.",
      size: "1024x1024",
      style: "diagram_sketch",
      alternativeText: "Parcels queued on a belt, with one worker taking the front parcel.",
    },
    ...overrides,
  };
}

describe("parseImageBeat", () => {
  it("returns what the picture is of and what to say when it cannot be seen", () => {
    const beat = parseImageBeat(imagePayload());

    assert.equal(beat.kind, "image");
    assert.equal(beat.request.size, "1024x1024");
    assert.equal(
      beat.request.alternativeText,
      "Parcels queued on a belt, with one worker taking the front parcel.",
    );
  });

  it("keeps the illustration id, which is how the page asks for the bytes", () => {
    assert.equal(parseImageBeat(imagePayload()).illustrationId, ILLUSTRATION_ID);
  });

  it("refuses an illustration id that is not a content hash, so it can never be a path", () => {
    assert.throws(
      () => parseImageBeat(imagePayload({ illustrationId: "../../etc/passwd" })),
      /illustrationId/,
    );
  });

  it("refuses a picture with no words for a learner who cannot see it", () => {
    assert.throws(
      () =>
        parseImageBeat(
          imagePayload({
            request: {
              prompt: "A conveyor belt.",
              size: "1024x1024",
              style: "diagram_sketch",
              alternativeText: "  ",
            },
          }),
        ),
      /alternativeText/,
    );
  });

  it("refuses a size the image provider does not accept", () => {
    assert.throws(
      () =>
        parseImageBeat(
          imagePayload({
            request: {
              prompt: "A conveyor belt.",
              size: "4096x4096",
              style: "diagram_sketch",
              alternativeText: "A belt.",
            },
          }),
        ),
      /size/,
    );
  });

  it("is reached through parseBeat, so a stored picture can be replayed", () => {
    assert.equal(parseBeat(imagePayload()).kind, "image");
  });
});
