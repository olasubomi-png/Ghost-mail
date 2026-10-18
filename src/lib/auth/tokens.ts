import { eq, and, isNull, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { authTokens } from "@/lib/db/schema";
import { generateOpaqueToken, hashToken } from "./crypto";
import {
  AUTH_TOKEN_EMAIL_VERIFY,
  AUTH_TOKEN_PASSWORD_RESET,
  EMAIL_VERIFY_HOURS,
  PASSWORD_RESET_HOURS,
} from "./constants";

export async function issueAuthToken(
  userId: string,
  type: typeof AUTH_TOKEN_EMAIL_VERIFY | typeof AUTH_TOKEN_PASSWORD_RESET
): Promise<string> {
  const raw = generateOpaqueToken(32);
  const tokenHash = hashToken(raw);
  const hours =
    type === AUTH_TOKEN_PASSWORD_RESET
      ? PASSWORD_RESET_HOURS
      : EMAIL_VERIFY_HOURS;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  const db = getDb();
  await db.insert(authTokens).values({
    userId,
    type,
    tokenHash,
    expiresAt,
  });
  return raw;
}

export async function consumeAuthToken(
  rawToken: string,
  type: typeof AUTH_TOKEN_EMAIL_VERIFY | typeof AUTH_TOKEN_PASSWORD_RESET
): Promise<{ userId: string } | null> {
  if (!rawToken || rawToken.length < 16) return null;
  const tokenHash = hashToken(rawToken);
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        eq(authTokens.type, type),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, now)
      )
    )
    .limit(1);

  if (!row) return null;

  await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(eq(authTokens.id, row.id));

  return { userId: row.userId };
}
