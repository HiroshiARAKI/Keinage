// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildDatabaseCleanupTasks,
  cleanupDirectUploadSessions,
  parseArguments,
  parsePositiveInteger,
  reportOrphanMedia,
  runDatabaseCleanupTasks,
  storageKeyFromFilePath,
  subtractDays,
  thumbnailKey,
  withCleanupLock,
} = require("./maintenance-cleanup.cjs");

test("arguments default to dry-run and reject unknown options", () => {
  assert.deepEqual(parseArguments([]), {
    execute: false,
    includeOrphanMedia: false,
  });
  assert.deepEqual(parseArguments(["--execute", "--orphan-media"]), {
    execute: true,
    includeOrphanMedia: true,
  });
  assert.deepEqual(parseArguments(["--", "--execute"]), {
    execute: true,
    includeOrphanMedia: false,
  });
  assert.throws(() => parseArguments(["--delete-orphans"]));
});

test("retention values use defaults and require positive integers", () => {
  assert.equal(parsePositiveInteger("TEST", undefined, 30), 30);
  assert.equal(parsePositiveInteger("TEST", "90", 30), 90);
  assert.throws(() => parsePositiveInteger("TEST", "0", 30));
  assert.throws(() => parsePositiveInteger("TEST", "1.5", 30));
});

test("date cutoff subtracts whole days", () => {
  assert.equal(
    subtractDays(new Date("2026-06-09T00:00:00.000Z"), 30),
    "2026-05-10T00:00:00.000Z",
  );
});

test("database cleanup dry-run only counts candidates", async () => {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [{ count: 3 }] };
    },
  };
  const tasks = buildDatabaseCleanupTasks({
    now: "2026-06-09T00:00:00.000Z",
    signupCutoff: "2026-05-10T00:00:00.000Z",
    stripeEventCutoff: "2026-03-11T00:00:00.000Z",
  });

  const results = await runDatabaseCleanupTasks(client, tasks, false);
  assert.equal(results.length, 5);
  assert.equal(results.every((result) => result.count === 3), true);
  assert.equal(queries.every((query) => query.sql.startsWith("SELECT")), true);
});

test("database cleanup execute uses a transaction", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      return { rowCount: sql.startsWith("DELETE") ? 2 : 0, rows: [] };
    },
  };
  const tasks = [{
    name: "auth_sessions",
    table: "auth_sessions",
    predicate: "expires_at < $1",
    params: ["2026-06-09T00:00:00.000Z"],
  }];

  assert.deepEqual(
    await runDatabaseCleanupTasks(client, tasks, true),
    [{ name: "auth_sessions", count: 2 }],
  );
  assert.deepEqual(queries, [
    "BEGIN",
    "DELETE FROM auth_sessions WHERE expires_at < $1",
    "COMMIT",
  ]);
});

test("direct upload dry-run does not delete storage or sessions", async () => {
  let deleted = false;
  const client = {
    async query() {
      return {
        rows: [{
          media_id: "media-1",
          object_key: "owners/a/boards/b/media/media-1.mp4",
          poster_object_key: null,
        }],
      };
    },
  };
  const storage = {
    driver: "s3",
    async deleteObject() {
      deleted = true;
    },
  };

  assert.deepEqual(
    await cleanupDirectUploadSessions(
      client,
      storage,
      "2026-06-09T00:00:00.000Z",
      false,
    ),
    { sessions: 1, objectsDeleted: 0, failures: 0 },
  );
  assert.equal(deleted, false);
});

