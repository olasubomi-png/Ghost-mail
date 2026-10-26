import { describe, it, expect } from "vitest";
import {
  COIN_PACKAGES,
  PACKAGE_LIST,
  getPackage,
  COINS_PER_INBOX,
  MIN_COINS_PURCHASE,
} from "../src/lib/billing/packages";
import { verifyPaystackSignature } from "../src/lib/billing/paystack";

describe("Veil Coin packages", () => {
  it("defines exact package amounts in kobo", () => {
    expect(COIN_PACKAGES.coins_10).toMatchObject({
      coins: 10,
      amountKobo: 109_900,
      priceNgn: 1099,
    });
    expect(COIN_PACKAGES.coins_15).toMatchObject({
      coins: 15,
      amountKobo: 164_850,
      priceNgn: 1648.5,
    });
    expect(COIN_PACKAGES.coins_20).toMatchObject({
      coins: 20,
      amountKobo: 219_800,
    });
    expect(COIN_PACKAGES.coins_50).toMatchObject({
      coins: 50,
      amountKobo: 549_500,
    });
  });

  it("minimum purchase is 10 coins", () => {
    expect(MIN_COINS_PURCHASE).toBe(10);
    expect(Math.min(...PACKAGE_LIST.map((p) => p.coins))).toBe(10);
  });

  it("costs one coin per new inbox", () => {
    expect(COINS_PER_INBOX).toBe(1);
  });

  it("rejects unknown package ids", () => {
    expect(getPackage("coins_99")).toBeNull();
    expect(getPackage("coins_10")?.coins).toBe(10);
  });
});

describe("Paystack signature verification", () => {
  it("rejects missing signature when key unset or mismatch", () => {
    const prev = process.env.PAYSTACK_SECRET_KEY;
    process.env.PAYSTACK_SECRET_KEY = "test_secret_key_for_unit";
    expect(verifyPaystackSignature('{"event":"charge.success"}', null)).toBe(
      false
    );
    expect(
      verifyPaystackSignature('{"event":"charge.success"}', "deadbeef")
    ).toBe(false);
    if (prev === undefined) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = prev;
  });

  it("accepts a valid HMAC SHA512 signature", async () => {
    const { createHmac } = await import("crypto");
    const prev = process.env.PAYSTACK_SECRET_KEY;
    const secret = "test_secret_key_for_unit";
    process.env.PAYSTACK_SECRET_KEY = secret;
    const body = '{"event":"charge.success","data":{"reference":"abc"}}';
    const sig = createHmac("sha512", secret).update(body).digest("hex");
    expect(verifyPaystackSignature(body, sig)).toBe(true);
    if (prev === undefined) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = prev;
  });
});
