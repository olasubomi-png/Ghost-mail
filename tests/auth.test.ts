import { describe, it, expect } from "vitest";
import {
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
} from "../src/lib/auth/password";
import { hashToken, generateOpaqueToken } from "../src/lib/auth/crypto";
import { registerSchema, loginSchema } from "../src/lib/auth/validation";
import { canAccessInbox } from "../src/lib/db/inboxes";
import type { Inbox } from "../src/lib/db/schema";

describe("password policy", () => {
  it("rejects short passwords", () => {
    expect(validatePasswordStrength("ab12")).toBeTruthy();
  });

  it("rejects letters-only", () => {
    expect(validatePasswordStrength("abcdefgh")).toBeTruthy();
  });

  it("accepts strong enough password", () => {
    expect(validatePasswordStrength("secret12")).toBeNull();
  });
});

describe("password hashing", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("secret12");
    expect(h).not.toBe("secret12");
    expect(await verifyPassword("secret12", h)).toBe(true);
    expect(await verifyPassword("wrong999", h)).toBe(false);
  });
});

describe("token hashing", () => {
  it("is deterministic and high entropy", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
  });
});

describe("auth validation schemas", () => {
  it("normalizes email on register", () => {
    const r = registerSchema.safeParse({
      email: "  User@Example.COM ",
      password: "secret12",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("user@example.com");
  });

  it("rejects invalid email", () => {
    expect(
      loginSchema.safeParse({ email: "not-an-email", password: "x" }).success
    ).toBe(false);
  });
});

describe("canAccessInbox ownership rules", () => {
  const base = {
    id: "00000000-0000-0000-0000-000000000001",
    localPart: "test",
    address: "test@example.com",
    accessToken: "token_aaaaaaaaaaaaaaaa",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as Inbox;

  it("denies access to anonymous (unowned) inboxes", () => {
    const inbox = { ...base, userId: null };
    expect(
      canAccessInbox(inbox, { token: base.accessToken, userId: null })
    ).toBe(false);
    expect(
      canAccessInbox(inbox, { token: base.accessToken, userId: "00000000-0000-0000-0000-000000000099" })
    ).toBe(false);
  });

  it("denies token-only access even with a valid token", () => {
    const owner = "00000000-0000-0000-0000-000000000099";
    const inbox = { ...base, userId: owner };
    expect(
      canAccessInbox(inbox, { token: base.accessToken, userId: null })
    ).toBe(false);
  });

  it("requires owning user for account-owned inbox", () => {
    const owner = "00000000-0000-0000-0000-000000000099";
    const inbox = { ...base, userId: owner };
    expect(
      canAccessInbox(inbox, { token: base.accessToken, userId: null })
    ).toBe(false);
    expect(
      canAccessInbox(inbox, { token: base.accessToken, userId: owner })
    ).toBe(true);
    expect(
      canAccessInbox(inbox, {
        token: base.accessToken,
        userId: "00000000-0000-0000-0000-000000000088",
      })
    ).toBe(false);
  });
});

import { safeRedirectPath } from "../src/lib/auth/redirect";

describe("safeRedirectPath", () => {
  it("allows relative paths", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/inbox/abc")).toBe("/inbox/abc");
  });

  it("rejects open redirects", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("//evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/dashboard");
    expect(safeRedirectPath(null)).toBe("/dashboard");
  });
});
