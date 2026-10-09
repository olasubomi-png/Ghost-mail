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
 * Per-key rate-limit counter (fixed window).
 * Primary key on bucket_key enables row-level lock serialization via
 * INSERT … ON CONFLICT DO UPDATE. Apply with `npm run db:push`.
 */
export const rateLimitCounters = pgTable("rate_limit_counters", {
  bucketKey: text("bucket_key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true })
    .defaultNow()
    .notNull(),
  hitCount: integer("hit_count").notNull().default(0),
});

export type Inbox = typeof inboxes.$inferSelect;
export type NewInbox = typeof inboxes.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
