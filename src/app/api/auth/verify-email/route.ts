import { NextRequest, NextResponse } from "next/server";
import { verifyEmailSchema } from "@/lib/auth/validation";
import { verifyEmailToken } from "@/lib/auth/verify-email";
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
      return NextResponse.json(
        { error: "Invalid or expired link" },
        { status: 400 }
      );
    }

    const result = await verifyEmailToken(parsed.data.token);
    if (!result.ok) {
      return NextResponse.json(
        { error: "Invalid or expired link" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      "[auth/verify-email]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
