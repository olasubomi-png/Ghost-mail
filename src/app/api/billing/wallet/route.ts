import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getBalance, listTransactions } from "@/lib/billing/wallet";
import { PACKAGE_LIST, formatNgn, COINS_PER_INBOX } from "@/lib/billing/packages";
import { isPaystackConfigured } from "@/lib/billing/paystack";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [balance, transactions] = await Promise.all([
      getBalance(user.id),
      listTransactions(user.id, 40),
    ]);

    return NextResponse.json({
      balance,
      coinsPerInbox: COINS_PER_INBOX,
      paystackConfigured: isPaystackConfigured(),
      packages: PACKAGE_LIST.map((p) => ({
        id: p.id,
        coins: p.coins,
        priceNgn: p.priceNgn,
        amountKobo: p.amountKobo,
        label: p.label,
        priceDisplay: formatNgn(p.priceNgn),
        perCoinDisplay: formatNgn(p.priceNgn / p.coins),
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        coins: t.coins,
        amountKobo: t.amountKobo,
        currency: t.currency,
        status: t.status,
        reference: t.reference,
        createdAt: t.createdAt,
      })),
    });
  } catch (err) {
    console.error(
      "[billing/wallet]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
