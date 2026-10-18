import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  integer,
} from "drizzle-orm/pg-core";

/**
 * Registered accounts (Milestone 1).
 * Passwords are stored as bcrypt hashes only — never plaintext.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("users_email_active_idx")
      .on(table.email)
      .where(sql`deleted_at IS NULL`),
  ]
);

/** Server-side sessions; cookie holds opaque token, DB stores hash. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_idx").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ]
);

/** One-time tokens for email verification and password reset. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // email_verify | password_reset
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_tokens_hash_idx").on(table.tokenHash),
    index("auth_tokens_user_id_idx").on(table.userId),
  ]
);

/**
 * Inboxes are persistent until explicitly deleted by the user.
 * Access:
 * - Anonymous (userId null): high-entropy accessToken grants access.
 * - Account-owned (userId set): requires authenticated session for that user;
 *   accessToken alone is NOT sufficient (prevents token URL bypass).
 */
export const inboxes = pgTable(
  "inboxes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    localPart: text("local_part").notNull(),
    address: text("address").notNull(),
    accessToken: text("access_token").notNull(),
    /** Nullable: existing inboxes remain anonymous until claimed/created by a user. */
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("inboxes_address_active_idx")
      .on(table.address)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex("inboxes_access_token_idx").on(table.accessToken),
    index("inboxes_local_part_idx").on(table.localPart),
    index("inboxes_user_id_idx").on(table.userId),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inboxId: uuid("inbox_id")
      .notNull()
      .references(() => inboxes.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    subject: text("subject").notNull().default("(no subject)"),
    textBody: text("text_body"),
    htmlBody: text("html_body"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("messages_inbox_id_idx").on(table.inboxId),
    index("messages_received_at_idx").on(table.receivedAt),
    uniqueIndex("messages_external_id_idx")
      .on(table.externalId)
      .where(sql`external_id IS NOT NULL`),
  ]
);

export const rateLimitCounters = pgTable("rate_limit_counters", {
  bucketKey: text("bucket_key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true })
    .defaultNow()
    .notNull(),
  hitCount: integer("hit_count").notNull().default(0),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AuthToken = typeof authTokens.$inferSelect;
export type Inbox = typeof inboxes.$inferSelect;
export type NewInbox = typeof inboxes.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
