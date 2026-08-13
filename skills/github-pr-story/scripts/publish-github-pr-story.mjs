#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateStoryInput } from "../../organized-pr-story/scripts/publish-pr-story.mjs";

function collapsibleSection(title, markdown) {
  return [
    "<details>",
    `<summary><strong>${title}</strong></summary>`,
    "",
    markdown.trim(),
    "",
    "</details>",
  ].join("\n");
}

function splitCodeSamplesAndComprehension(codeSamples) {
  const comprehensionHeading = /^##\s+(?:🧠\s*)?(?:Check your understanding|Comprehension check)\s*$/im;
  const headingMatch = comprehensionHeading.exec(codeSamples);
  if (!headingMatch) {
    throw new Error("Story code_samples must contain a level-two comprehension-check heading.");
  }
  const sourceExamples = codeSamples.slice(0, headingMatch.index).trim();
  const comprehensionCheck = codeSamples.slice(headingMatch.index).trim();
  if (!sourceExamples) throw new Error("Story code_samples must contain source examples before the comprehension check.");
  const answersHeading = /^##\s+(?:✅\s*)?Answers\s*$/im;
  const answersMatch = answersHeading.exec(comprehensionCheck);
  if (!answersMatch) {
    throw new Error("Story comprehension check must contain a level-two Answers heading.");
  }
  const questions = comprehensionCheck.slice(0, answersMatch.index).match(/^\d+\.\s+\S.*$/gm) || [];
  const answers = comprehensionCheck.slice(answersMatch.index).match(/^\d+\.\s+\S.*$/gm) || [];
  if (questions.length !== 5 || answers.length !== 5) {
    throw new Error("Story comprehension check must contain exactly five questions and five visible answers.");
  }
  return { sourceExamples, comprehensionCheck };
}

export function renderGitHubPullRequestStory(storyInput) {
  const story = validateStoryInput(storyInput);
  const { sourceExamples, comprehensionCheck } = splitCodeSamplesAndComprehension(story.code_samples);
  return [
    `<!-- github-pr-story:${story.repository}#${story.number} -->`,
    `## 📖 ${story.title}`,
    "",
    story.summary,
    "",
    `[Open pull request](${story.link}) · Story by @${story.author}`,
    "",
    collapsibleSection("Background", story.background),
    "",
    collapsibleSection("Intuition", story.intuition),
    "",
    collapsibleSection("Code story", story.code_story),
    "",
    collapsibleSection("Code samples", sourceExamples),
    "",
    collapsibleSection("Comprehension check", comprehensionCheck),
  ].join("\n");
}

function runGitHub(argumentsList, input = undefined) {
  return execFileSync("gh", argumentsList, {
    encoding: "utf8",
    ...(input === undefined ? {} : { input: JSON.stringify(input) }),
  }).trim();
}

function currentGitHubLogin() {
  return runGitHub(["api", "user", "--jq", ".login"]);
}

function pullRequestComments(repository, pullRequestNumber) {
  const responseText = runGitHub([
    "api",
    "--paginate",
    "--slurp",
    `repos/${repository}/issues/${pullRequestNumber}/comments?per_page=100`,
  ]);
  const response = JSON.parse(responseText);
  return Array.isArray(response[0]) ? response.flat() : response;
}

function isManagedStoryComment(comment, { marker, githubLogin }) {
  return comment.user?.login === githubLogin
    && comment.body?.startsWith(`${marker}\n## 📖 `);
}

function publishComment(story, body) {
  const marker = `<!-- github-pr-story:${story.repository}#${story.number} -->`;
  const githubLogin = currentGitHubLogin();
  const matchingComments = pullRequestComments(story.repository, story.number).filter(
    (comment) => isManagedStoryComment(comment, { marker, githubLogin }),
  );
  if (matchingComments.length > 1) {
    throw new Error(`Found ${matchingComments.length} existing GitHub pull request story comments; refusing to choose one.`);
  }

  const requestBody = { body };
  if (matchingComments.length === 1) {
    const response = JSON.parse(runGitHub([
      "api",
      "--method",
      "PATCH",
      `repos/${story.repository}/issues/comments/${matchingComments[0].id}`,
      "--input",
      "-",
    ], requestBody));
    return { action: "updated", comment_url: response.html_url };
  }

  const response = JSON.parse(runGitHub([
    "api",
    "--method",
    "POST",
    `repos/${story.repository}/issues/${story.number}/comments`,
    "--input",
    "-",
  ], requestBody));
  return { action: "created", comment_url: response.html_url };
}

function parseArguments(argumentsList) {
  const dryRun = argumentsList.includes("--dry-run");
  const positionals = argumentsList.filter((argument) => argument !== "--dry-run");
  if (positionals.length !== 1) {
    throw new Error("Usage: publish-github-pr-story.mjs [--dry-run] <pull-request-story.json>");
  }
  return { dryRun, inputPath: positionals[0] };
}

export function publishGitHubPullRequestStory(argumentsList) {
  const { dryRun, inputPath } = parseArguments(argumentsList);
  const storyInput = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
  const body = renderGitHubPullRequestStory(storyInput);
  if (dryRun) return { ok: true, dry_run: true, body };
  const story = validateStoryInput(storyInput);
  return { ok: true, dry_run: false, body, ...publishComment(story, body) };
}

async function main() {
  try {
    console.log(JSON.stringify(publishGitHubPullRequestStory(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
