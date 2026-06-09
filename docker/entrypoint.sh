#!/bin/sh
# Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
# SPDX-License-Identifier: Apache-2.0
set -e

echo "[entrypoint] Running database migrations..."
node migrate.cjs

echo "[entrypoint] Cleaning up expired audit logs..."
if ! node cleanup-audit-logs.cjs; then
  echo "[entrypoint] Audit log cleanup failed; continuing server startup." >&2
fi

echo "[entrypoint] Starting server..."
exec node server.js
