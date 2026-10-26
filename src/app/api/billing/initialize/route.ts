import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { getPackage } from "@/lib/billing/packages";
import { ensureWallet } from "@/lib/billing/wallet";
import {
  initializeTransaction,
  isPaystackConfigured,
} from "@/lib/billing/paystack";
import { getDb } from "@/lib/db";
import { walletTransactions } from "@/lib/db/schema";

export const runtime = "nodejs";

function appBaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_URL ||
    "http://localhost:3000";
  return url.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user.emailVerified) {
      return NextResponse.json(
        { error: "Verify your email before purchasing coins." },
        { status: 403 }
      );
    }

    if (!isPaystackConfigured()) {
      return NextResponse.json(
        { error: "Payments are not configured yet." },
        { status: 503 }
      );
    }

    const { success } = await rateLimit(`billing:init:${user.id}`, 8);
    if (!success) {
      return NextResponse.json(
        { error: "Too many payment attempts. Please wait." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const pkg = getPackage(typeof body.packageId === "string" ? body.packageId : "");
    if (!pkg) {
      return NextResponse.json({ error: "Invalid package" }, { status: 400 });
    }

    await ensureWallet(user.id);

    const reference = `vm_${nanoid(24)}`;
    const db = getDb();
    await db.insert(walletTransactions).values({
      userId: user.id,
      type: "purchase",
      coins: pkg.coins,
      amountKobo: pkg.amountKobo,
      currency: "NGN",
      status: "pending",
      reference,
      metadata: JSON.stringify({ packageId: pkg.id }),
    });

    const init = await initializeTransaction({
      email: user.email,
      amountKobo: pkg.amountKobo,
      reference,
      callbackUrl: `${appBaseUrl()}/billing?payment=return&ref=${encodeURIComponent(reference)}`,
      metadata: {
        packageId: pkg.id,
        userId: user.id,
        coins: pkg.coins,
      },
    });

    return NextResponse.json({
      authorizationUrl: init.authorizationUrl,
      reference: init.reference,
    });
  } catch (err) {
    console.error(
      "[billing/initialize]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json(
      { error: "Could not start payment" },
      { status: 500 }
    );
  }
}
