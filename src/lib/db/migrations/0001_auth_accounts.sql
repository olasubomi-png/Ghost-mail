-- Ghost Mail Milestone 1: user accounts + mailbox ownership (additive)
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "email_verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_active_idx" ON "users" ("email") WHERE "deleted_at" IS NULL;

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_agent" text,
  "ip" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_hash_idx" ON "sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" ("expires_at");

CREATE TABLE IF NOT EXISTS "auth_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "auth_tokens_hash_idx" ON "auth_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "auth_tokens_user_id_idx" ON "auth_tokens" ("user_id");

ALTER TABLE "inboxes" ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "inboxes_user_id_idx" ON "inboxes" ("user_id");
