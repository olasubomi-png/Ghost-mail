import { createHmac, timingSafeEqual } from "crypto";
import type { InboundMessage } from "@/lib/validation";
import { inboundMessageSchema } from "@/lib/validation";

export type ProviderName = "mailgun" | "resend" | "generic";

const REPLAY_WINDOW_SECONDS = 300; // 5 minutes

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function safeEqualUtf8(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Verify Mailgun signature.
 * Algorithm: HMAC-SHA256(timestamp + token, signingKey) === signature (hex)
 * https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks
 */
export function verifyMailgunSignature(
  signingKey: string,
  timestamp: string,
  token: string,
  signature: string
): boolean {
  if (!timestamp || !token || !signature || !signingKey) return false;

  const ts = Number(timestamp);
  if (Number.isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > REPLAY_WINDOW_SECONDS) {
    return false;
  }

  const expected = createHmac("sha256", signingKey)
    .update(timestamp + token)
    .digest("hex");

  return safeEqualHex(expected, signature);
}

/**
 * Verify Resend / Svix webhook signature.
 * https://docs.svix.com/receiving/verifying-payloads/how-manual
 * https://resend.com/docs/webhooks/verify-webhooks-requests
 */
export function verifyResendSignature(
  webhookSecret: string,
  headers: Headers,
  rawBody: string
): boolean {
  const svixId = headers.get("svix-id") || headers.get("webhook-id") || "";
  const svixTimestamp =
    headers.get("svix-timestamp") || headers.get("webhook-timestamp") || "";
  const svixSignature =
    headers.get("svix-signature") || headers.get("webhook-signature") || "";

  if (!svixId || !svixTimestamp || !svixSignature || !webhookSecret) {
    return false;
  }

  const ts = Number(svixTimestamp);
  if (Number.isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > REPLAY_WINDOW_SECONDS) {
    return false;
  }

  let secretBytes: Buffer;
  try {
    if (webhookSecret.startsWith("whsec_")) {
      secretBytes = Buffer.from(webhookSecret.slice("whsec_".length), "base64");
    } else {
      secretBytes = Buffer.from(webhookSecret, "base64");
    }
  } catch {
    return false;
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  const candidates = svixSignature.split(" ").map((s) => s.trim()).filter(Boolean);
  for (const candidate of candidates) {
    const parts = candidate.split(",");
    const version = parts[0];
    const sig = parts.slice(1).join(",");
    if (version !== "v1" || !sig) continue;
    if (safeEqualUtf8(expected, sig)) {
      return true;
    }
  }
  return false;
}

/**
 * Generic HMAC-SHA256 of raw body. Header: X-Webhook-Signature: sha256=<hex>
 */
export function verifyGenericSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string
): boolean {
  const match = signatureHeader.match(/^sha256=(.+)$/i);
  if (!match) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, match[1]);
}

export function extractMailgunAuth(
  headers: Headers,
  body: unknown
): { timestamp: string; token: string; signature: string } | null {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const sigObj = b.signature;
    if (sigObj && typeof sigObj === "object") {
      const s = sigObj as Record<string, unknown>;
      const timestamp = String(s.timestamp ?? "");
      const token = String(s.token ?? "");
      const signature = String(s.signature ?? "");
      if (timestamp && token && signature) {
        return { timestamp, token, signature };
      }
    }
    if (b.timestamp && b.token && b.signature) {
      return {
        timestamp: String(b.timestamp),
        token: String(b.token),
        signature: String(b.signature),
      };
    }
  }

  const timestamp = headers.get("x-mailgun-timestamp") || "";
  const signature = headers.get("x-mailgun-signature") || "";
  const token = headers.get("x-mailgun-token") || "";
  if (timestamp && token && signature) {
    return { timestamp, token, signature };
  }
  return null;
}

