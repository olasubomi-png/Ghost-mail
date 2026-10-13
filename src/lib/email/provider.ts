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

export type ResendVerifyResult = {
  ok: boolean;
  /** Machine-safe reason for logs – never includes secrets or signatures */
  reason?: string;
};

/**
 * Decode a Svix/Resend signing secret (whsec_ + base64 key material).
 * Trims whitespace that often appears when pasting into Vercel env UI.
 */
export function decodeSvixSecret(webhookSecret: string): Buffer | null {
  const trimmed = webhookSecret.trim().replace(/^["']|["']$/g, "");
  if (!trimmed) return null;
  try {
    const b64 = trimmed.startsWith("whsec_")
      ? trimmed.slice("whsec_".length)
      : trimmed;
    const bytes = Buffer.from(b64, "base64");
    // Empty or clearly invalid decode
    if (bytes.length === 0) return null;
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Verify Resend / Svix webhook signature.
 * Spec: HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}` with
 * base64-decoded key material from the whsec_ secret; compare to each
 * `v1,<sig>` entry in the space-delimited signature header.
 * https://docs.svix.com/receiving/verifying-payloads/how-manual
 * https://resend.com/docs/webhooks/verify-webhooks-requests
 */
export function verifyResendSignatureDetailed(
  webhookSecret: string,
  headers: Headers,
  rawBody: string
): ResendVerifyResult {
  const svixId =
    headers.get("svix-id") ||
    headers.get("webhook-id") ||
    "";
  const svixTimestamp =
    headers.get("svix-timestamp") ||
    headers.get("webhook-timestamp") ||
    "";
  const svixSignature =
    headers.get("svix-signature") ||
    headers.get("webhook-signature") ||
    "";

  if (!webhookSecret || !webhookSecret.trim()) {
    return { ok: false, reason: "missing_secret" };
  }
  if (!svixId) return { ok: false, reason: "missing_svix_id" };
  if (!svixTimestamp) return { ok: false, reason: "missing_svix_timestamp" };
  if (!svixSignature) return { ok: false, reason: "missing_svix_signature" };

  const ts = Number(svixTimestamp);
  if (Number.isNaN(ts)) {
    return { ok: false, reason: "invalid_timestamp" };
  }
  const age = Math.abs(Date.now() / 1000 - ts);
  if (age > REPLAY_WINDOW_SECONDS) {
    return { ok: false, reason: "timestamp_outside_replay_window" };
  }

  const secretBytes = decodeSvixSecret(webhookSecret);
  if (!secretBytes) {
    return { ok: false, reason: "secret_decode_failed" };
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes)
    .update(signedContent, "utf8")
    .digest("base64");

  const candidates = svixSignature
    .split(/[\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let sawV1 = false;
  for (const candidate of candidates) {
    // Format: v1,<base64>  (sig itself may contain padding '=')
    const comma = candidate.indexOf(",");
    if (comma === -1) continue;
    const version = candidate.slice(0, comma);
    const sig = candidate.slice(comma + 1);
    if (version !== "v1" || !sig) continue;
    sawV1 = true;
    if (safeEqualUtf8(expected, sig)) {
      return { ok: true };
    }
  }

  if (!sawV1) return { ok: false, reason: "no_v1_signature_entry" };
  return { ok: false, reason: "signature_mismatch" };
}

/** Boolean wrapper for existing call sites and tests */
export function verifyResendSignature(
  webhookSecret: string,
  headers: Headers,
  rawBody: string
): boolean {
  return verifyResendSignatureDetailed(webhookSecret, headers, rawBody).ok;
}

/** Safe diagnostic snapshot – never includes secret or signature values */
export function describeWebhookAuthContext(
  provider: ProviderName,
  headers: Headers
): Record<string, string | boolean | number> {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  const hasSecret = Boolean(secret && secret.trim());
  const secretTrimmed = secret?.trim() ?? "";
  return {
    provider,
    has_inbound_webhook_secret: hasSecret,
    secret_has_whsec_prefix: hasSecret && secretTrimmed.startsWith("whsec_"),
    secret_length: hasSecret ? secretTrimmed.length : 0,
    has_svix_id: Boolean(
      headers.get("svix-id") || headers.get("webhook-id")
    ),
    has_svix_timestamp: Boolean(
      headers.get("svix-timestamp") || headers.get("webhook-timestamp")
    ),
    has_svix_signature: Boolean(
      headers.get("svix-signature") || headers.get("webhook-signature")
    ),
    has_mailgun_signature_header: Boolean(
      headers.get("x-mailgun-signature")
    ),
    has_generic_signature_header: Boolean(
      headers.get("x-webhook-signature")
    ),
    content_type: headers.get("content-type") || "none",
  };
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
  return verifyWebhookSignatureDetailed(provider, headers, rawBody, parsedBody)
    .ok;
}

export function verifyWebhookSignatureDetailed(
  provider: ProviderName,
  headers: Headers,
  rawBody: string,
  parsedBody?: unknown
): { ok: boolean; reason?: string } {
  const secretRaw = process.env.INBOUND_WEBHOOK_SECRET;
  const secret = secretRaw?.trim().replace(/^["']|["']$/g, "") ?? "";

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "missing_secret" };
    }
    // Local dev without a secret: allow (documented in README)
    return { ok: true, reason: "dev_no_secret" };
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
      if (!auth) return { ok: false, reason: "mailgun_auth_fields_missing" };
      const ok = verifyMailgunSignature(
        secret,
        auth.timestamp,
        auth.token,
        auth.signature
      );
      return ok
        ? { ok: true }
        : { ok: false, reason: "mailgun_signature_invalid" };
    }
    case "resend":
      return verifyResendSignatureDetailed(secret, headers, rawBody);
    case "generic":
    default: {
      const header = headers.get("x-webhook-signature") || "";
      if (!header) return { ok: false, reason: "missing_generic_signature_header" };
      const ok = verifyGenericSignature(secret, rawBody, header);
      return ok
        ? { ok: true }
        : { ok: false, reason: "generic_signature_invalid" };
    }
  }
}


/** Extract bare email addresses from a string or string array field. */
export function extractEmailAddresses(value: unknown): string[] {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const item of list) {
    if (item == null) continue;
    const s = String(item).trim();
    if (!s) continue;
    // "Name <email@x.com>" or bare email
    const angle = s.match(/<([^>]+@[^>]+)>/);
    const email = (angle ? angle[1] : s).toLowerCase().trim();
    if (email.includes("@") && !out.includes(email)) out.push(email);
  }
  return out;
}

/** Collect all plausible recipient addresses from a Resend event payload. */
export function collectResendRecipients(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;
  const data = (b.data as Record<string, unknown>) || b;
  // Nested email object (inbox.email.received)
  const emailObj =
    data.email && typeof data.email === "object"
      ? (data.email as Record<string, unknown>)
      : null;

  const sources = [
    data.to,
    data.received_for,
    data.cc,
    emailObj?.to,
    emailObj?.received_for,
  ];
  const out: string[] = [];
  for (const src of sources) {
    for (const addr of extractEmailAddresses(src)) {
      if (!out.includes(addr)) out.push(addr);
    }
  }
  return out;
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
      const emailObj =
        data.email && typeof data.email === "object"
          ? (data.email as Record<string, unknown>)
          : null;

      // Prefer all recipients; first is a provisional "to" for schema validation.
      // The webhook route will re-resolve against the DB using collectResendRecipients.
      const recipients = collectResendRecipients(body);
      const toAddr = recipients[0] || "";

      const fromRaw =
        emailObj?.from ?? data.from ?? "";
      const fromStr = String(fromRaw);
      const nameMatch = fromStr.match(/^"?([^"<]+)"?\s*</);

      candidate = {
        // email_id is required for Receiving API content fetch
        externalId:
          data.email_id ||
          emailObj?.id ||
          data.id ||
          b.id ||
          undefined,
        to: toAddr,
        from: fromStr.includes("<")
          ? fromStr.replace(/^.*<([^>]+)>.*$/, "$1").trim()
          : fromStr.trim(),
        fromName: nameMatch ? nameMatch[1].trim() : undefined,
        subject:
          (emailObj?.subject as string) ||
          (data.subject as string) ||
          "(no subject)",
        textBody: data.text,
        htmlBody: data.html,
        receivedAt: data.created_at
          ? new Date(String(data.created_at))
          : emailObj?.received_at
            ? new Date(String(emailObj.received_at))
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
  const p = (process.env.INBOUND_PROVIDER || "generic").toLowerCase().trim();
  if (p === "mailgun" || p === "resend" || p === "generic") return p;
  console.warn(
    "[webhook] Unknown INBOUND_PROVIDER value – falling back to generic"
  );
  return "generic";
}
