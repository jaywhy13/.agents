import { pathToFileURL } from "node:url";
import {
  normalizeVocabularyEntry,
  vocabularyTitleKey,
} from "../../vocabulary/scripts/vocabulary-store.mjs";
import { resolveQuickSoftwareDevelopmentKitPath } from "../../quick-runtime/resolve-quick-software-development-kit.mjs";

const VOCABULARY_PAGE_SIZE = 200;

function responseRecords(response) {
  const records = Array.isArray(response) ? response : response?.data;
  if (!Array.isArray(records)) throw new Error("Quick returned an unreadable vocabulary response.");
  return records;
}

function createdRecordId(response) {
  return Array.isArray(response) ? response[0]?.id : response?.id;
}

function organizedRecordToVocabularyEntry(record) {
  const updatedAt = record.updated_at
    || record.created_at
    || (record.ts ? new Date(record.ts).toISOString() : "1970-01-01T00:00:00.000Z");
  return {
    ...normalizeVocabularyEntry({
      title: record.title,
      familiarity: record.familiarity,
      description: record.body,
      updated_at: updatedAt,
    }),
    record_id: record.id,
  };
}

function quickRecordFields(entry, author, { isCreate = false } = {}) {
  const normalizedEntry = normalizeVocabularyEntry(entry);
  const updatedAt = normalizedEntry.updated_at;
  return {
    ...(isCreate ? {
      author,
      images: [],
      ts: new Date(updatedAt).valueOf(),
      created_at: updatedAt,
    } : {}),
    title: normalizedEntry.title,
    title_key: vocabularyTitleKey(normalizedEntry.title),
    body: normalizedEntry.description,
    familiarity: normalizedEntry.familiarity,
    updated_at: updatedAt,
    search_text: [
      normalizedEntry.title,
      normalizedEntry.description,
      normalizedEntry.familiarity,
    ].join(" ").toLowerCase(),
  };
}

function creationOrder(leftRecord, rightRecord) {
  const timestampDifference = Number(leftRecord.ts || 0) - Number(rightRecord.ts || 0);
  if (timestampDifference !== 0) return timestampDifference;
  return String(leftRecord.id).localeCompare(String(rightRecord.id));
}

export class QuickVocabularyRepository {
  constructor({ collection, author }) {
    this.collection = collection;
    this.author = author;
  }

  async list() {
    const records = [];
    for (let offset = 0; ; offset += VOCABULARY_PAGE_SIZE) {
      const page = responseRecords(await this.collection
        .orderBy("ts", "desc")
        .limit(VOCABULARY_PAGE_SIZE)
        .offset(offset)
        .find());
      records.push(...page);
      if (page.length < VOCABULARY_PAGE_SIZE) break;
    }
    return records.map(organizedRecordToVocabularyEntry);
  }

  async recordsWithTitleKey(titleKey) {
    return responseRecords(await this.collection
      .where({ title_key: titleKey })
      .orderBy("ts", "asc")
      .limit(100)
      .find());
  }

  async resolveConcurrentCreates(entry) {
    const titleKey = vocabularyTitleKey(entry.title);
    const matchingRecords = await this.recordsWithTitleKey(titleKey);
    if (!matchingRecords.length) return null;

    const [winningRecord, ...duplicateRecords] = [...matchingRecords].sort(creationOrder);
    for (const duplicateRecord of duplicateRecords) {
      await this.collection.delete(duplicateRecord.id).catch(() => {});
    }

    const remainingRecords = await this.recordsWithTitleKey(titleKey);
    if (remainingRecords.length !== 1) {
      throw new Error(`Could not resolve concurrent Organized vocabulary creates for: ${entry.title}`);
    }
    const remainingRecord = remainingRecords[0];
    await this.collection.update(
      remainingRecord.id,
      quickRecordFields(entry, this.author),
    );
    return organizedRecordToVocabularyEntry({
      ...remainingRecord,
      ...quickRecordFields(entry, this.author),
    });
  }

  async create(entry) {
    let createdId = null;
    try {
      const response = await this.collection.create(
        quickRecordFields(entry, this.author, { isCreate: true }),
      );
      createdId = createdRecordId(response) || null;
    } catch (createError) {
      const recoveredEntry = await this.resolveConcurrentCreates(entry);
      if (recoveredEntry) return recoveredEntry;
      throw createError;
    }

    const resolvedEntry = await this.resolveConcurrentCreates(entry);
    if (resolvedEntry) return resolvedEntry;
    throw new Error(
      createdId
        ? `Quick created vocabulary record ${createdId}, but it could not be read back.`
        : "Quick returned no vocabulary identifier and the created record could not be read back.",
    );
  }

  async update(recordId, entry) {
    await this.collection.update(recordId, quickRecordFields(entry, this.author));
    return { ...normalizeVocabularyEntry(entry), record_id: recordId };
  }
}

export async function createQuickVocabularyRepository(environment = process.env) {
  const softwareDevelopmentKitPath = resolveQuickSoftwareDevelopmentKitPath(environment);
  const { createClient } = await import(pathToFileURL(softwareDevelopmentKitPath).href);
  const quickClient = createClient("organized");
  const user = await quickClient.id.waitForUser();
  const author = user?.email?.trim().toLowerCase();
  if (!author) throw new Error("Quick authentication did not return an email address.");
  return new QuickVocabularyRepository({
    collection: quickClient.db.collection("vocabulary"),
    author,
  });
}
