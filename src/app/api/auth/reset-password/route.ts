import { NextRequest, NextResponse } from "next/server";
import { resetPasswordSchema } from "@/lib/auth/validation";
import { validatePasswordStrength } from "@/lib/auth/password";
import { consumeAuthToken } from "@/lib/auth/tokens";
import { AUTH_TOKEN_PASSWORD_RESET } from "@/lib/auth/constants";
import { setUserPassword, UserError } from "@/lib/auth/users";
import { destroyAllUserSessions } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { success } = await rateLimit(`auth:reset:${ip}`, 10);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }

    const strength = validatePasswordStrength(parsed.data.password);
    if (strength) {
      return NextResponse.json({ error: strength }, { status: 400 });
    }

    const result = await consumeAuthToken(
      parsed.data.token,
      AUTH_TOKEN_PASSWORD_RESET
    );
    if (!result) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }

    await setUserPassword(result.userId, parsed.data.password);
    await destroyAllUserSessions(result.userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UserError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(
      "[auth/reset-password]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
