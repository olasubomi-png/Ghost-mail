import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  verifyPaystackSignature,
  verifyTransaction,
} from "@/lib/billing/paystack";
import { finalizePurchaseOnce } from "@/lib/billing/wallet";
import { getDb } from "@/lib/db";
import { walletTransactions } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    if (!verifyPaystackSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let event: {
      event?: string;
      data?: {
        reference?: string;
        status?: string;
        amount?: number;
        currency?: string;
      };
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Acknowledge non-charge events
    if (event.event !== "charge.success") {
      return NextResponse.json({ received: true });
    }

    const reference = event.data?.reference;
    if (!reference) {
      return NextResponse.json({ received: true });
    }

    // Independent verification with Paystack API
    const verified = await verifyTransaction(reference);
    if (
      !verified.success ||
      verified.currency !== "NGN"
    ) {
      return NextResponse.json({ received: true });
    }

    const db = getDb();
    const [tx] = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.reference, reference))
      .limit(1);

    if (!tx || tx.type !== "purchase") {
      return NextResponse.json({ received: true });
    }

    if (tx.amountKobo != null && verified.amountKobo !== tx.amountKobo) {
      console.error("[paystack webhook] amount mismatch");
      return NextResponse.json({ received: true });
    }

    await finalizePurchaseOnce({
      userId: tx.userId,
      coins: tx.coins,
      amountKobo: verified.amountKobo,
      currency: verified.currency,
      reference: tx.reference,
      paystackReference: verified.reference,
      metadata: tx.metadata ?? undefined,
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(
      "[paystack webhook]",
      err instanceof Error ? err.message : "unknown"
    );
    // 500 so Paystack retries
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
