import { NextRequest, NextResponse } from "next/server";
import { registerSchema } from "@/lib/auth/validation";
import { validatePasswordStrength } from "@/lib/auth/password";
import { registerUser, UserError } from "@/lib/auth/users";
import {
  createSession,
  setSessionCookie,
  toPublicUser,
} from "@/lib/auth/session";
import { sendVerificationEmail } from "@/lib/auth/mail";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const { success } = await rateLimit(`auth:register:${ip}`, 5);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const strength = validatePasswordStrength(parsed.data.password);
    if (strength) {
      return NextResponse.json({ error: strength }, { status: 400 });
    }

    const { user, verifyToken } = await registerUser(
      parsed.data.email,
      parsed.data.password
    );

    const mail = await sendVerificationEmail(user.email, verifyToken);
    const sessionToken = await createSession(user.id, {
      userAgent: req.headers.get("user-agent"),
      ip,
    });
    await setSessionCookie(sessionToken);

    return NextResponse.json(
      {
        user: toPublicUser(user),
        verificationEmailSent: mail.sent,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof UserError) {
      const status = err.code === "EMAIL_TAKEN" ? 409 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error(
      "[auth/register]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
