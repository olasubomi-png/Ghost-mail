/**
 * Opt-in PostgreSQL concurrency tests.
 * Requires RATE_LIMIT_TEST_DATABASE_URL (dedicated Neon/Postgres — never production).
 *
 * Run: RATE_LIMIT_TEST_DATABASE_URL=... npm run test -- tests/rate-limit.integration.test.ts
 *
 * These tests are skipped when the env var is absent.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { neon } from "@neondatabase/serverless";

const TEST_URL = process.env.RATE_LIMIT_TEST_DATABASE_URL;
const describeDb = TEST_URL ? describe : describe.skip;

describeDb("rateLimit PostgreSQL concurrency", () => {
  const sql = neon(TEST_URL!);
  const testPrefix = `rl_test_${Date.now()}_`;

  beforeAll(async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS rate_limit_counters (
        bucket_key TEXT PRIMARY KEY,
        window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        hit_count INTEGER NOT NULL DEFAULT 0
      )
    `;
  });

  afterAll(async () => {
    await sql`DELETE FROM rate_limit_counters WHERE bucket_key LIKE ${testPrefix + "%"}`;
  });

  async function rateLimitDb(
    key: string,
    limit: number,
    windowSeconds = 60
  ): Promise<{ success: boolean; remaining: number }> {
    const rows = await sql`
      INSERT INTO rate_limit_counters (bucket_key, window_start, hit_count)
      VALUES (${key}, NOW(), 1)
      ON CONFLICT (bucket_key) DO UPDATE SET
        hit_count = CASE
          WHEN rate_limit_counters.window_start
            <= NOW() - make_interval(secs => ${windowSeconds})
          THEN 1
          ELSE rate_limit_counters.hit_count + 1
        END,
        window_start = CASE
          WHEN rate_limit_counters.window_start
            <= NOW() - make_interval(secs => ${windowSeconds})
          THEN NOW()
          ELSE rate_limit_counters.window_start
        END
      WHERE
        rate_limit_counters.window_start
          <= NOW() - make_interval(secs => ${windowSeconds})
        OR rate_limit_counters.hit_count < ${limit}
      RETURNING hit_count
    `;
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) return { success: false, remaining: 0 };
    const hitCount = Number((list[0] as { hit_count: number }).hit_count);
    return { success: true, remaining: Math.max(0, limit - hitCount) };
  }

  it("allows exactly 10 of 30 concurrent requests for one key", async () => {
    const key = `${testPrefix}concurrent`;
    const limit = 10;
    const results = await Promise.all(
      Array.from({ length: 30 }, () => rateLimitDb(key, limit))
    );
    const allowed = results.filter((r) => r.success).length;
    const denied = results.filter((r) => !r.success).length;
    expect(allowed).toBe(10);
    expect(denied).toBe(20);
  });

  it("isolates independent keys under concurrency", async () => {
    const results = await Promise.all([
      ...Array.from({ length: 5 }, () => rateLimitDb(`${testPrefix}keyA`, 5)),
      ...Array.from({ length: 5 }, () => rateLimitDb(`${testPrefix}keyB`, 5)),
    ]);
    const aOk = results.slice(0, 5).filter((r) => r.success).length;
    const bOk = results.slice(5).filter((r) => r.success).length;
    expect(aOk).toBe(5);
    expect(bOk).toBe(5);
  });

  it("allows a new request after a short window expires", async () => {
    const key = `${testPrefix}window`;
    const windowSecs = 2;
    expect((await rateLimitDb(key, 1, windowSecs)).success).toBe(true);
    expect((await rateLimitDb(key, 1, windowSecs)).success).toBe(false);
    await new Promise((r) => setTimeout(r, 2500));
    expect((await rateLimitDb(key, 1, windowSecs)).success).toBe(true);
  }, 15_000);
});
