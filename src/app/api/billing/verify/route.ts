import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { getPackage } from "@/lib/billing/packages";
import { finalizePurchaseOnce, getBalance } from "@/lib/billing/wallet";
import { verifyTransaction } from "@/lib/billing/paystack";
import { getDb } from "@/lib/db";
import { walletTransactions } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { success } = await rateLimit(`billing:verify:${user.id}`, 20);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const reference =
      typeof body.reference === "string" ? body.reference.trim() : "";
    if (!reference || reference.length < 8) {
      return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
    }

    const db = getDb();
    const [tx] = await db
      .select()
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.reference, reference),
          eq(walletTransactions.userId, user.id)
        )
      )
      .limit(1);

    if (!tx || tx.type !== "purchase") {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (tx.status === "success") {
      return NextResponse.json({
        ok: true,
        alreadyProcessed: true,
        balance: await getBalance(user.id),
        coins: tx.coins,
      });
    }

    const verified = await verifyTransaction(reference);
    if (
      !verified.success ||
      verified.currency !== "NGN" ||
      verified.amountKobo !== (tx.amountKobo ?? -1)
    ) {
      await db
        .update(walletTransactions)
        .set({ status: "failed", updatedAt: new Date() })
        .where(
          and(
            eq(walletTransactions.id, tx.id),
            eq(walletTransactions.status, "pending")
          )
        );
      return NextResponse.json(
        { error: "Payment not successful", ok: false },
        { status: 400 }
      );
    }

    // Optional package check from metadata
    let meta: { packageId?: string } = {};
    try {
      meta = tx.metadata ? JSON.parse(tx.metadata) : {};
    } catch {
      meta = {};
    }
    if (meta.packageId) {
      const pkg = getPackage(meta.packageId);
      if (
        pkg &&
        (pkg.amountKobo !== verified.amountKobo || pkg.coins !== tx.coins)
      ) {
        return NextResponse.json(
          { error: "Payment amount mismatch" },
          { status: 400 }
        );
      }
    }

    const result = await finalizePurchaseOnce({
      userId: user.id,
      coins: tx.coins,
      amountKobo: verified.amountKobo,
      currency: verified.currency,
      reference: tx.reference,
      paystackReference: verified.reference,
      metadata: tx.metadata ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      credited: result.credited,
      balance: result.balance,
      coins: tx.coins,
    });
  } catch (err) {
    console.error(
      "[billing/verify]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
