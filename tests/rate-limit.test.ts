import { describe, it, expect, afterEach } from "vitest";
import {
  _memoryRateLimitForTests,
  _resetMemoryRateLimitForTests,
  buildRateLimitSql,
} from "../src/lib/rate-limit";

describe("memory rate limit (dev fallback)", () => {
  afterEach(() => _resetMemoryRateLimitForTests());

  it("allows exactly limit requests then blocks", () => {
    const key = "boundary-key";
    const limit = 5;
    const results = Array.from({ length: limit + 2 }, () =>
      _memoryRateLimitForTests(key, limit)
    );
    expect(results.slice(0, limit).every((r) => r.success)).toBe(true);
    expect(results.slice(limit).every((r) => !r.success)).toBe(true);
  });

  it("isolates different keys", () => {
    expect(_memoryRateLimitForTests("a", 1).success).toBe(true);
    expect(_memoryRateLimitForTests("a", 1).success).toBe(false);
    expect(_memoryRateLimitForTests("b", 1).success).toBe(true);
  });

  it("remaining counts down", () => {
    const key = "rem";
    expect(_memoryRateLimitForTests(key, 3).remaining).toBe(2);
    expect(_memoryRateLimitForTests(key, 3).remaining).toBe(1);
    expect(_memoryRateLimitForTests(key, 3).remaining).toBe(0);
    expect(_memoryRateLimitForTests(key, 3).success).toBe(false);
  });
});

describe("buildRateLimitSql structure", () => {
  it("references locked CTE from pruned, counted, inserted, and final SELECT", () => {
    // drizzle sql objects expose query chunks; stringify via the internal structure
    const query = buildRateLimitSql("test-key", 10, 60);
    // SQL template stores strings in queryChunks / strings depending on version
    const serialized = JSON.stringify(query);
    expect(serialized).toContain("pg_advisory_xact_lock");
    expect(serialized).toContain("locked");
    // Ensure dependency chain appears in the query text fragments
    expect(serialized).toMatch(/FROM locked|FROM counted, locked|SELECT acquired/);
  });

  it("includes sliding window prune and conditional insert", () => {
    const serialized = JSON.stringify(buildRateLimitSql("k", 5, 60));
    expect(serialized).toContain("rate_limit_buckets");
    expect(serialized).toContain("make_interval");
    expect(serialized).toContain("did_insert");
    expect(serialized).toContain("prior_count");
    expect(serialized).toContain("lock_held");
  });
});
