import { NextRequest, NextResponse } from "next/server";
import {
  getInboxByToken,
  softDeleteInbox,
  listMessages,
} from "@/lib/db/inboxes";

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

    const msgs = await listMessages(inbox.id);

    return NextResponse.json({
      address: inbox.address,
      createdAt: inbox.createdAt,
      messages: msgs.map((m) => ({
        id: m.id,
        fromAddress: m.fromAddress,
        fromName: m.fromName,
        subject: m.subject,
        textBody: m.textBody,
        // Intentionally omit full htmlBody from list for size; fetch on demand
        preview: (m.textBody || m.subject || "").slice(0, 120),
        receivedAt: m.receivedAt,
        isRead: m.isRead,
      })),
    });
  } catch (err) {
    console.error("[api/inbox/token]", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    if (!token || token.length < 16) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const deleted = await softDeleteInbox(token);
    if (!deleted) {
      return NextResponse.json({ error: "Inbox not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/inbox/token DELETE]", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
