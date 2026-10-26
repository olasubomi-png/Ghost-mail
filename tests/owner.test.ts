import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isOwnerEmail } from "../src/lib/auth/owner";

describe("isOwnerEmail", () => {
  const prev = process.env.OWNER_EMAIL;

  afterEach(() => {
    if (prev === undefined) delete process.env.OWNER_EMAIL;
    else process.env.OWNER_EMAIL = prev;
  });

  it("returns false when OWNER_EMAIL is unset", () => {
    delete process.env.OWNER_EMAIL;
    expect(isOwnerEmail("vegasola8@gmail.com")).toBe(false);
  });

  it("matches normalized owner email", () => {
    process.env.OWNER_EMAIL = "  VegasOla8@Gmail.com ";
    expect(isOwnerEmail("vegasola8@gmail.com")).toBe(true);
    expect(isOwnerEmail("VEGASOLA8@GMAIL.COM")).toBe(true);
  });

  it("rejects non-owner emails", () => {
    process.env.OWNER_EMAIL = "vegasola8@gmail.com";
    expect(isOwnerEmail("other@example.com")).toBe(false);
    expect(isOwnerEmail("")).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
    expect(isOwnerEmail(undefined)).toBe(false);
  });

  it("does not treat request-body spoofing — only the passed session email counts", () => {
    process.env.OWNER_EMAIL = "vegasola8@gmail.com";
    // Simulated: attacker puts owner email in body, but session email is different
    const sessionEmail = "attacker@example.com";
    const bodyEmail = "vegasola8@gmail.com";
    expect(isOwnerEmail(sessionEmail)).toBe(false);
    // body email must never be used by callers; documenting expected usage
    expect(isOwnerEmail(bodyEmail)).toBe(true); // would only pass if wrongly used as session
  });
});
