import { describe, it, expect } from "vitest";
import {
  senderInitials,
  filterMessages,
  avatarTone,
} from "../src/lib/inbox-ui";

describe("senderInitials", () => {
  it("uses two words from name", () => {
    expect(senderInitials("Ada Lovelace", "a@x.com")).toBe("AL");
  });

  it("falls back to local-part", () => {
    expect(senderInitials(null, "support@github.com")).toBe("SU");
  });
});

describe("filterMessages", () => {
  const msgs = [
    {
      fromAddress: "a@x.com",
      fromName: "Alice",
      subject: "Verify your email",
      preview: "Your code is 123456",
    },
    {
      fromAddress: "shop@store.com",
      fromName: null,
      subject: "Order shipped",
      preview: "Tracking 999",
    },
  ];

  it("returns all when query empty", () => {
    expect(filterMessages(msgs, "")).toHaveLength(2);
  });

  it("filters by subject", () => {
    expect(filterMessages(msgs, "verify")).toHaveLength(1);
    expect(filterMessages(msgs, "verify")[0].fromName).toBe("Alice");
  });

  it("filters by sender", () => {
    expect(filterMessages(msgs, "shop@store")).toHaveLength(1);
  });

  it("is case-insensitive", () => {
    expect(filterMessages(msgs, "ORDER")).toHaveLength(1);
  });
});

describe("avatarTone", () => {
  it("is stable for same seed", () => {
    expect(avatarTone("a@x.com")).toBe(avatarTone("a@x.com"));
  });
});
