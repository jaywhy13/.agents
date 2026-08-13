#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defaultVocabularyCachePath, LocalVocabularyRepository } from "./vocabulary-store.mjs";

export async function addVocabulary(inputPath, { cachePath = defaultVocabularyCachePath(), now = new Date() } = {}) {
  if (!inputPath) throw new Error("Pass a path to a vocabulary entry JSON file.");
  const entry = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  const vocabularyRepository = new LocalVocabularyRepository(cachePath);
  const savedVocabulary = await vocabularyRepository.upsert(entry, now);
  return {
    ok: true,
    action: savedVocabulary.action,
    cache_path: vocabularyRepository.cachePath,
    entry: savedVocabulary.entry,
  };
}

async function main() {
  try {
    console.log(JSON.stringify(await addVocabulary(process.argv[2]), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
