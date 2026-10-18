import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/auth/validation";
import { authenticateUser, UserError } from "@/lib/auth/users";
import {
  createSession,
  setSessionCookie,
  toPublicUser,
} from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const { success } = await rateLimit(`auth:login:${ip}`, 10);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 400 }
      );
    }

    const user = await authenticateUser(parsed.data.email, parsed.data.password);
    const sessionToken = await createSession(user.id, {
      userAgent: req.headers.get("user-agent"),
      ip,
    });
    await setSessionCookie(sessionToken);

    return NextResponse.json({ user: toPublicUser(user) });
  } catch (err) {
    if (err instanceof UserError) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }
    console.error(
      "[auth/login]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
