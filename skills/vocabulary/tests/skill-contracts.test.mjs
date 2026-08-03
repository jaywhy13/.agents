import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skillsRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function readSkill(relativePath) {
  return readFile(resolve(skillsRoot, relativePath, "SKILL.md"), "utf8");
}

test("implement routes pull request stories by the locally installed Quick command", async () => {
  const implementSkill = await readSkill("implement");

  assert.match(implementSkill, /command -v quick/);
  assert.match(implementSkill, /When Quick is installed[\s\S]*organized-pr-story/);
  assert.match(implementSkill, /When Quick is not installed[\s\S]*github-pr-story/);
});

test("organized vocabulary requires the local vocabulary workflow before publication", async () => {
  const organizedVocabularySkill = await readSkill("organized-vocabulary");
  const localWorkflowPosition = organizedVocabularySkill.indexOf("[vocabulary](../vocabulary/SKILL.md)");
  const QuickCheckPosition = organizedVocabularySkill.indexOf("command -v quick");
  const publicationPosition = organizedVocabularySkill.indexOf("add-organized-vocabulary.mjs");

  assert.notEqual(localWorkflowPosition, -1);
  assert.equal(localWorkflowPosition < QuickCheckPosition, true);
  assert.equal(QuickCheckPosition < publicationPosition, true);
});

test("Socratic explanations use the local vocabulary without a Quick query path", async () => {
  const explanationSkill = await readSkill("explain-like-socrates");

  assert.match(explanationSkill, /Read explanation familiarity only from:/);
  assert.match(explanationSkill, /Never query Organized/);
  assert.doesNotMatch(explanationSkill, /quick_query_collection/);
});
