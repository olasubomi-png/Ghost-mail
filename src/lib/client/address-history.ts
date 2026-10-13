/**
 * Device-local history of addresses this browser created.
 * Stores opaque access tokens needed to reopen inboxes.
 * Not a global server history – clearing site data or switching devices loses it.
 */

export type HistoryEntry = {
  address: string;
  accessToken: string;
  createdAt: string; // ISO
};

const STORAGE_KEY = "ghostmail_address_history_v1";
const MAX_ENTRIES = 25;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadAddressHistory(): HistoryEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e) =>
          e &&
          typeof e.address === "string" &&
          typeof e.accessToken === "string" &&
          e.accessToken.length >= 16
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function saveAddressHistory(entries: HistoryEntry[]): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_ENTRIES))
    );
  } catch {
    // quota / private mode – ignore
  }
}

/** Prepend a newly created address; de-dupe by address (keep newest token). */
export function pushAddressHistory(entry: HistoryEntry): HistoryEntry[] {
  const existing = loadAddressHistory().filter(
    (e) => e.address.toLowerCase() !== entry.address.toLowerCase()
  );
  const next = [entry, ...existing].slice(0, MAX_ENTRIES);
  saveAddressHistory(next);
  return next;
}

export function removeAddressHistory(address: string): HistoryEntry[] {
  const next = loadAddressHistory().filter(
    (e) => e.address.toLowerCase() !== address.toLowerCase()
  );
  saveAddressHistory(next);
  return next;
}

export function clearAddressHistory(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
