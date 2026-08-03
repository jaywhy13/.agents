import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LocalVocabularyRepository } from "../scripts/vocabulary-store.mjs";
import {
  VocabularySyncError,
  VocabularySyncService,
} from "../../organized-vocabulary-sync/scripts/vocabulary-sync-service.mjs";
import { OrganizedVocabularyService } from "../../organized-vocabulary/scripts/organized-vocabulary-service.mjs";

class FakeOrganizedVocabularyRepository {
  constructor(entries = []) {
    this.entries = entries;
  }

  async list() {
    return structuredClone(this.entries);
  }

  async create(entry) {
    const createdEntry = { ...structuredClone(entry), record_id: `record-${this.entries.length + 1}` };
    this.entries.push(createdEntry);
    return createdEntry;
  }

  async update(recordId, entry) {
    const entryIndex = this.entries.findIndex((candidate) => candidate.record_id === recordId);
    if (entryIndex === -1) throw new Error(`Missing fake Organized record: ${recordId}`);
    const updatedEntry = { ...structuredClone(entry), record_id: recordId };
    this.entries[entryIndex] = updatedEntry;
    return updatedEntry;
  }
}

class BlockingOrganizedVocabularyRepository extends FakeOrganizedVocabularyRepository {
  constructor(entries = []) {
    super(entries);
    this.listStarted = new Promise((resolveListStarted) => { this.resolveListStarted = resolveListStarted; });
    this.listRelease = new Promise((resolveListRelease) => { this.resolveListRelease = resolveListRelease; });
  }

  async list() {
    this.resolveListStarted();
    await this.listRelease;
    return super.list();
  }

  releaseList() {
    this.resolveListRelease();
  }
}

const testDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const addVocabularyScript = resolve(testDirectory, "../scripts/add-vocabulary.mjs");

function runAddVocabulary(inputPath, cachePath) {
  return spawnSync(process.execPath, [addVocabularyScript, inputPath], {
    encoding: "utf8",
    env: { ...process.env, VOCABULARY_CACHE_PATH: cachePath },
  });
}

function runAddVocabularyConcurrently(inputPath, cachePath) {
  return new Promise((resolveProcess, rejectProcess) => {
    const childProcess = spawn(process.execPath, [addVocabularyScript, inputPath], {
      env: { ...process.env, VOCABULARY_CACHE_PATH: cachePath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let standardError = "";
    childProcess.stderr.setEncoding("utf8");
    childProcess.stderr.on("data", (chunk) => { standardError += chunk; });
    childProcess.on("error", rejectProcess);
    childProcess.on("close", (exitCode) => resolveProcess({ exitCode, standardError }));
  });
}

test("a vocabulary entry can be added to an empty local cache", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vocabulary-test-"));
  const cachePath = join(directory, "organized-vocabulary.json");
  const inputPath = join(directory, "entry.json");
  await writeFile(inputPath, JSON.stringify({
    title: "Finite State Machine",
    familiarity: "beginner",
    description: "A model with a finite set of states and rules for moving between them.",
  }));

  const result = runAddVocabulary(inputPath, cachePath);

  assert.equal(result.status, 0, result.stderr);
  const entries = JSON.parse(await readFile(cachePath, "utf8"));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "Finite State Machine");
  assert.equal(entries[0].familiarity, "beginner");
  assert.equal(entries[0].description, "A model with a finite set of states and rules for moving between them.");
  assert.match(entries[0].updated_at, /^\d{4}-\d{2}-\d{2}T/);
});

test("adding an existing title updates one local entry without creating a duplicate", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vocabulary-test-"));
  const cachePath = join(directory, "organized-vocabulary.json");
  const inputPath = join(directory, "entry.json");
  await writeFile(cachePath, JSON.stringify([{
    title: "Kubectl",
    familiarity: "beginner",
    description: "An earlier description.",
    updated_at: "2026-01-01T00:00:00.000Z",
  }]));
  await writeFile(inputPath, JSON.stringify({
    title: "  kubectl  ",
    familiarity: "intermediate",
    description: "The command-line tool used to manage Kubernetes resources.",
  }));

  const result = runAddVocabulary(inputPath, cachePath);

  assert.equal(result.status, 0, result.stderr);
  const entries = JSON.parse(await readFile(cachePath, "utf8"));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "kubectl");
  assert.equal(entries[0].familiarity, "intermediate");
  assert.equal(entries[0].description, "The command-line tool used to manage Kubernetes resources.");
});

test("concurrent local additions preserve both vocabulary entries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vocabulary-test-"));
  const cachePath = join(directory, "organized-vocabulary.json");
  const firstInputPath = join(directory, "first-entry.json");
  const secondInputPath = join(directory, "second-entry.json");
  await writeFile(firstInputPath, JSON.stringify({
    title: "Kubectl",
    familiarity: "beginner",
    description: "A command-line tool.",
  }));
  await writeFile(secondInputPath, JSON.stringify({
    title: "Buildkite Artifact",
    familiarity: "intermediate",
    description: "A file retained from a build.",
  }));

  const [firstProcess, secondProcess] = await Promise.all([
    runAddVocabularyConcurrently(firstInputPath, cachePath),
    runAddVocabularyConcurrently(secondInputPath, cachePath),
  ]);

  assert.equal(firstProcess.exitCode, 0, firstProcess.standardError);
  assert.equal(secondProcess.exitCode, 0, secondProcess.standardError);
  const entries = JSON.parse(await readFile(cachePath, "utf8"));
  assert.deepEqual(entries.map((entry) => entry.title), ["Buildkite Artifact", "Kubectl"]);
});

