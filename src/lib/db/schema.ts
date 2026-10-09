import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  bigserial,
} from "drizzle-orm/pg-core";

/**
 * Inboxes are persistent until explicitly deleted by the user.
 * Access is controlled by a high-entropy token (not the email address itself).
 */
export const inboxes = pgTable(
  "inboxes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    localPart: text("local_part").notNull(),
    address: text("address").notNull(),
    accessToken: text("access_token").notNull(),
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
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inboxId: uuid("inbox_id")
      .notNull()
      .references(() => inboxes.id, { onDelete: "cascade" }),
    /** Provider message id for idempotency */
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

/**
 * Rate-limit hit log. Managed via schema / db:push.
 * Application logic uses advisory locks for atomic check+insert.
 */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    bucketKey: text("bucket_key").notNull(),
    hitAt: timestamp("hit_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("rate_limit_buckets_key_hit_idx").on(table.bucketKey, table.hitAt)]
);

export type Inbox = typeof inboxes.$inferSelect;
export type NewInbox = typeof inboxes.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
