import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  try {
    const parts = passwordHash.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const [, salt, expectedB64] = parts;
    const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
    const expected = Buffer.from(expectedB64, "base64url");
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 128) return "Password must be at most 128 characters";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one letter and one number";
  }
  return null;
}
