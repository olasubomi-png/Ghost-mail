import { NextRequest, NextResponse } from "next/server";
import {
  getConfiguredProvider,
  verifyWebhookSignatureDetailed,
  describeWebhookAuthContext,
  normalizeInboundPayload,
  fetchResendEmailContent,
  parseFormBody,
} from "@/lib/email/provider";
import { sanitizeHtml, normalizeTextBody } from "@/lib/email/sanitize";
import { getInboxByAddress, insertMessage } from "@/lib/db/inboxes";

export const runtime = "nodejs";

/**
 * Inbound email webhook.
 * POST /api/webhook/inbound
 *
 * Env: DATABASE_URL, EMAIL_DOMAIN, INBOUND_PROVIDER, INBOUND_WEBHOOK_SECRET,
 *      RESEND_API_KEY (required for Resend body retrieval)
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
      body = parseFormBody(rawBody);
    } else {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = parseFormBody(rawBody);
      }
    }

    // Safe auth diagnostics (no secrets, signatures, or email bodies)
    const authContext = describeWebhookAuthContext(provider, req.headers);

    // Timestamp age when present (replay diagnostics only)
    const tsHeader =
      req.headers.get("svix-timestamp") ||
      req.headers.get("webhook-timestamp") ||
      "";
    let timestampAgeSeconds: number | null = null;
    if (tsHeader) {
      const ts = Number(tsHeader);
      if (!Number.isNaN(ts)) {
        timestampAgeSeconds = Math.round(Math.abs(Date.now() / 1000 - ts));
      }
    }

    const verification = verifyWebhookSignatureDetailed(
      provider,
      req.headers,
      rawBody,
      body
    );

    if (!verification.ok) {
      console.warn("[webhook/inbound] signature verification failed", {
        ...authContext,
        failure_reason: verification.reason ?? "unknown",
        timestamp_age_seconds: timestampAgeSeconds,
        body_byte_length: Buffer.byteLength(rawBody, "utf8"),
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let normalized = normalizeInboundPayload(provider, body);
    if (!normalized) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Resend webhooks only include metadata — body must be fetched
    if (
      provider === "resend" &&
      normalized.externalId &&
      !normalized.textBody &&
      !normalized.htmlBody
    ) {
      const full = await fetchResendEmailContent(normalized.externalId);
      if (!full.ok) {
        if (full.retryable) {
          return NextResponse.json(
            { error: "Provider temporarily unavailable" },
            { status: 503 }
          );
        }
        console.error(
          "[webhook/inbound] Resend content fetch failed:",
          full.reason
        );
        return NextResponse.json(
          { ok: false, error: "Unable to retrieve email content" },
          { status: 422 }
        );
      }
      normalized = {
        ...normalized,
        textBody: full.text ?? normalized.textBody,
        htmlBody: full.html ?? normalized.htmlBody,
        subject: full.subject ?? normalized.subject,
        from: full.from ?? normalized.from,
        to: full.to && full.to.includes("@") ? full.to : normalized.to,
      };
    }

    const inbox = await getInboxByAddress(normalized.to);
    if (!inbox) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const textBody = normalizeTextBody(normalized.textBody);
    let htmlBody: string | null = null;
    try {
      htmlBody = sanitizeHtml(normalized.htmlBody);
    } catch (err) {
      console.error(
        "[webhook/inbound] HTML sanitization failed – saving text only",
        err instanceof Error ? err.message : "unknown"
      );
      htmlBody = null;
    }

    // insertMessage is idempotent on externalId; duplicates return null
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
