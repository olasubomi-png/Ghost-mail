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
 * Parse application/x-www-form-urlencoded bodies including bracket keys
 * like signature[timestamp], signature[token], signature[signature].
 */
export function parseFormBody(rawBody: string): Record<string, unknown> {
  const params = new URLSearchParams(rawBody);
  const result: Record<string, unknown> = {};
  const nested: Record<string, Record<string, string>> = {};

  for (const [key, value] of params.entries()) {
    const match = key.match(/^([^[\]]+)\[([^[\]]+)\]$/);
    if (match) {
      const [, parent, child] = match;
      if (!nested[parent]) nested[parent] = {};
      nested[parent][child] = value;
    } else {
      result[key] = value;
    }
  }

  for (const [parent, children] of Object.entries(nested)) {
    result[parent] = children;
  }

  return result;
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
    .update(String(timestamp) + String(token))
    .digest("hex");

  return safeEqualHex(expected, signature);
}

/**
 * Verify Resend / Svix webhook signature.
 * https://docs.svix.com/receiving/verifying-payloads/how-manual
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

/**
 * Extract Mailgun timestamp/token/signature from headers and/or parsed body.
 * Supports:
 * - JSON event webhooks: body.signature.{timestamp,token,signature}
 * - Form posts: signature[timestamp], signature[token], signature[signature]
 * - Flat form: timestamp, token, signature
 * - Headers: X-Mailgun-Timestamp, X-Mailgun-Token, X-Mailgun-Signature
 */
export function extractMailgunAuth(
  headers: Headers,
  body: unknown
): { timestamp: string; token: string; signature: string } | null {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;

    // Nested signature object (JSON events or parsed bracket form)
    const sigObj = b.signature;
    if (sigObj && typeof sigObj === "object" && !Array.isArray(sigObj)) {
      const s = sigObj as Record<string, unknown>;
      const timestamp = String(s.timestamp ?? "");
      const token = String(s.token ?? "");
      const signature = String(s.signature ?? "");
      if (timestamp && token && signature) {
        return { timestamp, token, signature };
      }
    }

    // Flat form fields
    if (b.timestamp && b.token && b.signature && typeof b.signature === "string") {
      return {
        timestamp: String(b.timestamp),
        token: String(b.token),
        signature: String(b.signature),
      };
    }
  }

  // Headers (JSON route style)
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
      console.warn(
        "[webhook] INBOUND_WEBHOOK_SECRET not set in production – rejecting"
      );
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
          body = parseFormBody(rawBody);
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
      const toField = data.to ?? data.received_for;
      const toAddr = Array.isArray(toField)
        ? String((toField as string[])[0] || "")
        : String(toField || "");
      candidate = {
        // Prefer provider email_id for Receiving API; message_id is MIME Message-ID
        externalId: data.email_id || data.id || b.id,
        to: toAddr,
        from: data.from,
        subject: data.subject || "(no subject)",
        textBody: data.text,
        htmlBody: data.html,
        receivedAt: data.created_at
          ? new Date(String(data.created_at))
          : undefined,
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

export type ResendFetchResult =
  | {
      ok: true;
      text?: string;
      html?: string;
      subject?: string;
      from?: string;
      to?: string;
    }
  | { ok: false; status: number; retryable: boolean; reason: string };

/**
 * Fetch full received-email content from Resend Receiving API.
 * Endpoint: GET https://api.resend.com/emails/receiving/:email_id
 * Docs: https://resend.com/docs/api-reference/emails/retrieve-received-email
 *
 * Webhooks only include metadata — body must be fetched separately.
 */
export async function fetchResendEmailContent(
  emailId: string,
  fetchImpl: typeof fetch = fetch
): Promise<ResendFetchResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 0,
      retryable: false,
      reason: "RESEND_API_KEY not configured",
    };
  }
  if (!emailId) {
    return {
      ok: false,
      status: 0,
      retryable: false,
      reason: "missing email id",
    };
  }

  try {
    const res = await fetchImpl(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (res.status === 404) {
      return {
        ok: false,
        status: 404,
        retryable: false,
        reason: "email not found",
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: res.status,
        retryable: false,
        reason: "unauthorized",
      };
    }
    if (res.status === 429 || res.status >= 500) {
      return {
        ok: false,
        status: res.status,
        retryable: true,
        reason: "provider unavailable",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        retryable: res.status >= 500,
        reason: "provider error",
      };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const toField = data.to;
    const toAddr = Array.isArray(toField)
      ? String((toField as string[])[0] || "")
      : String(toField || "");

    return {
      ok: true,
      text: data.text != null ? String(data.text) : undefined,
      html: data.html != null ? String(data.html) : undefined,
      subject: data.subject != null ? String(data.subject) : undefined,
      from: data.from != null ? String(data.from) : undefined,
      to: toAddr || undefined,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      retryable: true,
      reason: "network error",
    };
  }
}

export function getConfiguredProvider(): ProviderName {
  const p = (process.env.INBOUND_PROVIDER || "generic").toLowerCase();
  if (p === "mailgun" || p === "resend" || p === "generic") return p;
  return "generic";
}
