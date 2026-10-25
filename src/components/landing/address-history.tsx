"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Check, Trash2 } from "lucide-react";
import {
  loadAddressHistory,
  removeAddressHistory,
  type HistoryEntry,
} from "@/lib/client/address-history";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function AddressHistory() {
  const router = useRouter();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setEntries(loadAddressHistory());
    setHydrated(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === "ghostmail_address_history_v1") {
        setEntries(loadAddressHistory());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const copy = useCallback(async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(address);
      toast.success("Address copied");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Could not copy");
    }
  }, []);

  const openInbox = useCallback(
    (entry: HistoryEntry) => {
      router.push(`/inbox/${entry.accessToken}`);
    },
    [router]
  );

  const remove = useCallback((address: string) => {
    setEntries(removeAddressHistory(address));
    toast.success("Removed from this device");
  }, []);

  if (!hydrated) {
    return (
      <div className="mt-8 max-w-md mx-auto">
        <div className="h-16 rounded-lg bg-surface/40 border border-border-subtle animate-pulse" />
      </div>
    );
  }

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 max-w-md mx-auto text-left">
      <div className="flex items-baseline justify-between gap-3 mb-2 px-0.5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
          Recent
        </h2>
        <span className="text-[11px] text-muted">This device only</span>
      </div>

      <ul className="divide-y divide-border-subtle border-t border-b border-border-subtle">
        {entries.map((entry) => (
          <li
            key={entry.accessToken}
            className="group flex items-center gap-2 py-3 min-h-[52px]"
          >
            <button
              type="button"
              onClick={() => openInbox(entry)}
              className="flex-1 min-w-0 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <p className="text-sm font-mono text-foreground truncate">
                {entry.address}
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                {formatRelativeTime(entry.createdAt)}
              </p>
            </button>

            <div className="flex items-center shrink-0">
              <button
                type="button"
                onClick={() => copy(entry.address)}
                aria-label={`Copy ${entry.address}`}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted",
                  "hover:text-foreground hover:bg-surface transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                )}
              >
                {copied === entry.address ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => openInbox(entry)}
                className={cn(
                  "inline-flex h-9 items-center px-2.5 rounded-md text-xs font-medium",
                  "text-foreground-secondary hover:text-foreground hover:bg-surface transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                )}
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => remove(entry.address)}
                aria-label="Remove from history"
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted",
                  "hover:text-danger hover:bg-danger/10 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                )}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
