import { NextRequest, NextResponse } from "next/server";
import {
  getConfiguredProvider,
  verifyWebhookSignature,
  normalizeInboundPayload,
} from "@/lib/email/provider";
import { sanitizeHtml, normalizeTextBody } from "@/lib/email/sanitize";
import { getInboxByAddress, insertMessage } from "@/lib/db/inboxes";

export const runtime = "nodejs";

/**
 * Inbound email webhook.
 * Configure your provider to POST to /api/webhook/inbound
 *
 * Required env:
 * - EMAIL_DOMAIN
 * - INBOUND_PROVIDER (mailgun | resend | generic)
 * - INBOUND_WEBHOOK_SECRET
 * - DATABASE_URL
 */
export async function POST(req: NextRequest) {
  try {
    const provider = getConfiguredProvider();
    const rawBody = await req.text();

    // Signature verification + basic replay protection (provider-specific)
    if (!verifyWebhookSignature(provider, req.headers, rawBody)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = JSON.parse(rawBody);
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawBody);
      body = Object.fromEntries(params.entries());
    } else {
      // Try JSON first
      try {
        body = JSON.parse(rawBody);
      } catch {
        const params = new URLSearchParams(rawBody);
        body = Object.fromEntries(params.entries());
      }
    }

    const normalized = normalizeInboundPayload(provider, body);
    if (!normalized) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Validate recipient exists and is active
    const inbox = await getInboxByAddress(normalized.to);
    if (!inbox) {
      // Soft 200 to avoid provider retries for unknown addresses
      return NextResponse.json({ ok: true, ignored: true });
    }

    const textBody = normalizeTextBody(normalized.textBody);
    const htmlBody = sanitizeHtml(normalized.htmlBody);

    await insertMessage({
      inboxId: inbox.id,
      externalId: normalized.externalId,
      fromAddress: normalized.from,
      fromName: normalized.fromName,
      subject: normalized.subject,
      textBody,
      htmlBody,
      receivedAt: normalized.receivedAt,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Never log full email bodies
    console.error(
      "[webhook/inbound]",
      err instanceof Error ? err.message : "unknown error"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
