import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";
import { hashPassword, verifyPassword, validatePasswordStrength } from "./password";
import { issueAuthToken } from "./tokens";
import {
  AUTH_TOKEN_EMAIL_VERIFY,
  AUTH_TOKEN_PASSWORD_RESET,
} from "./constants";

export class UserError extends Error {
  constructor(
    message: string,
    public code:
      | "EMAIL_TAKEN"
      | "INVALID_CREDENTIALS"
      | "WEAK_PASSWORD"
      | "NOT_FOUND"
      | "INVALID_TOKEN"
  ) {
    super(message);
    this.name = "UserError";
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; cause?: { code?: string } };
  return (
    e.code === "23505" ||
    e.cause?.code === "23505" ||
    (typeof e.message === "string" &&
      (e.message.includes("unique") || e.message.includes("duplicate")))
  );
}

export async function registerUser(
  email: string,
  password: string
): Promise<{ user: User; verifyToken: string }> {
  const strength = validatePasswordStrength(password);
  if (strength) throw new UserError(strength, "WEAK_PASSWORD");

  const passwordHash = await hashPassword(password);
  const db = getDb();

  try {
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase().trim(),
        passwordHash,
      })
      .returning();

    const verifyToken = await issueAuthToken(user.id, AUTH_TOKEN_EMAIL_VERIFY);
    return { user, verifyToken };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new UserError(
        "An account with this email already exists",
        "EMAIL_TAKEN"
      );
    }
    throw err;
  }
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<User> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(eq(users.email, email.toLowerCase().trim()), isNull(users.deletedAt))
    )
    .limit(1);

  // Constant-ish path: still hash compare timing is dominated by bcrypt
  if (!user) {
    await hashPassword(password);
    throw new UserError("Invalid email or password", "INVALID_CREDENTIALS");
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new UserError("Invalid email or password", "INVALID_CREDENTIALS");
  }
  return user;
}

export async function markEmailVerified(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function setUserPassword(
  userId: string,
  password: string
): Promise<void> {
  const strength = validatePasswordStrength(password);
  if (strength) throw new UserError(strength, "WEAK_PASSWORD");
  const passwordHash = await hashPassword(password);
  const db = getDb();
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(eq(users.email, email.toLowerCase().trim()), isNull(users.deletedAt))
    )
    .limit(1);
  return user ?? null;
}

export async function softDeleteUser(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      email: `deleted+${userId}@invalid.local`,
      passwordHash: "!",
    })
    .where(eq(users.id, userId));
}

export async function createPasswordResetToken(
  email: string
): Promise<string | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  return issueAuthToken(user.id, AUTH_TOKEN_PASSWORD_RESET);
}
