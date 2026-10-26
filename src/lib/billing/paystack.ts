import { createHmac, timingSafeEqual } from "crypto";
import { getPackage, type CoinPackage } from "./packages";

const PAYSTACK_BASE = "https://api.paystack.co";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }
  return key;
}

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

export type InitializeResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

export async function initializeTransaction(opts: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<InitializeResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: opts.email,
      amount: opts.amountKobo,
      currency: "NGN",
      reference: opts.reference,
      callback_url: opts.callbackUrl,
      metadata: opts.metadata,
    }),
  });

  const data = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: {
      authorization_url?: string;
      access_code?: string;
      reference?: string;
    };
  };

  if (!res.ok || !data.status || !data.data?.authorization_url) {
    console.error("[paystack] initialize failed", {
      status: res.status,
      message: data.message,
    });
    throw new Error(data.message || "Could not start payment");
  }

  return {
    authorizationUrl: data.data.authorization_url,
    accessCode: data.data.access_code || "",
    reference: data.data.reference || opts.reference,
  };
}

export type VerifyResult = {
  success: boolean;
  reference: string;
  amountKobo: number;
  currency: string;
  status: string;
  paidAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function verifyTransaction(
  reference: string
): Promise<VerifyResult> {
  const res = await fetch(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secretKey()}` },
    }
  );

  const data = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: {
      status?: string;
      reference?: string;
      amount?: number;
      currency?: string;
      paid_at?: string | null;
      metadata?: Record<string, unknown> | null;
    };
  };

  if (!res.ok || !data.status || !data.data) {
    return {
      success: false,
      reference,
      amountKobo: 0,
      currency: "NGN",
      status: "failed",
    };
  }

  const d = data.data;
  return {
    success: d.status === "success",
    reference: d.reference || reference,
    amountKobo: Number(d.amount) || 0,
    currency: (d.currency || "NGN").toUpperCase(),
    status: d.status || "unknown",
    paidAt: d.paid_at,
    metadata: d.metadata ?? null,
  };
}

/**
 * Verify Paystack webhook signature (HMAC SHA512 of raw body with secret key).
 */
export function verifyPaystackSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false;
  let key: string;
  try {
    key = secretKey();
  } catch {
    return false;
  }
  const hash = createHmac("sha512", key)
    .update(typeof rawBody === "string" ? rawBody : new Uint8Array(rawBody))
    .digest("hex");
  try {
    const a = Buffer.from(hash, "utf8");
    const b = Buffer.from(signatureHeader, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function packageFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): CoinPackage | null {
  if (!metadata) return null;
  const id = metadata.packageId;
  if (typeof id !== "string") return null;
  return getPackage(id);
}
