// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Deletes audit logs older than AUDIT_LOG_RETENTION_DAYS.
 *
 * This script is safe to run repeatedly and can be invoked at container
 * startup or by an external scheduler.
 */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/keinage";
const CLEANUP_LOCK_KEY = "keinage:audit-log-cleanup";

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

function parseRetentionDays(rawValue) {
  const value = rawValue?.trim() ?? "";
  if (!value || value === "0") {
    return { enabled: false, days: null };
  }
  if (!/^\d+$/.test(value)) {
    throw new Error("AUDIT_LOG_RETENTION_DAYS must be 0 or a positive integer.");
  }

  const days = Number(value);
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new Error("AUDIT_LOG_RETENTION_DAYS must be 0 or a positive integer.");
  }

  return { enabled: true, days };
}

function retentionCutoff(days, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function deleteExpiredAuditLogs(client, cutoff) {
  const lockResult = await client.query(
    "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
    [CLEANUP_LOCK_KEY],
  );
  if (!lockResult.rows[0]?.acquired) {
    return { acquired: false, deletedCount: 0 };
  }

  try {
    const result = await client.query(
      "DELETE FROM audit_logs WHERE created_at < $1",
      [cutoff],
    );
    return { acquired: true, deletedCount: result.rowCount ?? 0 };
  } finally {
    await client.query(
      "SELECT pg_advisory_unlock(hashtext($1))",
      [CLEANUP_LOCK_KEY],
    );
  }
}

async function main() {
  let retention;
  try {
    retention = parseRetentionDays(
      process.env.AUDIT_LOG_RETENTION_DAYS
        ?? readEnvValueFromDotEnv("AUDIT_LOG_RETENTION_DAYS"),
    );
  } catch (error) {
    console.error(`[audit-cleanup] Invalid retention setting: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (!retention.enabled) {
    console.log(
      "[audit-cleanup] Skipped: AUDIT_LOG_RETENTION_DAYS is unset or 0.",
    );
    return;
  }

  const databaseUrl =
    process.env.DATABASE_URL
    || readEnvValueFromDotEnv("DATABASE_URL")
    || DEFAULT_DATABASE_URL;
  const cutoff = retentionCutoff(retention.days);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await deleteExpiredAuditLogs(client, cutoff);
    if (!result.acquired) {
      console.log("[audit-cleanup] Skipped: another cleanup is running.");
      return;
    }

    console.log(
      `[audit-cleanup] Deleted ${result.deletedCount} audit log(s) older than `
      + `${retention.days} day(s). cutoff=${cutoff}`,
    );
  } finally {
    await client.end();
  }
}

module.exports = {
  deleteExpiredAuditLogs,
  parseRetentionDays,
  retentionCutoff,
};

if (require.main === module) {
  main().catch((error) => {
    console.error("[audit-cleanup] Failed:", error);
    process.exitCode = 1;
  });
}
