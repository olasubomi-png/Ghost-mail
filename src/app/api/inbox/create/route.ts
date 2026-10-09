import { NextRequest, NextResponse } from "next/server";
import { createInbox, InboxError } from "@/lib/db/inboxes";
import { createInboxSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { isDomainConfigured } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const { success, remaining } = await rateLimit(`create:${ip}`);
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

    const inbox = await createInbox({ localPart: parsed.data.localPart });

    return NextResponse.json(
      {
        address: inbox.address,
        accessToken: inbox.accessToken,
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
