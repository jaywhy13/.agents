import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  lessonBasePath,
  lessonRoutePath,
  splitTokenRoute,
} from "../shared/lesson-route.ts";

const TOKEN = "token-for-tests-only";

describe("lessonRoutePath", () => {
  it("puts the token in front of the lesson page", () => {
    assert.equal(lessonRoutePath(TOKEN), `/t/${TOKEN}/`);
  });

  it("puts the token in front of an asset", () => {
    assert.equal(lessonRoutePath(TOKEN, "/assets/app.js"), `/t/${TOKEN}/assets/app.js`);
  });
});

describe("splitTokenRoute", () => {
  it("reads the token and the path the lesson page asked for", () => {
    assert.deepEqual(splitTokenRoute(`/t/${TOKEN}/assets/app.js`), {
      token: TOKEN,
      lessonPath: "/assets/app.js",
      needsTrailingSlash: false,
    });
  });

  it("treats the token route on its own as the lesson page", () => {
    assert.deepEqual(splitTokenRoute(`/t/${TOKEN}/`), {
      token: TOKEN,
      lessonPath: "/",
      needsTrailingSlash: false,
    });
  });

  it("asks for a trailing slash, because the page's asset links are relative", () => {
    assert.deepEqual(splitTokenRoute(`/t/${TOKEN}`), {
      token: TOKEN,
      lessonPath: "/",
      needsTrailingSlash: true,
    });
  });

  it("leaves the query string out of the lesson path", () => {
    assert.equal(splitTokenRoute(`/t/${TOKEN}/api/lesson?since=3`)?.lessonPath, "/api/lesson");
  });

  it("finds no token in a path that has no token route", () => {
    assert.equal(splitTokenRoute("/api/lesson"), null);
  });

  it("finds no token in a bare token route", () => {
    assert.equal(splitTokenRoute("/t/"), null);
  });

  it("finds no token in a path that only looks like the token route", () => {
    assert.equal(splitTokenRoute("/teach/assets/app.js"), null);
  });
});

describe("lessonBasePath", () => {
  it("is the token route the page was served from", () => {
    assert.equal(lessonBasePath(`/t/${TOKEN}/`), `/t/${TOKEN}/`);
  });

  it("is the token route even when the page is at a deeper address", () => {
    assert.equal(lessonBasePath(`/t/${TOKEN}/lesson/3`), `/t/${TOKEN}/`);
  });

  it("falls back to the site root when there is no token route", () => {
    assert.equal(lessonBasePath("/"), "/");
  });
});
