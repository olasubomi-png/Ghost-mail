import { NextRequest, NextResponse } from "next/server";
import {
  getConfiguredProvider,
  verifyWebhookSignatureDetailed,
  describeWebhookAuthContext,
  normalizeInboundPayload,
  fetchResendEmailContent,
  parseFormBody,
  collectResendRecipients,
  extractEmailAddresses,
} from "@/lib/email/provider";
import { sanitizeHtml, normalizeTextBody } from "@/lib/email/sanitize";
import {
  resolveInboxByRecipients,
  insertMessage,
} from "@/lib/db/inboxes";

export const runtime = "nodejs";

/**
 * Inbound email webhook.
 * POST /api/webhook/inbound
 */
export async function POST(req: NextRequest) {
  const started = Date.now();
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

    const authContext = describeWebhookAuthContext(provider, req.headers);
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

    // Acknowledge non-inbound events without treating them as failures
    const eventType =
      body && typeof body === "object"
        ? String((body as Record<string, unknown>).type || "")
        : "";
    if (
      provider === "resend" &&
      eventType &&
      eventType !== "email.received" &&
      eventType !== "inbox.email.received"
    ) {
      console.info("[webhook/inbound] ignored event type", {
        provider,
        event_type: eventType,
        duration_ms: Date.now() - started,
      });
      return NextResponse.json({ ok: true, ignored: true, reason: "event_type" });
    }

    let normalized = normalizeInboundPayload(provider, body);
    if (!normalized) {
      console.warn("[webhook/inbound] payload normalization failed", {
        provider,
        event_type: eventType || "unknown",
        duration_ms: Date.now() - started,
      });
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
          console.warn("[webhook/inbound] content fetch retryable failure", {
            reason: full.reason,
            status: full.status,
            has_external_id: true,
          });
          return NextResponse.json(
            { error: "Provider temporarily unavailable" },
            { status: 503 }
          );
        }
        console.error("[webhook/inbound] Resend content fetch failed", {
          reason: full.reason,
          status: full.status,
        });
        return NextResponse.json(
          { ok: false, error: "Unable to retrieve email content" },
          { status: 422 }
        );
      }
      // Prefer recipients from full content when available
      const contentRecipients = extractEmailAddresses(full.to);
      normalized = {
        ...normalized,
        textBody: full.text ?? normalized.textBody,
        htmlBody: full.html ?? normalized.htmlBody,
        subject: full.subject ?? normalized.subject,
        from: full.from
          ? full.from.includes("<")
            ? full.from.replace(/^.*<([^>]+)>.*$/, "$1").trim()
            : full.from.trim()
          : normalized.from,
        to:
          contentRecipients[0] && contentRecipients[0].includes("@")
            ? contentRecipients[0]
            : normalized.to,
      };
    }

    // Resolve inbox: try every candidate recipient (to, received_for, cc)
    const recipientCandidates =
      provider === "resend"
        ? [
            ...collectResendRecipients(body),
            ...extractEmailAddresses(normalized.to),
          ]
        : extractEmailAddresses(normalized.to);

    const uniqueCandidates = [...new Set(recipientCandidates)];
    const resolved = await resolveInboxByRecipients(uniqueCandidates);

    if (!resolved) {
      // Unknown recipient – ack so provider does not retry forever
      console.info("[webhook/inbound] no matching inbox", {
        provider,
        event_type: eventType || "unknown",
        candidate_count: uniqueCandidates.length,
        // Log domains only (not full local-parts of strangers)
        candidate_domains: uniqueCandidates.map((a) => a.split("@")[1] || ""),
        has_external_id: Boolean(normalized.externalId),
        duration_ms: Date.now() - started,
      });
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "no_matching_inbox",
      });
    }

    const { inbox, matchedAddress } = resolved;

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

    if (!textBody && !htmlBody) {
      console.warn("[webhook/inbound] empty body after sanitize", {
        provider,
        has_external_id: Boolean(normalized.externalId),
        matched_local: matchedAddress.split("@")[0]?.slice(0, 4) + "…",
      });
    }

    const inserted = await insertMessage({
      inboxId: inbox.id,
      externalId: normalized.externalId,
      fromAddress: normalized.from,
      fromName: normalized.fromName,
      subject: normalized.subject,
      textBody,
      htmlBody,
      receivedAt: normalized.receivedAt,
    });

    console.info("[webhook/inbound] processed", {
      provider,
      event_type: eventType || "unknown",
      outcome: inserted ? "inserted" : "duplicate",
      has_text: Boolean(textBody),
      has_html: Boolean(htmlBody),
      matched_domain: matchedAddress.split("@")[1] || "",
      duration_ms: Date.now() - started,
    });

    return NextResponse.json({
      ok: true,
      inserted: Boolean(inserted),
      duplicate: !inserted,
    });
  } catch (err) {
    console.error(
      "[webhook/inbound]",
      err instanceof Error ? err.message : "unknown error"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
