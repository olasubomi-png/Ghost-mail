import { createHmac, timingSafeEqual } from "crypto";
import type { InboundMessage } from "@/lib/validation";
import { inboundMessageSchema } from "@/lib/validation";

export type ProviderName = "mailgun" | "resend" | "generic";

/**
 * Verify webhook signature according to the configured provider.
 * Returns true if the request is authentic (or if no secret is configured – for local dev only).
 */
export function verifyWebhookSignature(
  provider: ProviderName,
  headers: Headers,
  rawBody: string
): boolean {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured – allow only in development
    if (process.env.NODE_ENV === "production") {
      console.warn("[webhook] INBOUND_WEBHOOK_SECRET not set in production – rejecting");
      return false;
    }
    return true;
  }

  switch (provider) {
    case "mailgun": {
      // Mailgun: signature = HMAC-SHA256(timestamp + token, apiKey)
      const timestamp = headers.get("x-mailgun-timestamp") || "";
      const token = headers.get("x-mailgun-token") || "";
      const signature = headers.get("x-mailgun-signature") || "";
      if (!timestamp || !token || !signature) return false;
      // Replay protection: reject timestamps older than 5 minutes
      const ts = Number(timestamp);
      if (Number.isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
      const encoded = createHmac("sha256", secret)
        .update(timestamp + token)
        .digest("hex");
      try {
        return timingSafeEqual(
          Buffer.from(encoded, "hex"),
          Buffer.from(signature, "hex")
        );
      } catch {
        return false;
      }
    }
    case "resend": {
      // Resend uses svix-style headers (or custom). Adapt as needed.
      const signature = headers.get("svix-signature") || headers.get("resend-signature") || "";
      if (!signature) return false;
      // Simplified: HMAC of body
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      const provided = signature.replace(/^v1,/, "").trim();
      try {
        return timingSafeEqual(
          Buffer.from(expected),
          Buffer.from(provided)
        );
      } catch {
        return false;
      }
    }
    case "generic":
    default: {
      // Generic: X-Webhook-Signature: sha256=<hex>
      const header = headers.get("x-webhook-signature") || "";
      const match = header.match(/^sha256=(.+)$/i);
      if (!match) return false;
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      try {
        return timingSafeEqual(
          Buffer.from(expected),
          Buffer.from(match[1])
        );
      } catch {
        return false;
      }
    }
  }
}

/**
 * Normalize a raw provider payload into a validated InboundMessage.
 * Returns null if the payload cannot be understood.
 */
export function normalizeInboundPayload(
  provider: ProviderName,
  body: unknown
): InboundMessage | null {
  try {
    let candidate: Record<string, unknown> = {};

    if (provider === "mailgun" && typeof body === "object" && body !== null) {
      const b = body as Record<string, unknown>;
      // Mailgun form-encoded or JSON
      candidate = {
        externalId: b["Message-Id"] || b["message-id"] || b.id,
        to: Array.isArray(b.To) ? (b.To as string[])[0] : b.recipient || b.To,
        from: b.sender || b.From || b.from,
        fromName: b["from"] ? String(b.from).replace(/<.*>/, "").trim() : undefined,
        subject: b.subject || b.Subject || "(no subject)",
        textBody: b["body-plain"] || b.text || b["stripped-text"],
        htmlBody: b["body-html"] || b.html || b["stripped-html"],
        receivedAt: b.timestamp ? new Date(Number(b.timestamp) * 1000) : undefined,
      };
    } else if (provider === "resend" && typeof body === "object" && body !== null) {
      const b = body as Record<string, unknown>;
      const data = (b.data as Record<string, unknown>) || b;
      candidate = {
        externalId: data.email_id || data.id,
        to: Array.isArray(data.to) ? (data.to as string[])[0] : data.to,
        from: data.from,
        subject: data.subject || "(no subject)",
        textBody: data.text,
        htmlBody: data.html,
      };
    } else if (typeof body === "object" && body !== null) {
      // Generic JSON shape
      const b = body as Record<string, unknown>;
      candidate = {
        externalId: b.externalId || b.id || b.messageId,
        to: b.to || b.recipient,
        from: b.from || b.sender,
        fromName: b.fromName,
        subject: b.subject || "(no subject)",
        textBody: b.textBody || b.text,
        htmlBody: b.htmlBody || b.html,
        receivedAt: b.receivedAt,
      };
    }

    // Coerce string values
    const parsed = inboundMessageSchema.safeParse({
      externalId: candidate.externalId ? String(candidate.externalId) : undefined,
      to: String(candidate.to || "").toLowerCase().trim(),
      from: String(candidate.from || "").trim(),
      fromName: candidate.fromName ? String(candidate.fromName) : undefined,
      subject: String(candidate.subject || "(no subject)"),
      textBody: candidate.textBody ? String(candidate.textBody) : undefined,
      htmlBody: candidate.htmlBody ? String(candidate.htmlBody) : undefined,
      receivedAt: candidate.receivedAt,
    });

    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function getConfiguredProvider(): ProviderName {
  const p = (process.env.INBOUND_PROVIDER || "generic").toLowerCase();
  if (p === "mailgun" || p === "resend" || p === "generic") return p;
  return "generic";
}
