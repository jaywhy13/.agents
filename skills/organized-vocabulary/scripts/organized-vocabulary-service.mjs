import {
  normalizeVocabularyEntry,
  vocabularyTitleKey,
} from "../../vocabulary/scripts/vocabulary-store.mjs";

function vocabularyContentMatches(leftEntry, rightEntry) {
  return leftEntry.title === rightEntry.title
    && leftEntry.familiarity === rightEntry.familiarity
    && leftEntry.description === rightEntry.description;
}

export class OrganizedVocabularyService {
  constructor({ organizedVocabularyRepository }) {
    this.organizedVocabularyRepository = organizedVocabularyRepository;
  }

  async publish(entry, now = new Date()) {
    const normalizedEntry = normalizeVocabularyEntry(entry, now.toISOString());
    normalizedEntry.updated_at = now.toISOString();
    const titleKey = vocabularyTitleKey(normalizedEntry.title);
    const matchingRecords = (await this.organizedVocabularyRepository.list())
      .filter((record) => vocabularyTitleKey(record.title) === titleKey);

    if (matchingRecords.length > 1) {
      throw new Error(`Organized contains duplicate vocabulary title: ${normalizedEntry.title}`);
    }
    if (!matchingRecords.length) {
      const createdEntry = await this.organizedVocabularyRepository.create(normalizedEntry);
      return { action: "created", entry: createdEntry };
    }

    const existingRecord = matchingRecords[0];
    const normalizedExistingEntry = normalizeVocabularyEntry(existingRecord);
    if (vocabularyContentMatches(normalizedExistingEntry, normalizedEntry)) {
      return { action: "no_change", entry: existingRecord };
    }
    if (!existingRecord.record_id) {
      throw new Error(`Organized vocabulary record has no identifier: ${existingRecord.title}`);
    }

    const updatedEntry = await this.organizedVocabularyRepository.update(
      existingRecord.record_id,
      normalizedEntry,
    );
    return { action: "updated", entry: updatedEntry };
  }
}
