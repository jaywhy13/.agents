import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const publisherScript = resolve(testDirectory, "../scripts/publish-github-pr-story.mjs");

const story = {
  title: "Make retries visible",
  summary: "Operators can distinguish retries from first attempts.",
  link: "https://github.com/shop/example/pull/42",
  repository: "shop/example",
  number: 42,
  author: "octocat",
  background: "## Why retries were confusing\n\nBackground text.",
  intuition: "## One journey\n\nIntuition text.",
  code_story: "## Carry context\n\nCode story text.",
  code_samples: "## Exact change\n\n```diff\n-old\n+new\n```\n\n## 🧠 Check your understanding\n\n1. Why retain the identifier?\n2. What changes on a retry?\n3. Which boundary carries context?\n4. What remains unchanged?\n5. Which evidence proves the behavior?\n\n## ✅ Answers\n\n1. It groups attempts.\n2. The attempt identity.\n3. The retry call.\n4. The operation identity.\n5. The exact diff and test.",
};

async function runWithFakeGitHub(comments) {
  const directory = await mkdtemp(join(tmpdir(), "github-pr-story-test-"));
  const inputPath = join(directory, "story.json");
  const callLogPath = join(directory, "github-calls.log");
  const fakeGitHubPath = join(directory, "gh");
  await writeFile(inputPath, JSON.stringify(story));
  await writeFile(fakeGitHubPath, `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
const argumentsList = process.argv.slice(2);
appendFileSync(process.env.GITHUB_CALL_LOG, argumentsList.join(" ") + "\\n");
if (argumentsList.join(" ") === "api user --jq .login") {
  console.log("agent-user");
} else if (argumentsList.includes("--paginate")) {
  console.log(JSON.stringify([JSON.parse(process.env.GITHUB_COMMENTS)]));
} else if (argumentsList.includes("PATCH")) {
  readFileSync(0, "utf8");
  console.log(JSON.stringify({ html_url: "https://github.com/shop/example/pull/42#issuecomment-99" }));
} else if (argumentsList.includes("POST")) {
  readFileSync(0, "utf8");
  console.log(JSON.stringify({ html_url: "https://github.com/shop/example/pull/42#issuecomment-100" }));
} else {
  console.error("unexpected gh arguments: " + argumentsList.join(" "));
  process.exitCode = 1;
}
`, { mode: 0o755 });

  const commandResult = spawnSync(process.execPath, [publisherScript, inputPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_CALL_LOG: callLogPath,
      GITHUB_COMMENTS: JSON.stringify(comments),
      PATH: `${directory}:${process.env.PATH}`,
    },
  });
  const commandLog = await readFile(callLogPath, "utf8");
  return { commandResult, commandLog };
}

test("dry run renders independently collapsible teaching and comprehension sections", async () => {
  const directory = await mkdtemp(join(tmpdir(), "github-pr-story-test-"));
  const inputPath = join(directory, "story.json");
  await writeFile(inputPath, JSON.stringify(story));

  const commandResult = spawnSync(process.execPath, [publisherScript, "--dry-run", inputPath], {
    encoding: "utf8",
  });

  assert.equal(commandResult.status, 0, commandResult.stderr);
  const publication = JSON.parse(commandResult.stdout);
  assert.equal(publication.ok, true);
  assert.equal(publication.dry_run, true);
  for (const sectionTitle of ["Background", "Intuition", "Code story", "Code samples", "Comprehension check"]) {
    assert.match(publication.body, new RegExp(`<summary><strong>${sectionTitle}</strong></summary>`));
  }
  assert.match(publication.body, /<!-- github-pr-story:shop\/example#42 -->/);
  assert.match(publication.body, /```diff\n-old\n\+new\n```/);
});

test("publishing again updates the authenticated user's existing managed comment", async () => {
  const { commandResult, commandLog } = await runWithFakeGitHub([{
    id: 99,
    body: "<!-- github-pr-story:shop/example#42 -->\n## 📖 Old story",
    user: { login: "agent-user" },
  }]);

  assert.equal(commandResult.status, 0, commandResult.stderr);
  const publication = JSON.parse(commandResult.stdout);
  assert.equal(publication.action, "updated");
  assert.equal(publication.comment_url, "https://github.com/shop/example/pull/42#issuecomment-99");
  assert.match(commandLog, /--method PATCH repos\/shop\/example\/issues\/comments\/99/);
  assert.doesNotMatch(commandLog, /--method POST/);
});

test("a marker quoted inside an unrelated comment is preserved and a new story comment is created", async () => {
  const { commandResult, commandLog } = await runWithFakeGitHub([{
    id: 98,
    body: "I saw <!-- github-pr-story:shop/example#42 --> in generated output.",
    user: { login: "agent-user" },
  }]);

  assert.equal(commandResult.status, 0, commandResult.stderr);
  const publication = JSON.parse(commandResult.stdout);
  assert.equal(publication.action, "created");
  assert.match(commandLog, /--method POST repos\/shop\/example\/issues\/42\/comments/);
  assert.doesNotMatch(commandLog, /--method PATCH/);
});

test("multiple managed comments stop publication instead of choosing one", async () => {
  const managedBody = "<!-- github-pr-story:shop/example#42 -->\n## 📖 Existing story";
  const { commandResult, commandLog } = await runWithFakeGitHub([
    { id: 97, body: managedBody, user: { login: "agent-user" } },
    { id: 99, body: managedBody, user: { login: "agent-user" } },
  ]);

  assert.equal(commandResult.status, 1);
  assert.match(commandResult.stderr, /Found 2 existing GitHub pull request story comments/);
  assert.doesNotMatch(commandLog, /--method (?:POST|PATCH)/);
});

test("a story without a separate comprehension check is rejected", async () => {
  const directory = await mkdtemp(join(tmpdir(), "github-pr-story-test-"));
  const inputPath = join(directory, "story.json");
  await writeFile(inputPath, JSON.stringify({
    ...story,
    code_samples: "## Exact change\n\n```diff\n-old\n+new\n```",
  }));

  const commandResult = spawnSync(process.execPath, [publisherScript, "--dry-run", inputPath], {
    encoding: "utf8",
  });

  assert.equal(commandResult.status, 1);
  assert.match(commandResult.stderr, /comprehension-check heading/);
});
