/**
 * Opt-in PostgreSQL concurrency tests using the real rateLimit() implementation.
 *
 * Requires RATE_LIMIT_TEST_DATABASE_URL (dedicated Neon/Postgres — never production).
 *
 *   RATE_LIMIT_TEST_DATABASE_URL=postgresql://… npm run test -- tests/rate-limit.integration.test.ts
 *
 * Skipped when the env var is absent.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { neon } from "@neondatabase/serverless";
import { rateLimit } from "../src/lib/rate-limit";
import { resetDbForTests } from "../src/lib/db";

const TEST_URL = process.env.RATE_LIMIT_TEST_DATABASE_URL;
const describeDb = TEST_URL ? describe : describe.skip;

describeDb("rateLimit() against PostgreSQL", () => {
  const admin = neon(TEST_URL!);
  const testPrefix = `rl_test_${Date.now()}_`;
  let savedDatabaseUrl: string | undefined;
  let savedNodeEnv: string | undefined;

  beforeAll(async () => {
    await admin`
      CREATE TABLE IF NOT EXISTS rate_limit_counters (
        bucket_key TEXT PRIMARY KEY,
        window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        hit_count INTEGER NOT NULL DEFAULT 0
      )
    `;

    savedDatabaseUrl = process.env.DATABASE_URL;
    savedNodeEnv = process.env.NODE_ENV;
    process.env.DATABASE_URL = TEST_URL!;
    // Exercise production fail-open path is not used; use test env so errors surface
    Reflect.set(process.env, "NODE_ENV", "test");
    resetDbForTests();
  });

  afterAll(async () => {
    await admin`DELETE FROM rate_limit_counters WHERE bucket_key LIKE ${testPrefix + "%"}`;
    if (savedDatabaseUrl === undefined) {
      Reflect.deleteProperty(process.env, "DATABASE_URL");
    } else {
      process.env.DATABASE_URL = savedDatabaseUrl;
    }
    if (savedNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      Reflect.set(process.env, "NODE_ENV", savedNodeEnv);
    }
    resetDbForTests();
  });

  it("allows exactly 10 of 30 concurrent rateLimit() calls for one key", async () => {
    const key = `${testPrefix}concurrent`;
    const results = await Promise.all(
      Array.from({ length: 30 }, () => rateLimit(key, 10))
    );
    expect(results.filter((r) => r.success).length).toBe(10);
    expect(results.filter((r) => !r.success).length).toBe(20);
  });

  it("isolates independent keys under concurrency", async () => {
    const results = await Promise.all([
      ...Array.from({ length: 5 }, () => rateLimit(`${testPrefix}keyA`, 5)),
      ...Array.from({ length: 5 }, () => rateLimit(`${testPrefix}keyB`, 5)),
    ]);
    expect(results.slice(0, 5).every((r) => r.success)).toBe(true);
    expect(results.slice(5).every((r) => r.success)).toBe(true);
  });

  it("allows a new request after a short window expires", async () => {
    const key = `${testPrefix}window`;
    expect((await rateLimit(key, 1, { windowMs: 2000 })).success).toBe(true);
    expect((await rateLimit(key, 1, { windowMs: 2000 })).success).toBe(false);
    await new Promise((r) => setTimeout(r, 2500));
    expect((await rateLimit(key, 1, { windowMs: 2000 })).success).toBe(true);
  }, 15_000);
});