test("direct upload execute deletes unreferenced objects and session", async () => {
  const deletedObjects = [];
  const client = {
    async query(sql) {
      if (sql.trimStart().startsWith("SELECT media_id")) {
        return {
          rows: [{
            media_id: "media-1",
            object_key: "owners/a/boards/b/media/media-1.mp4",
            poster_object_key: "owners/a/boards/b/media/thumbs/media-1.jpg",
          }],
        };
      }
      if (sql.startsWith("SELECT 1 FROM media_items")) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const storage = {
    driver: "s3",
    async deleteObject(key) {
      deletedObjects.push(key);
    },
  };

  assert.deepEqual(
    await cleanupDirectUploadSessions(
      client,
      storage,
      "2026-06-09T00:00:00.000Z",
      true,
    ),
    { sessions: 1, objectsDeleted: 2, failures: 0 },
  );
  assert.equal(deletedObjects.length, 2);
});

test("direct upload execute preserves storage when media was completed", async () => {
  let storageDeleted = false;
  const client = {
    async query(sql) {
      if (sql.trimStart().startsWith("SELECT media_id")) {
        return {
          rows: [{
            media_id: "media-1",
            object_key: "owners/a/boards/b/media/media-1.mp4",
            poster_object_key: null,
          }],
        };
      }
      if (sql.startsWith("SELECT 1 FROM media_items")) {
        return { rowCount: 1, rows: [{ "?column?": 1 }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const storage = {
    driver: "s3",
    async deleteObject() {
      storageDeleted = true;
    },
  };

  const result = await cleanupDirectUploadSessions(
    client,
    storage,
    "2026-06-09T00:00:00.000Z",
    true,
  );
  assert.equal(result.sessions, 1);
  assert.equal(storageDeleted, false);
});

test("direct upload execute does not delete local files from an S3 session", async () => {
  let sessionDeleted = false;
  const client = {
    async query(sql) {
      if (sql.trimStart().startsWith("SELECT media_id")) {
        return {
          rows: [{
            media_id: "media-1",
            object_key: "owners/a/boards/b/media/media-1.mp4",
            poster_object_key: null,
          }],
        };
      }
      if (sql.startsWith("SELECT 1 FROM media_items")) {
        return { rowCount: 0, rows: [] };
      }
      sessionDeleted = true;
      return { rowCount: 1, rows: [] };
    },
  };
  const storage = {
    driver: "local",
    async deleteObject() {
      throw new Error("local storage must not be deleted");
    },
  };

  assert.deepEqual(
    await cleanupDirectUploadSessions(
      client,
      storage,
      "2026-06-09T00:00:00.000Z",
      true,
    ),
    { sessions: 0, objectsDeleted: 0, failures: 1 },
  );
  assert.equal(sessionDeleted, false);
});

test("orphan report does not expose keys and counts only old unreferenced media", async () => {
  const client = {
    async query(sql) {
      if (sql.includes("direct_upload_sessions")) {
        return {
          rows: [{
            object_key: "owners/a/boards/b/media/pending.mp4",
            poster_object_key: null,
          }],
        };
      }
      return {
        rows: [{ file_path: "/uploads/owners/a/boards/b/media/kept.jpg" }],
      };
    },
  };
  const storage = {
    driver: "local",
    async listObjects() {
      return [
        {
          key: "owners/a/boards/b/media/kept.jpg",
          size: 100,
          modifiedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          key: "owners/a/boards/b/media/orphan.jpg",
          size: 200,
          modifiedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          key: "owners/a/boards/b/media/new-orphan.jpg",
          size: 300,
          modifiedAt: "2026-06-08T00:00:00.000Z",
        },
        {
          key: "owners/a/boards/b/media/pending.mp4",
          size: 400,
          modifiedAt: "2026-01-01T00:00:00.000Z",
        },
      ];
    },
  };

  assert.deepEqual(
    await reportOrphanMedia(
      client,
      storage,
      "2026-06-02T00:00:00.000Z",
    ),
    { driver: "local", count: 1, bytes: 200 },
  );
});

test("storage path helpers support media and thumbnails", () => {
  assert.equal(
    storageKeyFromFilePath("/uploads/owners/a/boards/b/media/test.mp4"),
    "owners/a/boards/b/media/test.mp4",
  );
  assert.equal(
    thumbnailKey("owners/a/boards/b/media/test.mp4"),
    "owners/a/boards/b/media/thumbs/test.jpg",
  );
});

test("cleanup lock is always released", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      return { rows: [{ acquired: true }] };
    },
  };

  await assert.rejects(
    withCleanupLock(client, async () => {
      throw new Error("failed");
    }),
    /failed/,
  );
  assert.match(queries.at(-1), /pg_advisory_unlock/);
});