test("sync imports Organized entries, publishes local-only entries, and lets Organized win conflicts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vocabulary-test-"));
  const cachePath = join(directory, "organized-vocabulary.json");
  await writeFile(cachePath, JSON.stringify([
    {
      title: "Finite State Machine",
      familiarity: "intermediate",
      description: "A local-only entry.",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      title: "Kubectl",
      familiarity: "intermediate",
      description: "The local description.",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ]));
  const organizedVocabularyRepository = new FakeOrganizedVocabularyRepository([
    {
      title: "Buildkite Artifact",
      familiarity: "beginner",
      description: "A remote-only entry.",
      updated_at: "2026-02-01T00:00:00.000Z",
    },
    {
      title: "Kubectl",
      familiarity: "expert",
      description: "The Organized description.",
      updated_at: "2026-02-01T00:00:00.000Z",
    },
  ]);
  const localVocabularyRepository = new LocalVocabularyRepository(cachePath);
  const vocabularySyncService = new VocabularySyncService({
    localVocabularyRepository,
    organizedVocabularyRepository,
  });

  const syncSummary = await vocabularySyncService.sync();

  assert.deepEqual(syncSummary, {
    imported_to_local: 1,
    published_to_organized: 1,
    published_titles: ["Finite State Machine"],
    refreshed_from_organized: 1,
    total_local: 3,
    total_organized: 3,
  });
  const localEntries = await localVocabularyRepository.list();
  assert.deepEqual(localEntries.map((entry) => entry.title), [
    "Buildkite Artifact",
    "Finite State Machine",
    "Kubectl",
  ]);
  const kubectlEntry = localEntries.find((entry) => entry.title === "Kubectl");
  assert.equal(kubectlEntry.familiarity, "expert");
  assert.equal(kubectlEntry.description, "The Organized description.");
  assert.equal(
    organizedVocabularyRepository.entries.some((entry) => entry.title === "Finite State Machine"),
    true,
  );
});

test("a partial Organized publish failure reports completed titles for a safe retry", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vocabulary-test-"));
  const cachePath = join(directory, "organized-vocabulary.json");
  const localVocabularyRepository = new LocalVocabularyRepository(cachePath);
  await localVocabularyRepository.replace([
    {
      title: "Buildkite Artifact",
      familiarity: "intermediate",
      description: "A file retained from a build.",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      title: "Kubectl",
      familiarity: "beginner",
      description: "A command-line tool.",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ]);
  const organizedVocabularyRepository = new FakeOrganizedVocabularyRepository();
  let createCount = 0;
  organizedVocabularyRepository.create = async (entry) => {
    createCount += 1;
    if (createCount === 2) throw new Error("Quick write failed");
    organizedVocabularyRepository.entries.push(structuredClone(entry));
    return entry;
  };
  const vocabularySyncService = new VocabularySyncService({
    localVocabularyRepository,
    organizedVocabularyRepository,
  });

  await assert.rejects(
    () => vocabularySyncService.sync(),
    (error) => {
      assert.equal(error instanceof VocabularySyncError, true);
      assert.equal(error.phase, "publish_to_organized");
      assert.equal(error.title, "Kubectl");
      assert.deepEqual(error.publishedTitles, ["Buildkite Artifact"]);
      return true;
    },
  );
});

test("a local addition made during sync is preserved after synchronization", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vocabulary-test-"));
  const cachePath = join(directory, "organized-vocabulary.json");
  const localVocabularyRepository = new LocalVocabularyRepository(cachePath);
  await localVocabularyRepository.upsert({
    title: "Kubectl",
    familiarity: "beginner",
    description: "A command-line tool.",
  });
  const organizedVocabularyRepository = new BlockingOrganizedVocabularyRepository();
  const vocabularySyncService = new VocabularySyncService({
    localVocabularyRepository,
    organizedVocabularyRepository,
  });

  const syncPromise = vocabularySyncService.sync();
  await organizedVocabularyRepository.listStarted;
  const localAdditionPromise = localVocabularyRepository.upsert({
    title: "Buildkite Artifact",
    familiarity: "intermediate",
    description: "A file retained from a build.",
  });
  organizedVocabularyRepository.releaseList();
  await Promise.all([syncPromise, localAdditionPromise]);

  const entries = await localVocabularyRepository.list();
  assert.deepEqual(entries.map((entry) => entry.title), ["Buildkite Artifact", "Kubectl"]);
});

test("publishing a vocabulary title updates its existing Organized record", async () => {
  const organizedVocabularyRepository = new FakeOrganizedVocabularyRepository([{
    record_id: "existing-record",
    title: "Kubectl",
    familiarity: "beginner",
    description: "An earlier description.",
    updated_at: "2026-01-01T00:00:00.000Z",
  }]);
  const organizedVocabularyService = new OrganizedVocabularyService({ organizedVocabularyRepository });

  const publishSummary = await organizedVocabularyService.publish({
    title: "kubectl",
    familiarity: "intermediate",
    description: "The command-line tool used to manage Kubernetes resources.",
  }, new Date("2026-03-01T00:00:00.000Z"));

  assert.equal(publishSummary.action, "updated");
  assert.equal(organizedVocabularyRepository.entries.length, 1);
  assert.deepEqual(organizedVocabularyRepository.entries[0], {
    record_id: "existing-record",
    title: "kubectl",
    familiarity: "intermediate",
    description: "The command-line tool used to manage Kubernetes resources.",
    updated_at: "2026-03-01T00:00:00.000Z",
  });
});
