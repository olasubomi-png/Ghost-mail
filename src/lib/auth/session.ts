import { cookies } from "next/headers";
import { eq, and, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessions, users, type User } from "@/lib/db/schema";
import { generateOpaqueToken, hashToken } from "./crypto";
import { SESSION_COOKIE, SESSION_DAYS } from "./constants";

export type SessionUser = {
  id: string;
  email: string;
  emailVerified: boolean;
};

function sessionMaxAgeSeconds(): number {
  return SESSION_DAYS * 24 * 60 * 60;
}

export async function createSession(
  userId: string,
  meta?: { userAgent?: string | null; ip?: string | null }
): Promise<string> {
  const token = generateOpaqueToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds() * 1000);
  const db = getDb();
  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
    userAgent: meta?.userAgent ?? null,
    ip: meta?.ip ?? null,
  });
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAgeSeconds(),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function destroySession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function destroyAllUserSessions(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Resolve the current browser session to a user.
 * Returns null if missing, expired, or user soft-deleted.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length < 16) return null;

  const tokenHash = hashToken(token);
  const db = getDb();
  const now = new Date();

  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      deletedAt: users.deletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row || row.deletedAt) return null;

  return {
    id: row.userId,
    email: row.email,
    emailVerified: Boolean(row.emailVerifiedAt),
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("Unauthorized", 401);
  }
  return user;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number = 401
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function toPublicUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
  };
}
