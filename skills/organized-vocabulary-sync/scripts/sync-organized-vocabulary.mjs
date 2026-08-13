#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  defaultVocabularyCachePath,
  LocalVocabularyRepository,
} from "../../vocabulary/scripts/vocabulary-store.mjs";
import { createQuickVocabularyRepository } from "../../organized-vocabulary/scripts/quick-vocabulary-repository.mjs";
import { VocabularySyncService } from "./vocabulary-sync-service.mjs";

export async function syncOrganizedVocabulary({ cachePath = defaultVocabularyCachePath() } = {}) {
  const localVocabularyRepository = new LocalVocabularyRepository(cachePath);
  const organizedVocabularyRepository = await createQuickVocabularyRepository();
  const vocabularySyncService = new VocabularySyncService({
    localVocabularyRepository,
    organizedVocabularyRepository,
  });
  const syncSummary = await vocabularySyncService.sync();
  return {
    ok: true,
    cache_path: localVocabularyRepository.cachePath,
    site: "organized",
    collection: "vocabulary",
    ...syncSummary,
  };
}

async function main() {
  try {
    console.log(JSON.stringify(await syncOrganizedVocabulary(), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
      ...(error.phase ? { phase: error.phase } : {}),
      ...(error.title ? { title: error.title } : {}),
      ...(error.publishedTitles ? { published_titles: error.publishedTitles } : {}),
    }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
