import { NextRequest, NextResponse } from "next/server";
import { createInbox, InboxError } from "@/lib/db/inboxes";
import { createInboxSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { isDomainConfigured } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Sign in required", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }
    if (!user.emailVerified) {
      return NextResponse.json(
        {
          error: "Verify your email before creating an inbox.",
          code: "EMAIL_NOT_VERIFIED",
        },
        { status: 403 }
      );
    }

    const { success, remaining } = await rateLimit(`create:user:${user.id}`);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a minute and try again." },
        { status: 429, headers: { "X-RateLimit-Remaining": "0" } }
      );
    }

    if (!isDomainConfigured()) {
      return NextResponse.json(
        {
          error:
            "Email domain is not configured. An administrator must set EMAIL_DOMAIN before addresses can receive mail.",
          code: "DOMAIN_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = createInboxSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const inbox = await createInbox({
      localPart: parsed.data.localPart,
      userId: user.id,
    });

    return NextResponse.json(
      {
        address: inbox.address,
        accessToken: inbox.accessToken,
        id: inbox.id,
        createdAt: inbox.createdAt,
      },
      {
        status: 201,
        headers: { "X-RateLimit-Remaining": String(remaining) },
      }
    );
  } catch (err) {
    if (err instanceof InboxError) {
      const status =
        err.code === "USERNAME_TAKEN"
          ? 409
          : err.code === "INVALID_USERNAME"
            ? 400
            : err.code === "DOMAIN_NOT_CONFIGURED"
              ? 503
              : 400;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status }
      );
    }
    console.error(
      "[api/inbox/create]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
