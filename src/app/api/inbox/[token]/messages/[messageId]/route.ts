import { NextRequest, NextResponse } from "next/server";
import {
  getInboxByToken,
  getMessage,
  markMessageRead,
  softDeleteMessage,
} from "@/lib/db/inboxes";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string; messageId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { token, messageId } = await params;
    if (!token || token.length < 16 || !messageId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const inbox = await getInboxByToken(token);
    if (!inbox) {
      return NextResponse.json({ error: "Inbox not found" }, { status: 404 });
    }

    const message = await getMessage(inbox.id, messageId);
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Mark as read on view
    if (!message.isRead) {
      await markMessageRead(inbox.id, messageId);
    }

    return NextResponse.json({
      id: message.id,
      fromAddress: message.fromAddress,
      fromName: message.fromName,
      subject: message.subject,
      textBody: message.textBody,
      htmlBody: message.htmlBody,
      receivedAt: message.receivedAt,
      isRead: true,
    });
  } catch (err) {
    console.error("[api/message GET]", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { token, messageId } = await params;
    if (!token || token.length < 16 || !messageId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const inbox = await getInboxByToken(token);
    if (!inbox) {
      return NextResponse.json({ error: "Inbox not found" }, { status: 404 });
    }

    const deleted = await softDeleteMessage(inbox.id, messageId);
    if (!deleted) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/message DELETE]", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
