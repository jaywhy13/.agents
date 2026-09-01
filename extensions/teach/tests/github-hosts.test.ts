import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isGithubReferenceHostname } from "../shared/github-hosts.ts";

describe("which addresses count as GitHub", () => {
  it("counts github.com", () => {
    assert.equal(isGithubReferenceHostname("github.com"), true);
  });

  it("counts the www spelling of github.com", () => {
    assert.equal(isGithubReferenceHostname("www.github.com"), true);
  });

  it("counts a gist", () => {
    assert.equal(isGithubReferenceHostname("gist.github.com"), true);
  });

  it("reads the host without case, the way a browser does", () => {
    assert.equal(isGithubReferenceHostname("GitHub.com"), true);
  });

  it("leaves the documentation site as an ordinary web page", () => {
    assert.equal(isGithubReferenceHostname("docs.github.com"), false);
  });

  it("leaves the raw content host as an ordinary web page", () => {
    assert.equal(isGithubReferenceHostname("raw.githubusercontent.com"), false);
  });

  it("refuses a host that only ends in github.com", () => {
    assert.equal(isGithubReferenceHostname("evil-github.com"), false);
    assert.equal(isGithubReferenceHostname("github.com.example.test"), false);
  });
});
