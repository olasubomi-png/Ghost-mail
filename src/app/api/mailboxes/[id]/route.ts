import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { inboxes } from "@/lib/db/schema";
import { listMessages } from "@/lib/db/inboxes";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Open an owned mailbox by id (session required).
 * Returns address + messages + accessToken only to the owner for inbox UI routing.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const db = getDb();
    const [inbox] = await db
      .select()
      .from(inboxes)
      .where(
        and(
          eq(inboxes.id, id),
          eq(inboxes.userId, user.id),
          isNull(inboxes.deletedAt)
        )
      )
      .limit(1);

    if (!inbox) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    const msgs = await listMessages(inbox.id);

    return NextResponse.json({
      id: inbox.id,
      address: inbox.address,
      accessToken: inbox.accessToken,
      createdAt: inbox.createdAt,
      owned: true,
      messages: msgs.map((m) => ({
        id: m.id,
        fromAddress: m.fromAddress,
        fromName: m.fromName,
        subject: m.subject,
        preview: (m.textBody || m.subject || "").slice(0, 120),
        receivedAt: m.receivedAt,
        isRead: m.isRead,
      })),
    });
  } catch (err) {
    console.error(
      "[mailboxes/id GET]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
