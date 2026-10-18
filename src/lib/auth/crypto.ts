import { createHash, randomBytes } from "crypto";

/** Opaque high-entropy token for cookies and email links. */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 hex hash for storing tokens at rest. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
