import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { QuickVocabularyRepository } from "../../organized-vocabulary/scripts/quick-vocabulary-repository.mjs";
import { resolveQuickSoftwareDevelopmentKitPath } from "../../quick-runtime/resolve-quick-software-development-kit.mjs";

class FakeQuickVocabularyCollection {
  constructor(records = [], sharedState = undefined, query = undefined) {
    this.records = records;
    this.sharedState = sharedState || {
      calls: [],
      nextIdentifier: records.length + 1,
      createBarrierTarget: 0,
      createBarrierCount: 0,
      releaseCreateBarrier: null,
      createBarrier: null,
    };
    this.query = query || { where: {}, limit: null, offset: 0, orderField: null, orderDirection: "asc" };
  }

  clone(queryChanges) {
    return new FakeQuickVocabularyCollection(this.records, this.sharedState, {
      ...this.query,
      ...queryChanges,
    });
  }

  where(conditions) {
    return this.clone({ where: { ...this.query.where, ...conditions } });
  }

  limit(limit) {
    return this.clone({ limit });
  }

  offset(offset) {
    return this.clone({ offset });
  }

  orderBy(orderField, orderDirection = "asc") {
    return this.clone({ orderField, orderDirection });
  }

  async find() {
    this.sharedState.calls.push({ ...this.query });
    let matchingRecords = this.records.filter((record) => Object.entries(this.query.where)
      .every(([field, expectedValue]) => record[field] === expectedValue));
    if (this.query.orderField) {
      const direction = this.query.orderDirection === "desc" ? -1 : 1;
      matchingRecords = [...matchingRecords].sort((leftRecord, rightRecord) => {
        if (leftRecord[this.query.orderField] === rightRecord[this.query.orderField]) return 0;
        return leftRecord[this.query.orderField] < rightRecord[this.query.orderField] ? -direction : direction;
      });
    }
    const end = this.query.limit === null ? undefined : this.query.offset + this.query.limit;
    return matchingRecords.slice(this.query.offset, end).map((record) => structuredClone(record));
  }

  async create(fields) {
    const record = {
      ...structuredClone(fields),
      id: `record-${this.sharedState.nextIdentifier}`,
    };
    this.sharedState.nextIdentifier += 1;
    this.records.push(record);

    if (this.sharedState.createBarrierTarget > 0) {
      if (!this.sharedState.createBarrier) {
        this.sharedState.createBarrier = new Promise((resolveBarrier) => {
          this.sharedState.releaseCreateBarrier = resolveBarrier;
        });
      }
      this.sharedState.createBarrierCount += 1;
      if (this.sharedState.createBarrierCount === this.sharedState.createBarrierTarget) {
        this.sharedState.releaseCreateBarrier();
      }
      await this.sharedState.createBarrier;
    }
    return { id: record.id };
  }

  async update(recordId, fields) {
    const recordIndex = this.records.findIndex((record) => record.id === recordId);
    if (recordIndex === -1) throw new Error(`Missing fake Quick record: ${recordId}`);
    this.records[recordIndex] = { ...this.records[recordIndex], ...structuredClone(fields) };
    return structuredClone(this.records[recordIndex]);
  }

  async delete(recordId) {
    const recordIndex = this.records.findIndex((record) => record.id === recordId);
    if (recordIndex !== -1) this.records.splice(recordIndex, 1);
  }
}

function quickRecord(recordNumber) {
  const timestamp = new Date(2026, 0, 1, 0, 0, recordNumber).toISOString();
  return {
    id: `record-${recordNumber}`,
    title: `Term ${recordNumber}`,
    title_key: `term ${recordNumber}`,
    familiarity: "beginner",
    body: `Description ${recordNumber}`,
    ts: recordNumber,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

test("Quick vocabulary reads every page beyond 500 records", async () => {
  const collection = new FakeQuickVocabularyCollection(
    Array.from({ length: 501 }, (_, recordIndex) => quickRecord(recordIndex + 1)),
  );
  const repository = new QuickVocabularyRepository({ collection, author: "person@shopify.com" });

  const entries = await repository.list();

  assert.equal(entries.length, 501);
  assert.deepEqual(
    collection.sharedState.calls.map((query) => query.offset),
    [0, 200, 400],
  );
});

test("concurrent creates converge on one normalized Organized title", async () => {
  const collection = new FakeQuickVocabularyCollection();
  collection.sharedState.createBarrierTarget = 2;
  const firstRepository = new QuickVocabularyRepository({ collection, author: "person@shopify.com" });
  const secondRepository = new QuickVocabularyRepository({ collection, author: "person@shopify.com" });
  const firstEntry = {
    title: "Kubectl",
    familiarity: "beginner",
    description: "First description.",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const secondEntry = {
    title: "  kubectl ",
    familiarity: "intermediate",
    description: "Second description.",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  await Promise.all([
    firstRepository.create(firstEntry),
    secondRepository.create(secondEntry),
  ]);

  assert.equal(collection.records.length, 1);
  assert.equal(collection.records[0].title_key, "kubectl");
});

test("Quick software development kit resolution uses the supplied command search path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quick-runtime-test-"));
  const binaryDirectory = join(directory, "bin");
  const distributionDirectory = join(directory, "dist");
  await mkdir(binaryDirectory, { recursive: true });
  await mkdir(distributionDirectory, { recursive: true });
  await writeFile(join(binaryDirectory, "quick"), "#!/bin/sh\n", { mode: 0o755 });
  await writeFile(join(distributionDirectory, "sdk.mjs"), "export const marker = true;\n");

  const softwareDevelopmentKitPath = resolveQuickSoftwareDevelopmentKitPath({
    PATH: binaryDirectory,
  });

  assert.equal(softwareDevelopmentKitPath, await realpath(join(distributionDirectory, "sdk.mjs")));
  assert.throws(
    () => resolveQuickSoftwareDevelopmentKitPath({ PATH: "" }),
    /quick command is unavailable/,
  );
});
