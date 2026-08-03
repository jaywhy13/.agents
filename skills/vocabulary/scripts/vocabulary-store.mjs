import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** @typedef {"beginner" | "intermediate" | "expert"} VocabularyFamiliarity */
/**
 * @typedef {object} VocabularyEntry
 * @property {string} title
 * @property {VocabularyFamiliarity} familiarity
 * @property {string} description
 * @property {string} updated_at
 */

const FAMILIARITY_LEVELS = new Set(["beginner", "intermediate", "expert"]);
const LOCK_RETRY_MILLISECONDS = 50;
const LOCK_TIMEOUT_MILLISECONDS = 30_000;
const STALE_LOCK_MILLISECONDS = 5 * 60_000;

export function defaultVocabularyCachePath(environment = process.env) {
  return resolve(
    environment.VOCABULARY_CACHE_PATH
      || join(homedir(), ".cache", "pi", "explain-like-socrates", "organized-vocabulary.json"),
  );
}

export function vocabularyTitleKey(title) {
  return String(title).trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

/** @returns {VocabularyEntry} */
export function normalizeVocabularyEntry(entry, updatedAt = new Date().toISOString()) {
  if (!entry || Array.isArray(entry) || typeof entry !== "object") {
    throw new Error("A vocabulary entry must be one object.");
  }

  const title = typeof entry.title === "string" ? entry.title.trim().replace(/\s+/g, " ") : "";
  const familiarity = typeof entry.familiarity === "string" ? entry.familiarity.trim().toLowerCase() : "";
  const description = typeof entry.description === "string" ? entry.description.trim() : "";

  if (!title) throw new Error("Vocabulary title must not be empty.");
  if (!FAMILIARITY_LEVELS.has(familiarity)) {
    throw new Error("Vocabulary familiarity must be beginner, intermediate, or expert.");
  }
  if (!description) throw new Error("Vocabulary description must not be empty.");

  const normalizedUpdatedAt = new Date(entry.updated_at || updatedAt);
  if (Number.isNaN(normalizedUpdatedAt.valueOf())) {
    throw new Error("Vocabulary updated_at must be a valid date-time.");
  }

  return {
    title,
    familiarity,
    description,
    updated_at: normalizedUpdatedAt.toISOString(),
  };
}

function sortVocabularyEntries(entries) {
  return [...entries].sort((leftEntry, rightEntry) => leftEntry.title.localeCompare(rightEntry.title));
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function processIsRunning(processId) {
  if (!Number.isInteger(processId) || processId < 1) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function lockIsAbandoned(lockPath) {
  try {
    const lockOwner = JSON.parse(await readFile(lockPath, "utf8"));
    if (Number.isInteger(lockOwner.process_id)) {
      return !processIsRunning(lockOwner.process_id);
    }
  } catch {
    const lockStatus = await stat(lockPath).catch(() => null);
    return Boolean(lockStatus && Date.now() - lockStatus.mtimeMs > STALE_LOCK_MILLISECONDS);
  }
  return false;
}

export class LocalVocabularyRepository {
  constructor(cachePath = defaultVocabularyCachePath()) {
    this.cachePath = resolve(cachePath);
    this.lockPath = `${this.cachePath}.lock`;
  }

  async acquireLock() {
    await mkdir(dirname(this.cachePath), { recursive: true });
    const startedAt = Date.now();
    while (Date.now() - startedAt < LOCK_TIMEOUT_MILLISECONDS) {
      try {
        const lockHandle = await open(this.lockPath, "wx");
        const lockToken = randomUUID();
        try {
          await lockHandle.writeFile(JSON.stringify({
            process_id: process.pid,
            token: lockToken,
            created_at: new Date().toISOString(),
          }));
          return { lockHandle, lockToken };
        } catch (error) {
          await lockHandle.close().catch(() => {});
          await unlink(this.lockPath).catch(() => {});
          throw error;
        }
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (await lockIsAbandoned(this.lockPath)) {
          await unlink(this.lockPath).catch(() => {});
          continue;
        }
        await delay(LOCK_RETRY_MILLISECONDS);
      }
    }
    throw new Error(`Timed out waiting for the vocabulary cache lock: ${this.lockPath}`);
  }

  async releaseLock({ lockHandle, lockToken }) {
    try {
      const currentLock = JSON.parse(await readFile(this.lockPath, "utf8"));
      if (currentLock.token === lockToken) await unlink(this.lockPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    } finally {
      await lockHandle.close().catch(() => {});
    }
  }

  async withLock(operation) {
    const acquiredLock = await this.acquireLock();
    try {
      return await operation();
    } finally {
      await this.releaseLock(acquiredLock);
    }
  }

  async list() {
    return this.listWhileLocked();
  }

  async listWhileLocked() {
    let cacheText;
    try {
      cacheText = await readFile(this.cachePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }

    const parsedEntries = JSON.parse(cacheText);
    if (!Array.isArray(parsedEntries)) throw new Error("Vocabulary cache must contain a JSON array.");

    const normalizedEntries = parsedEntries.map((entry) => normalizeVocabularyEntry(entry));
    const seenTitles = new Set();
    for (const entry of normalizedEntries) {
      const titleKey = vocabularyTitleKey(entry.title);
      if (seenTitles.has(titleKey)) throw new Error(`Vocabulary cache contains duplicate title: ${entry.title}`);
      seenTitles.add(titleKey);
    }
    return sortVocabularyEntries(normalizedEntries);
  }

  async replace(entries) {
    return this.withLock(() => this.replaceWhileLocked(entries));
  }

  async replaceWhileLocked(entries) {
    const normalizedEntries = sortVocabularyEntries(entries.map((entry) => normalizeVocabularyEntry(entry)));
    const seenTitles = new Set();
    for (const entry of normalizedEntries) {
      const titleKey = vocabularyTitleKey(entry.title);
      if (seenTitles.has(titleKey)) throw new Error(`Vocabulary entries contain duplicate title: ${entry.title}`);
      seenTitles.add(titleKey);
    }

    await mkdir(dirname(this.cachePath), { recursive: true });
    const temporaryPath = `${this.cachePath}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(normalizedEntries, null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.cachePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
    return normalizedEntries;
  }

  async upsert(entry, now = new Date()) {
    return this.withLock(async () => {
      const existingEntries = await this.listWhileLocked();
      const titleKey = vocabularyTitleKey(entry.title);
      const existingEntry = existingEntries.find((candidate) => vocabularyTitleKey(candidate.title) === titleKey);
      const normalizedEntry = normalizeVocabularyEntry(entry, now.toISOString());

      if (
        existingEntry
        && existingEntry.title === normalizedEntry.title
        && existingEntry.familiarity === normalizedEntry.familiarity
        && existingEntry.description === normalizedEntry.description
      ) {
        return { action: "no_change", entry: existingEntry, entries: existingEntries };
      }

      normalizedEntry.updated_at = now.toISOString();
      const nextEntries = existingEntry
        ? existingEntries.map((candidate) => vocabularyTitleKey(candidate.title) === titleKey ? normalizedEntry : candidate)
        : [...existingEntries, normalizedEntry];
      const savedEntries = await this.replaceWhileLocked(nextEntries);
      return {
        action: existingEntry ? "updated" : "created",
        entry: normalizedEntry,
        entries: savedEntries,
      };
    });
  }
}
