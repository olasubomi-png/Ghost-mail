/**
 * Fixed Veil Coin packages. Amounts are the source of truth server-side.
 * Paystack expects amounts in the smallest currency unit (kobo for NGN).
 */
export type CoinPackageId = "coins_10" | "coins_15" | "coins_20" | "coins_50";

export type CoinPackage = {
  id: CoinPackageId;
  coins: number;
  /** Display price in NGN (may include kobo as decimal). */
  priceNgn: number;
  /** Amount charged via Paystack in kobo. */
  amountKobo: number;
  label: string;
};

export const COIN_PACKAGES: Record<CoinPackageId, CoinPackage> = {
  coins_10: {
    id: "coins_10",
    coins: 10,
    priceNgn: 1099,
    amountKobo: 109_900,
    label: "10 Veil Coins",
  },
  coins_15: {
    id: "coins_15",
    coins: 15,
    priceNgn: 1648.5,
    amountKobo: 164_850,
    label: "15 Veil Coins",
  },
  coins_20: {
    id: "coins_20",
    coins: 20,
    priceNgn: 2198,
    amountKobo: 219_800,
    label: "20 Veil Coins",
  },
  coins_50: {
    id: "coins_50",
    coins: 50,
    priceNgn: 5495,
    amountKobo: 549_500,
    label: "50 Veil Coins",
  },
};

export const PACKAGE_LIST: CoinPackage[] = [
  COIN_PACKAGES.coins_10,
  COIN_PACKAGES.coins_15,
  COIN_PACKAGES.coins_20,
  COIN_PACKAGES.coins_50,
];

export const MIN_COINS_PURCHASE = 10;
/** Cost to create one new email address. */
export const COINS_PER_INBOX = 1;

export function getPackage(id: string): CoinPackage | null {
  if (id in COIN_PACKAGES) {
    return COIN_PACKAGES[id as CoinPackageId];
  }
  return null;
}

export function formatNgn(priceNgn: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: priceNgn % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(priceNgn);
}
