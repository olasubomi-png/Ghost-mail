import { describe, it, expect, beforeEach, vi } from "vitest";

// Minimal localStorage mock for node
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
});
vi.stubGlobal("window", {});

import {
  loadAddressHistory,
  pushAddressHistory,
  removeAddressHistory,
  clearAddressHistory,
} from "../src/lib/client/address-history";

describe("address history (device-local)", () => {
  beforeEach(() => {
    store.clear();
  });

  it("starts empty", () => {
    expect(loadAddressHistory()).toEqual([]);
  });

  it("pushes newest first and de-dupes by address", () => {
    pushAddressHistory({
      address: "a@x.com",
      accessToken: "token_aaaaaaaaaaaaaaaa",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    pushAddressHistory({
      address: "b@x.com",
      accessToken: "token_bbbbbbbbbbbbbbbb",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    pushAddressHistory({
      address: "a@x.com",
      accessToken: "token_cccccccccccccccc",
      createdAt: "2026-01-03T00:00:00.000Z",
    });
    const list = loadAddressHistory();
    expect(list[0].address).toBe("a@x.com");
    expect(list[0].accessToken).toBe("token_cccccccccccccccc");
    expect(list).toHaveLength(2);
  });

  it("removes an entry", () => {
    pushAddressHistory({
      address: "a@x.com",
      accessToken: "token_aaaaaaaaaaaaaaaa",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    removeAddressHistory("a@x.com");
    expect(loadAddressHistory()).toHaveLength(0);
  });

  it("clears all", () => {
    pushAddressHistory({
      address: "a@x.com",
      accessToken: "token_aaaaaaaaaaaaaaaa",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    clearAddressHistory();
    expect(loadAddressHistory()).toHaveLength(0);
  });
});