export function verifyWebhookSignature(
  provider: ProviderName,
  headers: Headers,
  rawBody: string,
  parsedBody?: unknown
): boolean {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[webhook] INBOUND_WEBHOOK_SECRET not set in production – rejecting");
      return false;
    }
    return true;
  }

  switch (provider) {
    case "mailgun": {
      let body: unknown = parsedBody;
      if (body === undefined) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          try {
            body = Object.fromEntries(new URLSearchParams(rawBody).entries());
          } catch {
            body = undefined;
          }
        }
      }
      const auth = extractMailgunAuth(headers, body);
      if (!auth) return false;
      return verifyMailgunSignature(
        secret,
        auth.timestamp,
        auth.token,
        auth.signature
      );
    }
    case "resend":
      return verifyResendSignature(secret, headers, rawBody);
    case "generic":
    default: {
      const header = headers.get("x-webhook-signature") || "";
      return verifyGenericSignature(secret, rawBody, header);
    }
  }
}

export function normalizeInboundPayload(
  provider: ProviderName,
  body: unknown
): InboundMessage | null {
  try {
    let candidate: Record<string, unknown> = {};

    if (provider === "mailgun" && typeof body === "object" && body !== null) {
      const b = body as Record<string, unknown>;
      const toRaw =
        b.recipient ||
        b.To ||
        b.to ||
        (Array.isArray(b.To) ? (b.To as string[])[0] : undefined);
      const fromRaw = b.sender || b.From || b.from || "";
      const fromStr = String(fromRaw);
      const nameMatch = fromStr.match(/^"?([^"<]+)"?\s*</);
      candidate = {
        externalId:
          b["Message-Id"] ||
          b["message-id"] ||
          b["Message-ID"] ||
          b.id ||
          undefined,
        to: toRaw,
        from: fromStr.includes("<")
          ? fromStr.replace(/^.*<([^>]+)>.*$/, "$1").trim()
          : fromStr.trim(),
        fromName: nameMatch ? nameMatch[1].trim() : undefined,
        subject: b.subject || b.Subject || "(no subject)",
        textBody: b["body-plain"] || b["stripped-text"] || b.text || undefined,
        htmlBody: b["body-html"] || b["stripped-html"] || b.html || undefined,
        receivedAt: b.timestamp
          ? new Date(Number(b.timestamp) * 1000)
          : undefined,
      };
    } else if (provider === "resend" && typeof body === "object" && body !== null) {
      const b = body as Record<string, unknown>;
      const data = (b.data as Record<string, unknown>) || b;
      const toField = data.to;
      const toAddr = Array.isArray(toField)
        ? String((toField as string[])[0] || "")
        : String(toField || "");
      candidate = {
        externalId: data.email_id || data.id || b.id,
        to: toAddr,
        from: data.from,
        subject: data.subject || "(no subject)",
        textBody: data.text,
        htmlBody: data.html,
        receivedAt: data.created_at ? new Date(String(data.created_at)) : undefined,
      };
    } else if (typeof body === "object" && body !== null) {
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

    const parsed = inboundMessageSchema.safeParse({
      externalId: candidate.externalId
        ? String(candidate.externalId)
        : undefined,
      to: String(candidate.to || "")
        .toLowerCase()
        .trim()
        .replace(/^.*<([^>]+)>.*$/, "$1"),
      from: String(candidate.from || "").trim(),
      fromName: candidate.fromName ? String(candidate.fromName) : undefined,
      subject: String(candidate.subject || "(no subject)"),
      textBody: candidate.textBody ? String(candidate.textBody) : undefined,
      htmlBody: candidate.htmlBody ? String(candidate.htmlBody) : undefined,
      receivedAt: candidate.receivedAt,
    });

    if (!parsed.success) return null;
    if (!parsed.data.to || !parsed.data.to.includes("@")) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Optionally fetch full message from Resend when webhook only has an ID.
 * Requires RESEND_API_KEY. Never logs the key or full response.
 */
export async function fetchResendEmailContent(
  emailId: string
): Promise<{ text?: string; html?: string; subject?: string; from?: string } | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !emailId) return null;

  try {
    const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return {
      text: data.text ? String(data.text) : undefined,
      html: data.html ? String(data.html) : undefined,
      subject: data.subject ? String(data.subject) : undefined,
      from: data.from ? String(data.from) : undefined,
    };
  } catch {
    return null;
  }
}

export function getConfiguredProvider(): ProviderName {
  const p = (process.env.INBOUND_PROVIDER || "generic").toLowerCase();
  if (p === "mailgun" || p === "resend" || p === "generic") return p;
  return "generic";
}
