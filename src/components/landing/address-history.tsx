"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Check, Inbox, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  loadAddressHistory,
  removeAddressHistory,
  type HistoryEntry,
} from "@/lib/client/address-history";
import { formatRelativeTime } from "@/lib/utils";

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
      <div className="mt-10 max-w-xl mx-auto">
        <div className="h-24 rounded-xl bg-surface/50 border border-border-subtle animate-pulse" />
      </div>
    );
  }

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="mt-10 max-w-xl mx-auto text-left animate-fade-in">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-sm font-medium text-foreground-secondary flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          Recent addresses
        </h2>
        <span className="text-[11px] text-muted">Stored on this device only</span>
      </div>
      <ul className="rounded-xl border border-border bg-surface/60 divide-y divide-border-subtle overflow-hidden">
        {entries.map((entry) => (
          <li
            key={entry.accessToken}
            className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 hover:bg-surface-elevated/60 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate font-mono">
                {entry.address}
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                Created {formatRelativeTime(entry.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => copy(entry.address)}
                aria-label={`Copy ${entry.address}`}
              >
                {copied === entry.address ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => openInbox(entry)}
              >
                <Inbox className="h-3.5 w-3.5" />
                Open
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted hover:text-danger"
                onClick={() => remove(entry.address)}
                aria-label="Remove from history"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
