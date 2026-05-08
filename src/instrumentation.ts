// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { validateProductionSecurityConfig } from "@/lib/security";

export async function register() {
  validateProductionSecurityConfig();
}
