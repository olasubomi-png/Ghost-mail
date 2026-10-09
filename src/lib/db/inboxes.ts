import { eq, and, isNull, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "./index";
import { inboxes, messages, type Inbox, type Message } from "./schema";
import { generateRandomLocalPart } from "@/lib/utils";
import { getEmailDomain } from "@/lib/constants";
import { localPartSchema } from "@/lib/validation";

export class InboxError extends Error {
  constructor(
    message: string,
    public code: "DOMAIN_NOT_CONFIGURED" | "USERNAME_TAKEN" | "INVALID_USERNAME" | "NOT_FOUND" | "RATE_LIMITED"
  ) {
    super(message);
    this.name = "InboxError";
  }
}

export async function createInbox(opts: {
  localPart?: string;
}): Promise<Inbox> {
  const domain = getEmailDomain();
  if (!domain) {
    throw new InboxError(
      "Email domain is not configured. Set EMAIL_DOMAIN in environment variables.",
      "DOMAIN_NOT_CONFIGURED"
    );
  }

  let local: string;
  if (opts.localPart) {
    const parsed = localPartSchema.safeParse(opts.localPart);
    if (!parsed.success) {
      throw new InboxError(
        parsed.error.errors[0]?.message || "Invalid username",
        "INVALID_USERNAME"
      );
    }
    local = parsed.data;
  } else {
    local = generateRandomLocalPart();
  }

  const address = `${local}@${domain}`;
  const accessToken = nanoid(32);

  const db = getDb();

  // Check for existing active inbox with same address
  const existing = await db
    .select({ id: inboxes.id })
    .from(inboxes)
    .where(and(eq(inboxes.address, address), isNull(inboxes.deletedAt)))
    .limit(1);

  if (existing.length > 0) {
    throw new InboxError(
      "That username is already taken. Please choose another.",
      "USERNAME_TAKEN"
    );
  }

  const [row] = await db
    .insert(inboxes)
    .values({
      localPart: local,
      address,
      accessToken,
    })
    .returning();

  return row;
}

export async function getInboxByToken(token: string): Promise<Inbox | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(inboxes)
    .where(and(eq(inboxes.accessToken, token), isNull(inboxes.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function getInboxByAddress(address: string): Promise<Inbox | null> {
  const db = getDb();
  const normalized = address.toLowerCase().trim();
  const [row] = await db
    .select()
    .from(inboxes)
    .where(and(eq(inboxes.address, normalized), isNull(inboxes.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function softDeleteInbox(token: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .update(inboxes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(inboxes.accessToken, token), isNull(inboxes.deletedAt)))
    .returning({ id: inboxes.id });
  return result.length > 0;
}

export async function listMessages(
  inboxId: string,
  opts: { limit?: number } = {}
): Promise<Message[]> {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.inboxId, inboxId), isNull(messages.deletedAt)))
    .orderBy(desc(messages.receivedAt))
    .limit(opts.limit ?? 100);
}

export async function getMessage(
  inboxId: string,
  messageId: string
): Promise<Message | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.inboxId, inboxId),
        isNull(messages.deletedAt)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function markMessageRead(
  inboxId: string,
  messageId: string
): Promise<void> {
  const db = getDb();
  await db
    .update(messages)
    .set({ isRead: true })
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.inboxId, inboxId),
        isNull(messages.deletedAt)
      )
    );
}

export async function softDeleteMessage(
  inboxId: string,
  messageId: string
): Promise<boolean> {
  const db = getDb();
  const result = await db
    .update(messages)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.inboxId, inboxId),
        isNull(messages.deletedAt)
      )
    )
    .returning({ id: messages.id });
  return result.length > 0;
}

export async function insertMessage(data: {
  inboxId: string;
  externalId?: string | null;
  fromAddress: string;
  fromName?: string | null;
  subject: string;
  textBody?: string | null;
  htmlBody?: string | null;
  receivedAt?: Date;
}): Promise<Message | null> {
  const db = getDb();

  // Idempotency: skip if externalId already exists
  if (data.externalId) {
    const existing = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.externalId, data.externalId))
      .limit(1);
    if (existing.length > 0) return null;
  }

  const [row] = await db
    .insert(messages)
    .values({
      inboxId: data.inboxId,
      externalId: data.externalId ?? null,
      fromAddress: data.fromAddress,
      fromName: data.fromName ?? null,
      subject: data.subject,
      textBody: data.textBody ?? null,
      htmlBody: data.htmlBody ?? null,
      receivedAt: data.receivedAt ?? new Date(),
    })
    .returning();

  // Touch inbox updatedAt
  await db
    .update(inboxes)
    .set({ updatedAt: new Date() })
    .where(eq(inboxes.id, data.inboxId));

  return row;
}
