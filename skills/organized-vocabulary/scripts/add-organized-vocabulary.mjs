#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { OrganizedVocabularyService } from "./organized-vocabulary-service.mjs";
import { createQuickVocabularyRepository } from "./quick-vocabulary-repository.mjs";

export async function addOrganizedVocabulary(inputPath) {
  if (!inputPath) throw new Error("Pass a path to a vocabulary entry JSON file.");
  const entry = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  const organizedVocabularyRepository = await createQuickVocabularyRepository();
  const organizedVocabularyService = new OrganizedVocabularyService({ organizedVocabularyRepository });
  const publishSummary = await organizedVocabularyService.publish(entry);
  return {
    ok: true,
    action: publishSummary.action,
    site: "organized",
    collection: "vocabulary",
    entry: publishSummary.entry,
    url: "https://organized.quick.shopify.io/vocabulary/",
  };
}

async function main() {
  try {
    console.log(JSON.stringify(await addOrganizedVocabulary(process.argv[2]), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
