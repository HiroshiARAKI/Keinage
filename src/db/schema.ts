// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import {
  pgTable,
  text,
  integer,
  boolean,
  bigint,
  primaryKey,
  AnyPgColumn,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";
import { randomUUID } from "crypto";

const isoNow = sql`to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const boards = pgTable("boards", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  visibility: text("visibility").notNull().default("private"),
  templateId: text("template_id").notNull(), // "simple" | "photo-clock" | "retro" | "message" | "call-number"
  config: text("config").notNull().default("{}"),
  isActive: boolean("is_active").notNull().default(true),
  status: text("status").notNull().default("active"),
  lastViewedAt: text("last_viewed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(isoNow),
  updatedAt: text("updated_at")
    .notNull()
    .default(isoNow)
    .$onUpdate(() => new Date().toISOString()),
});

export const boardDisplayDevices = pgTable(
  "board_display_devices",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    deviceKey: text("device_key").notNull(),
    userAgent: text("user_agent"),
    lastSeenAt: text("last_seen_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(isoNow),
    updatedAt: text("updated_at")
      .notNull()
      .default(isoNow)
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    ownerDeviceBoardUnique: uniqueIndex("board_display_devices_owner_device_board_unique")
      .on(table.ownerUserId, table.deviceKey, table.boardId),
    ownerIdx: index("board_display_devices_owner_user_id_idx")
      .on(table.ownerUserId),
    boardIdx: index("board_display_devices_board_id_idx")
      .on(table.boardId),
    lastSeenIdx: index("board_display_devices_last_seen_at_idx")
      .on(table.lastSeenAt),
  }),
);

export const mediaItems = pgTable("media_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "image" | "video"
  filePath: text("file_path").notNull(),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull().default(0),
  thumbnailSizeBytes: bigint("thumbnail_size_bytes", { mode: "number" }).notNull().default(0),
  width: integer("width"),
  height: integer("height"),
  displayOrder: integer("display_order").notNull().default(0),
  duration: integer("duration").notNull().default(5), // seconds
  createdAt: text("created_at")
    .notNull()
    .default(isoNow),
  updatedAt: text("updated_at")
    .notNull()
    .default(isoNow)
    .$onUpdate(() => new Date().toISOString()),
});

export const messages = pgTable("messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  priority: integer("priority").notNull().default(0),
  expiresAt: text("expires_at"),
  createdAt: text("created_at")
    .notNull()
    .default(isoNow),
  updatedAt: text("updated_at")
    .notNull()
    .default(isoNow)
    .$onUpdate(() => new Date().toISOString()),
});

export const settings = pgTable(
  "settings",
  {
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(isoNow)
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.ownerUserId, table.key] }),
  }),
);

export const ownerSubscriptions = pgTable(
  "owner_subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    billingMode: text("billing_mode").notNull().default("disabled"),
    planCode: text("plan_code").notNull().default("free"),
    billingInterval: text("billing_interval"),
    status: text("status").notNull().default("none"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeScheduleId: text("stripe_schedule_id"),
    currentPriceId: text("current_price_id"),
    currentPeriodEnd: text("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    cancelAt: text("cancel_at"),
    canceledAt: text("canceled_at"),
    endedAt: text("ended_at"),
    deletedOwnerAt: text("deleted_owner_at"),
    pendingPlanCode: text("pending_plan_code"),
    pendingPriceId: text("pending_price_id"),
    pendingBillingInterval: text("pending_billing_interval"),
    pendingPlanEffectiveAt: text("pending_plan_effective_at"),
    pendingActiveBoardIds: text("pending_active_board_ids"),
    lastSyncedAt: text("last_synced_at"),
    createdAt: text("created_at")
      .notNull()
      .default(isoNow),
    updatedAt: text("updated_at")
      .notNull()
      .default(isoNow)
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    ownerUnique: uniqueIndex("owner_subscriptions_owner_user_id_unique")
      .on(table.ownerUserId),
    stripeCustomerIdx: index("owner_subscriptions_stripe_customer_id_idx")
      .on(table.stripeCustomerId),
    stripeSubscriptionIdx: index("owner_subscriptions_stripe_subscription_id_idx")
      .on(table.stripeSubscriptionId),
    stripeScheduleIdx: index("owner_subscriptions_stripe_schedule_id_idx")
      .on(table.stripeScheduleId),
  }),
);

export const deletedOwnerBillingRecords = pgTable(
  "deleted_owner_billing_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    ownerUserId: text("owner_user_id").notNull(),
    email: text("email"),
    billingMode: text("billing_mode").notNull().default("disabled"),
    planCode: text("plan_code").notNull().default("free"),
    billingInterval: text("billing_interval"),
    status: text("status").notNull().default("canceled"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    canceledAt: text("canceled_at"),
    deletedOwnerAt: text("deleted_owner_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(isoNow),
    updatedAt: text("updated_at")
      .notNull()
      .default(isoNow)
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    ownerIdx: index("deleted_owner_billing_records_owner_user_id_idx")
      .on(table.ownerUserId),
    stripeCustomerIdx: index("deleted_owner_billing_records_stripe_customer_id_idx")
      .on(table.stripeCustomerId),
    stripeSubscriptionIdx: index("deleted_owner_billing_records_stripe_subscription_id_idx")
      .on(table.stripeSubscriptionId),
  }),
);

export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  status: text("status").notNull().default("processing"),
  payload: text("payload").notNull(),
  error: text("error"),
  processedAt: text("processed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(isoNow),
  updatedAt: text("updated_at")
    .notNull()
    .default(isoNow)
    .$onUpdate(() => new Date().toISOString()),
}, (table) => ({
  statusIdx: index("stripe_events_status_idx").on(table.status),
  eventTypeIdx: index("stripe_events_event_type_idx").on(table.eventType),
}));

export const pinResetTokens = pgTable("pin_reset_tokens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  token: text("token").notNull().unique(),
  /** User whose PIN this token resets */
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at")
    .notNull()
    .default(isoNow),
});

export const pinAttempts = pgTable("pin_attempts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  ipAddress: text("ip_address").notNull(),
  attemptedAt: text("attempted_at")
    .notNull()
    .default(isoNow),
});

export const signupRequests = pgTable("signup_requests", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  phoneNumber: text("phone_number").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  completedAt: text("completed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(isoNow),
  updatedAt: text("updated_at")
    .notNull()
    .default(isoNow)
    .$onUpdate(() => new Date().toISOString()),
});

export const sharedSignupRequests = pgTable("shared_signup_requests", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("general"),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  completedAt: text("completed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(isoNow),
  updatedAt: text("updated_at")
    .notNull()
    .default(isoNow)
    .$onUpdate(() => new Date().toISOString()),
});

export const accountDeletionRequests = pgTable("account_deletion_requests", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  ownerUserId: text("owner_user_id").notNull().unique(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  completedAt: text("completed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(isoNow),
  updatedAt: text("updated_at")
    .notNull()
    .default(isoNow)
    .$onUpdate(() => new Date().toISOString()),
});

// ── New auth tables ─────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    /** Human-readable login ID (e.g. "admin") */
    userId: text("user_id").notNull().unique(),
    email: text("email").notNull().unique(),
    /** Phone number for owner sign-up uniqueness checks */
    phoneNumber: text("phone_number").unique(),
    passwordHash: text("password_hash"),
    /** 6-digit PIN hash (nullable until PIN is configured) */
    pinHash: text("pin_hash"),
    /** Owner of an isolated workspace, or a shared member under an owner */
    attribute: text("attribute").notNull().default("shared"),
    /** Shared users point at their owner user; owner users keep this null */
    ownerUserId: text("owner_user_id").references(
      (): AnyPgColumn => users.id,
      { onDelete: "set null" },
    ),
    role: text("role").notNull().default("general"),
    isSuperOwner: boolean("is_super_owner").notNull().default(false),
    superOwnerGrantedAt: text("super_owner_granted_at"),
    /** Dashboard color theme preference: "system" | "light" | "dark" */
    colorTheme: text("color_theme").notNull().default("system"),
    /** Preferred UI locale. Null means fallback to Accept-Language per request. */
    locale: text("locale"),
    /** Timestamp of the last successful email+password login */
    lastFullAuthAt: text("last_full_auth_at"),
    createdAt: text("created_at")
      .notNull()
      .default(isoNow),
    updatedAt: text("updated_at")
      .notNull()
      .default(isoNow)
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    uniqueSuperOwner: uniqueIndex("users_single_super_owner_unique")
      .on(table.isSuperOwner)
      .where(sql`${table.isSuperOwner} = true`),
  }),
);

export const superOwnerAuditLogs = pgTable(
  "super_owner_audit_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    createdAt: text("created_at")
      .notNull()
      .default(isoNow),
  },
  (table) => ({
    userIdx: index("super_owner_audit_logs_user_id_idx").on(table.userId),
    createdAtIdx: index("super_owner_audit_logs_created_at_idx").on(table.createdAt),
  }),
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(isoNow),
  },
  (table) => ({
    providerAccountUnique: uniqueIndex("auth_accounts_provider_account_unique")
      .on(table.provider, table.providerAccountId),
  }),
);

export const googleOAuthFlows = pgTable("google_oauth_flows", {
  state: text("state").primaryKey(),
  mode: text("mode").notNull(),
  redirectTo: text("redirect_to"),
  sharedSignupToken: text("shared_signup_token"),
  codeVerifier: text("code_verifier").notNull(),
  nonce: text("nonce").notNull(),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(isoNow),
});

export const authSessions = pgTable("auth_sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionToken: text("session_token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(isoNow),
});

export const deviceAuthGrants = pgTable("device_auth_grants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceTokenHash: text("device_token_hash").notNull().unique(),
  lastFullAuthAt: text("last_full_auth_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(isoNow),
  updatedAt: text("updated_at")
    .notNull()
    .default(isoNow)
    .$onUpdate(() => new Date().toISOString()),
});

// ── Relations ────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  authAccounts: many(authAccounts),
  sessions: many(authSessions),
  deviceAuthGrants: many(deviceAuthGrants),
  pinResetTokens: many(pinResetTokens),
  ownerSubscriptions: many(ownerSubscriptions),
  boardDisplayDevices: many(boardDisplayDevices),
  superOwnerAuditLogs: many(superOwnerAuditLogs),
}));

export const boardsRelations = relations(boards, ({ many }) => ({
  displayDevices: many(boardDisplayDevices),
}));

export const boardDisplayDevicesRelations = relations(boardDisplayDevices, ({ one }) => ({
  owner: one(users, {
    fields: [boardDisplayDevices.ownerUserId],
    references: [users.id],
  }),
  board: one(boards, {
    fields: [boardDisplayDevices.boardId],
    references: [boards.id],
  }),
}));

export const ownerSubscriptionsRelations = relations(ownerSubscriptions, ({ one }) => ({
  owner: one(users, {
    fields: [ownerSubscriptions.ownerUserId],
    references: [users.id],
  }),
}));

export const authAccountsRelations = relations(authAccounts, ({ one }) => ({
  user: one(users, {
    fields: [authAccounts.userId],
    references: [users.id],
  }),
}));

export const pinResetTokensRelations = relations(pinResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [pinResetTokens.userId],
    references: [users.id],
  }),
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, {
    fields: [authSessions.userId],
    references: [users.id],
  }),
}));

export const deviceAuthGrantsRelations = relations(deviceAuthGrants, ({ one }) => ({
  user: one(users, {
    fields: [deviceAuthGrants.userId],
    references: [users.id],
  }),
}));

export const superOwnerAuditLogsRelations = relations(superOwnerAuditLogs, ({ one }) => ({
  user: one(users, {
    fields: [superOwnerAuditLogs.userId],
    references: [users.id],
  }),
}));
