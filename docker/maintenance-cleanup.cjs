// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
/* eslint-disable @typescript-eslint/no-require-imports */
const {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} = require("@aws-sdk/client-s3");
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/keinage";
const CLEANUP_LOCK_KEY = "keinage:maintenance-cleanup";
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const DEFAULT_SIGNUP_RETENTION_DAYS = 30;
const DEFAULT_STRIPE_EVENT_RETENTION_DAYS = 90;
const DEFAULT_ORPHAN_MEDIA_MIN_AGE_DAYS = 7;
const MEDIA_EXTENSIONS = new Set([
  ".gif",
  ".jpeg",
  ".jpg",
  ".mp4",
  ".png",
  ".webm",
  ".webp",
]);

function readEnvValueFromDotEnv(name) {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return null;

  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!trimmed.startsWith(`${name}=`)) continue;

    const value = trimmed.slice(name.length + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }

  return null;
}

function envValue(name) {
  return process.env[name] ?? readEnvValueFromDotEnv(name);
}

function parsePositiveInteger(name, rawValue, fallback) {
  const value = rawValue?.trim();
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseArguments(argv) {
  const argumentsWithoutSeparator = argv.filter((argument) => argument !== "--");
  const known = new Set(["--execute", "--orphan-media"]);
  const unknown = argumentsWithoutSeparator.filter((argument) => !known.has(argument));
  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  }

  return {
    execute: argumentsWithoutSeparator.includes("--execute"),
    includeOrphanMedia: argumentsWithoutSeparator.includes("--orphan-media"),
  };
}

function subtractDays(now, days) {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

function buildDatabaseCleanupTasks(input) {
  return [
    {
      name: "auth_sessions",
      table: "auth_sessions",
      predicate: "expires_at < $1",
      params: [input.now],
    },
    {
      name: "google_oauth_flows",
      table: "google_oauth_flows",
      predicate: "expires_at < $1 OR consumed_at IS NOT NULL",
      params: [input.now],
    },
    {
      name: "signup_requests",
      table: "signup_requests",
      predicate:
        "(completed_at IS NULL AND expires_at < $1) OR completed_at < $2",
      params: [input.now, input.signupCutoff],
    },
    {
      name: "shared_signup_requests",
      table: "shared_signup_requests",
      predicate:
        "(completed_at IS NULL AND expires_at < $1) OR completed_at < $2",
      params: [input.now, input.signupCutoff],
    },
    {
      name: "stripe_events",
      table: "stripe_events",
      predicate: "status IN ('processed', 'ignored') AND created_at < $1",
      params: [input.stripeEventCutoff],
    },
  ];
}

async function runDatabaseCleanupTasks(client, tasks, execute) {
  const results = [];

  if (execute) await client.query("BEGIN");
  try {
    for (const task of tasks) {
      const sql = execute
        ? `DELETE FROM ${task.table} WHERE ${task.predicate}`
        : `SELECT count(*)::int AS count FROM ${task.table} WHERE ${task.predicate}`;
      const result = await client.query(sql, task.params);
      results.push({
        name: task.name,
        count: execute ? result.rowCount ?? 0 : result.rows[0]?.count ?? 0,
      });
    }
    if (execute) await client.query("COMMIT");
  } catch (error) {
    if (execute) await client.query("ROLLBACK");
    throw error;
  }

  return results;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function getS3Config() {
  const endpoint = envValue("S3_INTERNAL_ENDPOINT") || envValue("S3_ENDPOINT");
  const region = envValue("S3_REGION");
  const bucket = envValue("S3_BUCKET");
  const accessKeyId = envValue("S3_ACCESS_KEY_ID");
  const secretAccessKey = envValue("S3_SECRET_ACCESS_KEY");
  if (!region || !bucket) return null;
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error("Both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required.");
  }

  return {
    endpoint: endpoint || undefined,
    region,
    bucket,
    credentials: accessKeyId && secretAccessKey
      ? { accessKeyId, secretAccessKey }
      : undefined,
    forcePathStyle: parseBoolean(
      envValue("S3_FORCE_PATH_STYLE"),
      Boolean(endpoint),
    ),
  };
}

function createStorageAdapter() {
  const config = getS3Config();
  if (!config) {
    return {
      driver: "local",
      async deleteObject(key) {
        const target = path.resolve(LOCAL_UPLOAD_DIR, key);
        if (
          target !== LOCAL_UPLOAD_DIR
          && !target.startsWith(`${LOCAL_UPLOAD_DIR}${path.sep}`)
        ) {
          throw new Error("Invalid local storage key.");
        }
        if (fs.existsSync(target)) fs.unlinkSync(target);
      },
      async listObjects() {
        return listLocalObjects(LOCAL_UPLOAD_DIR);
      },
    };
  }

  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: config.credentials,
    forcePathStyle: config.forcePathStyle,
  });

  return {
    driver: "s3",
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }));
    },
    async listObjects() {
      const objects = [];
      let continuationToken;
      do {
        const response = await client.send(new ListObjectsV2Command({
          Bucket: config.bucket,
          ContinuationToken: continuationToken,
        }));
        for (const object of response.Contents ?? []) {
          if (!object.Key) continue;
          objects.push({
            key: object.Key,
            size: Number(object.Size ?? 0),
            modifiedAt: (object.LastModified ?? new Date(0)).toISOString(),
          });
        }
        continuationToken = response.IsTruncated
          ? response.NextContinuationToken
          : undefined;
      } while (continuationToken);
      return objects;
    },
  };
}

