import { NextRequest, NextResponse } from "next/server";
import { forgotPasswordSchema } from "@/lib/auth/validation";
import { createPasswordResetToken } from "@/lib/auth/users";
import { sendPasswordResetEmail } from "@/lib/auth/mail";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Always returns a generic success message to avoid account enumeration.
 */
export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { success } = await rateLimit(`auth:forgot:${ip}`, 5);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: true,
          message:
            "If an account exists for that email, a reset link has been sent.",
        },
        { status: 200 }
      );
    }

    const token = await createPasswordResetToken(parsed.data.email);
    if (token) {
      await sendPasswordResetEmail(parsed.data.email, token);
    }

    return NextResponse.json({
      ok: true,
      message:
        "If an account exists for that email, a reset link has been sent.",
    });
  } catch (err) {
    console.error(
      "[auth/forgot-password]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json({
      ok: true,
      message:
        "If an account exists for that email, a reset link has been sent.",
    });
  }
}
