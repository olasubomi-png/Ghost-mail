import { NextRequest, NextResponse } from "next/server";
import { verifyEmailSchema } from "@/lib/auth/validation";
import { consumeAuthToken } from "@/lib/auth/tokens";
import { AUTH_TOKEN_EMAIL_VERIFY } from "@/lib/auth/constants";
import { markEmailVerified } from "@/lib/auth/users";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { success } = await rateLimit(`auth:verify:${ip}`, 20);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = verifyEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }

    const result = await consumeAuthToken(
      parsed.data.token,
      AUTH_TOKEN_EMAIL_VERIFY
    );
    if (!result) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }

    await markEmailVerified(result.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      "[auth/verify-email]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
