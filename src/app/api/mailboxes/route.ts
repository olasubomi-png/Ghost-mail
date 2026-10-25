import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createInbox, listInboxesByUser, InboxError } from "@/lib/db/inboxes";
import { createInboxSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { isDomainConfigured } from "@/lib/constants";

export const runtime = "nodejs";

/** List mailboxes owned by the signed-in user. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rows = await listInboxesByUser(user.id);
    return NextResponse.json({
      mailboxes: rows.map((r) => ({
        id: r.id,
        address: r.address,
        createdAt: r.createdAt,
        // accessToken intentionally omitted from list API
      })),
    });
  } catch (err) {
    console.error(
      "[mailboxes GET]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Create a permanent mailbox owned by the signed-in user. */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        { status: 429 }
      );
    }

    if (!isDomainConfigured()) {
      return NextResponse.json(
        {
          error:
            "Email domain is not configured. An administrator must set EMAIL_DOMAIN.",
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
        id: inbox.id,
        address: inbox.address,
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
      "[mailboxes POST]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