function listLocalObjects(directory, prefix = "") {
  if (!fs.existsSync(directory)) return [];
  const objects = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      objects.push(...listLocalObjects(fullPath, key));
      continue;
    }
    const stat = fs.statSync(fullPath);
    objects.push({
      key,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }
  return objects;
}

async function cleanupDirectUploadSessions(client, storage, now, execute) {
  const sessions = await client.query(
    `
      SELECT media_id, object_key, poster_object_key
      FROM direct_upload_sessions
      WHERE expires_at < $1
      ORDER BY expires_at
    `,
    [now],
  );
  if (!execute) {
    return {
      sessions: sessions.rows.length,
      objectsDeleted: 0,
      failures: 0,
    };
  }

  let objectsDeleted = 0;
  let failures = 0;
  let sessionsDeleted = 0;
  for (const session of sessions.rows) {
    const media = await client.query(
      "SELECT 1 FROM media_items WHERE id = $1 LIMIT 1",
      [session.media_id],
    );

    try {
      if (media.rowCount === 0) {
        if (storage.driver !== "s3") {
          failures++;
          continue;
        }
        await storage.deleteObject(session.object_key);
        objectsDeleted++;
        if (session.poster_object_key) {
          await storage.deleteObject(session.poster_object_key);
          objectsDeleted++;
        }
      }
      const deleted = await client.query(
        "DELETE FROM direct_upload_sessions WHERE media_id = $1",
        [session.media_id],
      );
      sessionsDeleted += deleted.rowCount ?? 0;
    } catch {
      failures++;
    }
  }

  return {
    sessions: sessionsDeleted,
    objectsDeleted,
    failures,
  };
}

function storageKeyFromFilePath(filePath) {
  if (filePath.startsWith("/uploads/")) {
    return filePath.slice("/uploads/".length);
  }
  try {
    const url = new URL(filePath);
    if (url.pathname.startsWith("/uploads/")) {
      return url.pathname.slice("/uploads/".length);
    }
  } catch {
    // Not an absolute URL.
  }

  const publicBases = [
    envValue("S3_PUBLIC_BASE_URL"),
    envValue("STORAGE_PUBLIC_BASE_URL"),
    envValue("CLOUDFRONT_BASE_URL"),
  ].filter(Boolean);
  for (const base of publicBases) {
    const normalized = base.replace(/\/+$/, "");
    if (filePath.startsWith(`${normalized}/`)) {
      return filePath.slice(normalized.length + 1);
    }
  }
  return null;
}

function thumbnailKey(key) {
  const directory = path.posix.dirname(key);
  const extension = path.posix.extname(key).toLowerCase();
  const thumbnailExtension = [".gif", ".mp4", ".webm"].includes(extension)
    ? ".jpg"
    : extension;
  const basename = path.posix.basename(key, extension);
  return directory === "."
    ? `thumbs/${basename}${thumbnailExtension}`
    : `${directory}/thumbs/${basename}${thumbnailExtension}`;
}

function isMediaObjectKey(key) {
  return MEDIA_EXTENSIONS.has(path.posix.extname(key).toLowerCase());
}

