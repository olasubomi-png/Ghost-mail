import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { wallets, walletTransactions } from "@/lib/db/schema";
import { COINS_PER_INBOX } from "./packages";

function firstRow<T extends Record<string, unknown>>(result: unknown): T | null {
  if (result == null) return null;
  if (Array.isArray(result)) {
    return (result[0] as T) ?? null;
  }
  if (typeof result === "object" && result !== null && "rows" in result) {
    const rows = (result as { rows?: unknown[] }).rows;
    if (Array.isArray(rows) && rows[0]) return rows[0] as T;
  }
  return null;
}


export class WalletError extends Error {
  constructor(
    message: string,
    public code: "INSUFFICIENT_COINS" | "WALLET_ERROR" | "NOT_FOUND"
  ) {
    super(message);
    this.name = "WalletError";
  }
}

/** Ensure a wallet row exists (balance 0). Idempotent. */
export async function ensureWallet(userId: string): Promise<number> {
  const db = getDb();
  await db
    .insert(wallets)
    .values({ userId, balance: 0 })
    .onConflictDoNothing({ target: wallets.userId });
  const [row] = await db
    .select({ balance: wallets.balance })
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  return row?.balance ?? 0;
}

export async function getBalance(userId: string): Promise<number> {
  return ensureWallet(userId);
}

/**
 * Atomically deduct coins if balance is sufficient.
 * Returns new balance. Throws WalletError if insufficient.
 */
export async function trySpendCoins(
  userId: string,
  coins: number,
  reference: string,
  metadata?: string
): Promise<number> {
  if (coins < 1) throw new WalletError("Invalid spend amount", "WALLET_ERROR");
  const db = getDb();
  await ensureWallet(userId);

  // Atomic conditional decrement
  const updated = await db.execute<{ balance: number }>(sql`
    UPDATE wallets
    SET balance = balance - ${coins},
        updated_at = now()
    WHERE user_id = ${userId}
      AND balance >= ${coins}
    RETURNING balance
  `);

  const row = firstRow<{ balance: number }>(updated);
  if (!row) {
    throw new WalletError(
      "Insufficient Veil Coins. Purchase more coins to create an address.",
      "INSUFFICIENT_COINS"
    );
  }

  await db.insert(walletTransactions).values({
    userId,
    type: "spend",
    coins: -coins,
    status: "success",
    reference,
    metadata: metadata ?? null,
  });

  return Number(row.balance);
}

/** Credit coins (purchase or refund). Does not enforce uniqueness of ref by itself. */
export async function creditCoins(
  userId: string,
  coins: number,
  opts: {
    type: "purchase" | "refund";
    reference: string;
    amountKobo?: number | null;
    currency?: string | null;
    paystackReference?: string | null;
    metadata?: string | null;
  }
): Promise<number> {
  if (coins < 1) throw new WalletError("Invalid credit amount", "WALLET_ERROR");
  const db = getDb();
  await ensureWallet(userId);

  await db.execute(sql`
    UPDATE wallets
    SET balance = balance + ${coins},
        updated_at = now()
    WHERE user_id = ${userId}
  `);

  await db.insert(walletTransactions).values({
    userId,
    type: opts.type,
    coins,
    amountKobo: opts.amountKobo ?? null,
    currency: opts.currency ?? null,
    status: "success",
    reference: opts.reference,
    paystackReference: opts.paystackReference ?? null,
    metadata: opts.metadata ?? null,
  });

  return getBalance(userId);
}

/**
 * Finalize a successful Paystack purchase exactly once.
 * Returns { credited: true, balance } or { credited: false, balance } if already processed.
 */
export async function finalizePurchaseOnce(opts: {
  userId: string;
  coins: number;
  amountKobo: number;
  currency: string;
  reference: string;
  paystackReference: string;
  metadata?: string;
}): Promise<{ credited: boolean; balance: number }> {
  const db = getDb();
  await ensureWallet(opts.userId);

  // Mark pending → success only once; unique on paystack_reference also guards inserts
  try {
    const marked = await db.execute<{ id: string }>(sql`
      UPDATE wallet_transactions
      SET status = 'success',
          paystack_reference = ${opts.paystackReference},
          updated_at = now()
      WHERE reference = ${opts.reference}
        AND user_id = ${opts.userId}
        AND status = 'pending'
      RETURNING id
    `);
    const markedRow = firstRow<{ id: string }>(marked);
    if (!markedRow) {
      // Already success or missing — check current balance
      return { credited: false, balance: await getBalance(opts.userId) };
    }
  } catch (err) {
    // Unique violation on paystack_reference → already credited
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return { credited: false, balance: await getBalance(opts.userId) };
    }
    throw err;
  }

  await db.execute(sql`
    UPDATE wallets
    SET balance = balance + ${opts.coins},
        updated_at = now()
    WHERE user_id = ${opts.userId}
  `);

  return { credited: true, balance: await getBalance(opts.userId) };
}

export async function listTransactions(
  userId: string,
  limit = 50
): Promise<
  {
    id: string;
    type: string;
    coins: number;
    amountKobo: number | null;
    currency: string | null;
    status: string;
    reference: string;
    createdAt: Date;
  }[]
> {
  const db = getDb();
  const rows = await db
    .select({
      id: walletTransactions.id,
      type: walletTransactions.type,
      coins: walletTransactions.coins,
      amountKobo: walletTransactions.amountKobo,
      currency: walletTransactions.currency,
      status: walletTransactions.status,
      reference: walletTransactions.reference,
      createdAt: walletTransactions.createdAt,
    })
    .from(walletTransactions)
    .where(eq(walletTransactions.userId, userId))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(limit);
  return rows;
}

/** Spend path used by inbox creation. */
export async function spendOneCoinForInbox(
  userId: string,
  addressHint: string
): Promise<number> {
  const reference = `spend_inbox_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return trySpendCoins(userId, COINS_PER_INBOX, reference, addressHint);
}

export async function refundOneCoin(
  userId: string,
  reason: string
): Promise<void> {
  const reference = `refund_inbox_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await creditCoins(userId, COINS_PER_INBOX, {
    type: "refund",
    reference,
    metadata: reason,
  });
}
