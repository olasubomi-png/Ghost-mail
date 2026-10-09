import { describe, it, expect, afterEach, vi } from "vitest";
import { createHmac } from "crypto";
import {
  verifyMailgunSignature,
  verifyResendSignature,
  verifyGenericSignature,
  verifyWebhookSignature,
  normalizeInboundPayload,
  extractMailgunAuth,
  parseFormBody,
  fetchResendEmailContent,
} from "../src/lib/email/provider";
import {
  _memoryRateLimitForTests,
  _resetMemoryRateLimitForTests,
} from "../src/lib/rate-limit";

describe("parseFormBody (Mailgun bracket keys)", () => {
  it("parses signature[timestamp], signature[token], signature[signature]", () => {
    const raw =
      "signature%5Btimestamp%5D=1529006854&signature%5Btoken%5D=abc123token&signature%5Bsignature%5D=deadbeef&recipient=user%40example.com&sender=from%40corp.com&subject=Hi&body-plain=Code+123456";
    const body = parseFormBody(raw);
    expect(body.signature).toEqual({
      timestamp: "1529006854",
      token: "abc123token",
      signature: "deadbeef",
    });
    expect(body.recipient).toBe("user@example.com");
    expect(body["body-plain"]).toBe("Code 123456");
  });

  it("parses flat form fields", () => {
    const body = parseFormBody("timestamp=1&token=t&signature=s&recipient=a@b.com");
    expect(body.timestamp).toBe("1");
    expect(body.token).toBe("t");
  });
});

describe("extractMailgunAuth with form bracket structure", () => {
  it("reads nested signature from parsed form", () => {
    const body = parseFormBody(
      "signature[timestamp]=100&signature[token]=tok&signature[signature]=sig"
    );
    expect(extractMailgunAuth(new Headers(), body)).toEqual({
      timestamp: "100",
      token: "tok",
      signature: "sig",
    });
  });
});

describe("verifyMailgunSignature", () => {
  const key = "test-signing-key";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const token = "a".repeat(50);

  it("accepts a valid signature", () => {
    const signature = createHmac("sha256", key)
      .update(timestamp + token)
      .digest("hex");
    expect(verifyMailgunSignature(key, timestamp, token, signature)).toBe(true);
  });

  it("rejects wrong signature", () => {
    expect(verifyMailgunSignature(key, timestamp, token, "deadbeef")).toBe(false);
  });

  it("rejects stale timestamp", () => {
    const old = String(Math.floor(Date.now() / 1000) - 600);
    const signature = createHmac("sha256", key)
      .update(old + token)
      .digest("hex");
    expect(verifyMailgunSignature(key, old, token, signature)).toBe(false);
  });

  it("end-to-end form payload verification", () => {
    const signature = createHmac("sha256", key)
      .update(timestamp + token)
      .digest("hex");
    const raw = new URLSearchParams({
      "signature[timestamp]": timestamp,
      "signature[token]": token,
      "signature[signature]": signature,
      recipient: "inbox@example.com",
      sender: "a@b.com",
      subject: "Test",
      "body-plain": "hello",
    }).toString();

    process.env.INBOUND_WEBHOOK_SECRET = key;
    const body = parseFormBody(raw);
    expect(verifyWebhookSignature("mailgun", new Headers(), raw, body)).toBe(
      true
    );
  });
});

describe("verifyResendSignature (Svix)", () => {
  const rawKey = Buffer.from("supersecretkeybytes!!");
  const secret = `whsec_${rawKey.toString("base64")}`;
  const id = "msg_test123";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = '{"type":"email.received","data":{}}';

  function makeHeaders(sig: string) {
    return new Headers({
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": sig,
    });
  }

  it("accepts a valid v1 signature", () => {
    const signedContent = `${id}.${timestamp}.${body}`;
    const expected = createHmac("sha256", rawKey)
      .update(signedContent)
      .digest("base64");
    expect(
      verifyResendSignature(secret, makeHeaders(`v1,${expected}`), body)
    ).toBe(true);
  });

  it("rejects invalid signature", () => {
    expect(
      verifyResendSignature(secret, makeHeaders("v1,notavalidsig=="), body)
    ).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(verifyResendSignature(secret, new Headers(), body)).toBe(false);
  });
});

describe("verifyGenericSignature", () => {
  const secret = "generic-secret";
  const body = '{"hello":"world"}';
  const sig = createHmac("sha256", secret).update(body).digest("hex");

  it("accepts valid header", () => {
    expect(verifyGenericSignature(secret, body, `sha256=${sig}`)).toBe(true);
  });

  it("rejects invalid", () => {
    expect(verifyGenericSignature(secret, body, "sha256=00")).toBe(false);
  });
});

