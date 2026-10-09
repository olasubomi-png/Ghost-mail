import { NextRequest, NextResponse } from "next/server";
import {
  getConfiguredProvider,
  verifyWebhookSignature,
  normalizeInboundPayload,
  fetchResendEmailContent,
} from "@/lib/email/provider";
import { sanitizeHtml, normalizeTextBody } from "@/lib/email/sanitize";
import { getInboxByAddress, insertMessage } from "@/lib/db/inboxes";

export const runtime = "nodejs";

/**
 * Inbound email webhook.
 * POST /api/webhook/inbound
 *
 * Env (see .env.example):
 * - DATABASE_URL
 * - EMAIL_DOMAIN
 * - INBOUND_PROVIDER = mailgun | resend | generic
 * - INBOUND_WEBHOOK_SECRET
 * - RESEND_API_KEY (optional; used when Resend payload only has email id)
 */
export async function POST(req: NextRequest) {
  try {
    const provider = getConfiguredProvider();
    const rawBody = await req.text();

    let body: unknown;
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      }
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      body = Object.fromEntries(new URLSearchParams(rawBody).entries());
    } else {
      try {
        body = JSON.parse(rawBody);
      } catch {
        try {
          body = Object.fromEntries(new URLSearchParams(rawBody).entries());
        } catch {
          return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }
      }
    }

    if (!verifyWebhookSignature(provider, req.headers, rawBody, body)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let normalized = normalizeInboundPayload(provider, body);
    if (!normalized) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Resend may send event with only an email id — enrich if possible
    if (
      provider === "resend" &&
      normalized.externalId &&
      !normalized.textBody &&
      !normalized.htmlBody
    ) {
      const full = await fetchResendEmailContent(normalized.externalId);
      if (full) {
        normalized = {
          ...normalized,
          textBody: full.text ?? normalized.textBody,
          htmlBody: full.html ?? normalized.htmlBody,
          subject: full.subject ?? normalized.subject,
          from: full.from ?? normalized.from,
        };
      }
    }

    const inbox = await getInboxByAddress(normalized.to);
    if (!inbox) {
      // Acknowledge so providers do not retry forever for unknown recipients
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
    console.error(
      "[webhook/inbound]",
      err instanceof Error ? err.message : "unknown error"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
