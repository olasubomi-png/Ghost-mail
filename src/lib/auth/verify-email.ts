import { consumeAuthToken } from "@/lib/auth/tokens";
import { AUTH_TOKEN_EMAIL_VERIFY } from "@/lib/auth/constants";
import { markEmailVerified } from "@/lib/auth/users";

export type VerifyEmailResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "error" };

/**
 * Consume a one-time email-verification token and mark the user verified.
 * Safe to call from Server Components or route handlers.
 */
export async function verifyEmailToken(
  token: string | null | undefined
): Promise<VerifyEmailResult> {
  if (!token || token.length < 16) {
    return { ok: false, reason: "missing" };
  }
  try {
    const result = await consumeAuthToken(token, AUTH_TOKEN_EMAIL_VERIFY);
    if (!result) {
      return { ok: false, reason: "invalid" };
    }
    await markEmailVerified(result.userId);
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}
