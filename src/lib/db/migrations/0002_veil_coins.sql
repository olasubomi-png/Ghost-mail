-- VeilMail: Veil Coin wallets and payment ledger (additive)
CREATE TABLE IF NOT EXISTS "wallets" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE cascade,
  "balance" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "wallets_balance_nonneg" CHECK ("balance" >= 0)
);

CREATE TABLE IF NOT EXISTS "wallet_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "coins" integer NOT NULL,
  "amount_kobo" integer,
  "currency" text,
  "status" text NOT NULL DEFAULT 'pending',
  "reference" text NOT NULL,
  "paystack_reference" text,
  "metadata" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_tx_reference_idx"
  ON "wallet_transactions" ("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_tx_paystack_ref_idx"
  ON "wallet_transactions" ("paystack_reference")
  WHERE "paystack_reference" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "wallet_tx_user_id_idx"
  ON "wallet_transactions" ("user_id");
CREATE INDEX IF NOT EXISTS "wallet_tx_user_created_idx"
  ON "wallet_transactions" ("user_id", "created_at");