async function reportOrphanMedia(client, storage, cutoff) {
  const [storedObjects, mediaRows, directUploadRows] = await Promise.all([
    storage.listObjects(),
    client.query("SELECT file_path FROM media_items"),
    client.query(
      "SELECT object_key, poster_object_key FROM direct_upload_sessions",
    ),
  ]);
  const referenced = new Set();
  for (const row of mediaRows.rows) {
    const key = storageKeyFromFilePath(row.file_path);
    if (!key) continue;
    referenced.add(key);
    referenced.add(thumbnailKey(key));
  }
  for (const row of directUploadRows.rows) {
    referenced.add(row.object_key);
    if (row.poster_object_key) referenced.add(row.poster_object_key);
  }

  const candidates = storedObjects.filter((object) =>
    isMediaObjectKey(object.key)
    && object.modifiedAt < cutoff
    && !referenced.has(object.key));

  return {
    driver: storage.driver,
    count: candidates.length,
    bytes: candidates.reduce((sum, object) => sum + object.size, 0),
  };
}

async function withCleanupLock(client, callback) {
  const lock = await client.query(
    "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
    [CLEANUP_LOCK_KEY],
  );
  if (!lock.rows[0]?.acquired) return null;

  try {
    return await callback();
  } finally {
    await client.query(
      "SELECT pg_advisory_unlock(hashtext($1))",
      [CLEANUP_LOCK_KEY],
    );
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const signupRetentionDays = parsePositiveInteger(
    "MAINTENANCE_SIGNUP_RETENTION_DAYS",
    envValue("MAINTENANCE_SIGNUP_RETENTION_DAYS"),
    DEFAULT_SIGNUP_RETENTION_DAYS,
  );
  const stripeRetentionDays = parsePositiveInteger(
    "STRIPE_EVENT_RETENTION_DAYS",
    envValue("STRIPE_EVENT_RETENTION_DAYS"),
    DEFAULT_STRIPE_EVENT_RETENTION_DAYS,
  );
  const orphanMinAgeDays = parsePositiveInteger(
    "ORPHAN_MEDIA_MIN_AGE_DAYS",
    envValue("ORPHAN_MEDIA_MIN_AGE_DAYS"),
    DEFAULT_ORPHAN_MEDIA_MIN_AGE_DAYS,
  );
  const databaseUrl =
    envValue("DATABASE_URL") || DEFAULT_DATABASE_URL;
  const client = new Client({ connectionString: databaseUrl });
  const storage = createStorageAdapter();

  await client.connect();
  try {
    const result = await withCleanupLock(client, async () => {
      const databaseResults = await runDatabaseCleanupTasks(
        client,
        buildDatabaseCleanupTasks({
          now,
          signupCutoff: subtractDays(nowDate, signupRetentionDays),
          stripeEventCutoff: subtractDays(nowDate, stripeRetentionDays),
        }),
        options.execute,
      );
      const directUploads = await cleanupDirectUploadSessions(
        client,
        storage,
        now,
        options.execute,
      );
      const orphanMedia = options.includeOrphanMedia
        ? await reportOrphanMedia(
            client,
            storage,
            subtractDays(nowDate, orphanMinAgeDays),
          )
        : null;
      return { databaseResults, directUploads, orphanMedia };
    });

    if (!result) {
      console.log("[maintenance-cleanup] Skipped: another cleanup is running.");
      return;
    }

    const mode = options.execute ? "execute" : "dry-run";
    console.log(`[maintenance-cleanup] mode=${mode}`);
    for (const item of result.databaseResults) {
      console.log(`[maintenance-cleanup] target=${item.name} count=${item.count}`);
    }
    console.log(
      `[maintenance-cleanup] target=direct_upload_sessions `
      + `count=${result.directUploads.sessions} `
      + `objects_deleted=${result.directUploads.objectsDeleted} `
      + `failures=${result.directUploads.failures}`,
    );
    if (result.orphanMedia) {
      console.log(
        `[maintenance-cleanup] target=orphan_media driver=${result.orphanMedia.driver} `
        + `count=${result.orphanMedia.count} bytes=${result.orphanMedia.bytes} `
        + "action=report-only",
      );
    }
  } finally {
    await client.end();
  }
}

module.exports = {
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
};

if (require.main === module) {
  main().catch((error) => {
    console.error("[maintenance-cleanup] Failed:", error);
    process.exitCode = 1;
  });
}
