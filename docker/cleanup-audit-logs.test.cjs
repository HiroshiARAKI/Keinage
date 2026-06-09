// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const {
  deleteExpiredAuditLogs,
  parseRetentionDays,
  retentionCutoff,
} = require("./cleanup-audit-logs.cjs");

test("retention is disabled when unset or zero", () => {
  assert.deepEqual(parseRetentionDays(undefined), {
    enabled: false,
    days: null,
  });
  assert.deepEqual(parseRetentionDays("0"), {
    enabled: false,
    days: null,
  });
});

test("retention accepts a positive integer", () => {
  assert.deepEqual(parseRetentionDays("365"), {
    enabled: true,
    days: 365,
  });
});

test("retention rejects invalid values", () => {
  assert.throws(() => parseRetentionDays("-1"));
  assert.throws(() => parseRetentionDays("1.5"));
  assert.throws(() => parseRetentionDays("abc"));
});

test("cutoff subtracts the configured number of days", () => {
  assert.equal(
    retentionCutoff(365, new Date("2026-06-09T00:00:00.000Z")),
    "2025-06-09T00:00:00.000Z",
  );
});

test("cleanup deletes only through the parameterized cutoff", async () => {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.startsWith("SELECT pg_try_advisory_lock")) {
        return { rows: [{ acquired: true }] };
      }
      if (sql.startsWith("DELETE FROM audit_logs")) {
        return { rowCount: 4, rows: [] };
      }
      return { rows: [{ pg_advisory_unlock: true }] };
    },
  };

  const result = await deleteExpiredAuditLogs(
    client,
    "2025-06-09T00:00:00.000Z",
  );

  assert.deepEqual(result, { acquired: true, deletedCount: 4 });
  assert.equal(queries[1].sql, "DELETE FROM audit_logs WHERE created_at < $1");
  assert.deepEqual(queries[1].params, ["2025-06-09T00:00:00.000Z"]);
  assert.equal(queries.length, 3);
  assert.match(queries[2].sql, /pg_advisory_unlock/);
});

test("cleanup skips when another process holds the advisory lock", async () => {
  const client = {
    async query() {
      return { rows: [{ acquired: false }] };
    },
  };

  assert.deepEqual(
    await deleteExpiredAuditLogs(client, "2025-06-09T00:00:00.000Z"),
    { acquired: false, deletedCount: 0 },
  );
});

test("cleanup releases the advisory lock when deletion fails", async () => {
  let unlocked = false;
  const client = {
    async query(sql) {
      if (sql.startsWith("SELECT pg_try_advisory_lock")) {
        return { rows: [{ acquired: true }] };
      }
      if (sql.startsWith("DELETE FROM audit_logs")) {
        throw new Error("delete failed");
      }
      unlocked = true;
      return { rows: [{ pg_advisory_unlock: true }] };
    },
  };

  await assert.rejects(
    deleteExpiredAuditLogs(client, "2025-06-09T00:00:00.000Z"),
    /delete failed/,
  );
  assert.equal(unlocked, true);
});
