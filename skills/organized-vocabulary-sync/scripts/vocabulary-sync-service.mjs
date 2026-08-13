import {
  normalizeVocabularyEntry,
  vocabularyTitleKey,
} from "../../vocabulary/scripts/vocabulary-store.mjs";

function vocabularyEntriesByTitle(entries, sourceName) {
  const entriesByTitle = new Map();
  for (const rawEntry of entries) {
    const entry = normalizeVocabularyEntry(rawEntry);
    const titleKey = vocabularyTitleKey(entry.title);
    if (entriesByTitle.has(titleKey)) {
      throw new Error(`${sourceName} contains duplicate vocabulary title: ${entry.title}`);
    }
    entriesByTitle.set(titleKey, entry);
  }
  return entriesByTitle;
}

function vocabularyContentMatches(leftEntry, rightEntry) {
  return leftEntry.title === rightEntry.title
    && leftEntry.familiarity === rightEntry.familiarity
    && leftEntry.description === rightEntry.description;
}

export class VocabularySyncError extends Error {
  constructor({ phase, title, publishedTitles, cause }) {
    super(`Vocabulary sync failed during ${phase}${title ? ` for ${title}` : ""}: ${cause.message}`);
    this.name = "VocabularySyncError";
    this.phase = phase;
    this.title = title;
    this.publishedTitles = publishedTitles;
    this.cause = cause;
  }
}

export class VocabularySyncService {
  constructor({ localVocabularyRepository, organizedVocabularyRepository }) {
    this.localVocabularyRepository = localVocabularyRepository;
    this.organizedVocabularyRepository = organizedVocabularyRepository;
  }

  async sync() {
    return this.localVocabularyRepository.withLock(() => this.syncWhileLocalCacheLocked());
  }

  async syncWhileLocalCacheLocked() {
    const localEntriesByTitle = vocabularyEntriesByTitle(
      await this.localVocabularyRepository.listWhileLocked(),
      "Local vocabulary",
    );
    const organizedEntriesByTitle = vocabularyEntriesByTitle(
      await this.organizedVocabularyRepository.list(),
      "Organized vocabulary",
    );

    const publishedTitles = [];
    for (const [titleKey, localEntry] of localEntriesByTitle) {
      if (organizedEntriesByTitle.has(titleKey)) continue;
      let createdEntry;
      try {
        createdEntry = normalizeVocabularyEntry(
          await this.organizedVocabularyRepository.create(localEntry),
        );
      } catch (cause) {
        throw new VocabularySyncError({
          phase: "publish_to_organized",
          title: localEntry.title,
          publishedTitles,
          cause,
        });
      }
      organizedEntriesByTitle.set(titleKey, createdEntry);
      publishedTitles.push(localEntry.title);
    }

    let importedToLocal = 0;
    let refreshedFromOrganized = 0;
    const synchronizedEntriesByTitle = new Map(localEntriesByTitle);
    for (const [titleKey, organizedEntry] of organizedEntriesByTitle) {
      const localEntry = localEntriesByTitle.get(titleKey);
      if (!localEntry) importedToLocal += 1;
      else if (!vocabularyContentMatches(localEntry, organizedEntry)) refreshedFromOrganized += 1;
      synchronizedEntriesByTitle.set(titleKey, organizedEntry);
    }

    let synchronizedEntries;
    try {
      synchronizedEntries = await this.localVocabularyRepository.replaceWhileLocked(
        [...synchronizedEntriesByTitle.values()],
      );
    } catch (cause) {
      throw new VocabularySyncError({
        phase: "write_local_cache",
        title: null,
        publishedTitles,
        cause,
      });
    }
    return {
      imported_to_local: importedToLocal,
      published_to_organized: publishedTitles.length,
      published_titles: publishedTitles,
      refreshed_from_organized: refreshedFromOrganized,
      total_local: synchronizedEntries.length,
      total_organized: organizedEntriesByTitle.size,
    };
  }
}
