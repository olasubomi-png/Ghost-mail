import { NextRequest, NextResponse } from "next/server";
import {
  getInboxByToken,
  softDeleteInbox,
  listMessages,
  canAccessInbox,
} from "@/lib/db/inboxes";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    if (!token || token.length < 16) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const inbox = await getInboxByToken(token);
    if (!inbox) {
      return NextResponse.json({ error: "Inbox not found" }, { status: 404 });
    }

    const user = await getCurrentUser();
    if (!canAccessInbox(inbox, { token, userId: user?.id ?? null })) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const msgs = await listMessages(inbox.id);

    return NextResponse.json({
      address: inbox.address,
      createdAt: inbox.createdAt,
      owned: Boolean(inbox.userId),
      messages: msgs.map((m) => ({
        id: m.id,
        fromAddress: m.fromAddress,
        fromName: m.fromName,
        subject: m.subject,
        textBody: m.textBody,
        preview: (m.textBody || m.subject || "").slice(0, 120),
        receivedAt: m.receivedAt,
        isRead: m.isRead,
      })),
    });
  } catch (err) {
    console.error(
      "[api/inbox/token]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    if (!token || token.length < 16) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const inbox = await getInboxByToken(token);
    if (!inbox) {
      return NextResponse.json({ error: "Inbox not found" }, { status: 404 });
    }

    const user = await getCurrentUser();
    if (!canAccessInbox(inbox, { token, userId: user?.id ?? null })) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deleted = await softDeleteInbox(token, { userId: user?.id ?? null });
    if (!deleted) {
      return NextResponse.json({ error: "Inbox not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(
      "[api/inbox/token DELETE]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