describe("verifyWebhookSignature integration", () => {
  const prev = process.env.INBOUND_WEBHOOK_SECRET;

  afterEach(() => {
    if (prev === undefined) {
      Reflect.deleteProperty(process.env, "INBOUND_WEBHOOK_SECRET");
    } else {
      process.env.INBOUND_WEBHOOK_SECRET = prev;
    }
  });

  it("rejects invalid generic signature when secret is set", () => {
    process.env.INBOUND_WEBHOOK_SECRET = "test-secret";
    expect(
      verifyWebhookSignature(
        "generic",
        new Headers({ "x-webhook-signature": "sha256=00" }),
        "{}"
      )
    ).toBe(false);
  });
});

describe("normalizeInboundPayload", () => {
  it("parses mailgun form-like payload", () => {
    const body = {
      recipient: "user@example.com",
      sender: "Alice <alice@corp.com>",
      subject: "Hello",
      "body-plain": "Your code is 123456",
      "Message-Id": "<abc@mailgun>",
    };
    const msg = normalizeInboundPayload("mailgun", body);
    expect(msg).not.toBeNull();
    expect(msg!.to).toBe("user@example.com");
    expect(msg!.from).toBe("alice@corp.com");
    expect(msg!.externalId).toBe("<abc@mailgun>");
  });

  it("parses resend email.received metadata", () => {
    const body = {
      type: "email.received",
      data: {
        email_id: "56761188-7520-42d8-8898-ff6fc54ce618",
        from: "onboarding@resend.dev",
        to: ["delivered@resend.dev"],
        subject: "Sending this example",
      },
    };
    const msg = normalizeInboundPayload("resend", body);
    expect(msg?.externalId).toBe("56761188-7520-42d8-8898-ff6fc54ce618");
    expect(msg?.to).toBe("delivered@resend.dev");
    expect(msg?.textBody).toBeUndefined();
  });

  it("rejects missing recipient", () => {
    expect(
      normalizeInboundPayload("generic", { from: "a@b.com", subject: "x" })
    ).toBeNull();
  });
});

describe("fetchResendEmailContent", () => {
  const prev = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (prev === undefined) Reflect.deleteProperty(process.env, "RESEND_API_KEY");
    else process.env.RESEND_API_KEY = prev;
  });

  it("returns failure when API key missing", async () => {
    Reflect.deleteProperty(process.env, "RESEND_API_KEY");
    const r = await fetchResendEmailContent("id-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/RESEND_API_KEY/);
  });

  it("calls receiving endpoint and maps fields", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const mockFetch = vi.fn(async (url: string) => {
      expect(String(url)).toContain("/emails/receiving/abc-123");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "abc-123",
          from: "a@b.com",
          to: ["inbox@test.com"],
          subject: "Hi",
          text: "plain body",
          html: "<p>html</p>",
        }),
      } as Response;
    });
    const r = await fetchResendEmailContent("abc-123", mockFetch as unknown as typeof fetch);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toBe("plain body");
      expect(r.html).toBe("<p>html</p>");
      expect(r.subject).toBe("Hi");
    }
  });

  it("marks 404 as non-retryable", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const mockFetch = vi.fn(async () => ({ ok: false, status: 404 }) as Response);
    const r = await fetchResendEmailContent("missing", mockFetch as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retryable).toBe(false);
      expect(r.status).toBe(404);
    }
  });

  it("marks 503 as retryable", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const mockFetch = vi.fn(async () => ({ ok: false, status: 503 }) as Response);
    const r = await fetchResendEmailContent("id", mockFetch as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryable).toBe(true);
  });
});

describe("memory rate limit", () => {
  afterEach(() => _resetMemoryRateLimitForTests());

  it("allows up to limit then blocks", () => {
    const key = "test-boundary";
    for (let i = 0; i < 3; i++) {
      expect(_memoryRateLimitForTests(key, 3).success).toBe(true);
    }
    expect(_memoryRateLimitForTests(key, 3).success).toBe(false);
  });

  it("remaining decreases", () => {
    const key = "test-remaining";
    const r1 = _memoryRateLimitForTests(key, 5);
    expect(r1.remaining).toBe(4);
    const r2 = _memoryRateLimitForTests(key, 5);
    expect(r2.remaining).toBe(3);
  });
});
