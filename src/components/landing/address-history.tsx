"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Check, Trash2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Props = {
  /** When true, load owned mailboxes from the API (authoritative). */
  authenticated?: boolean;
};

type Row = {
  id?: string;
  address: string;
  accessToken?: string;
  createdAt: string;
};

export function AddressHistory({ authenticated = false }: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState<Row[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (authenticated) {
      try {
        const res = await fetch("/api/mailboxes");
        if (res.status === 401) {
          setEntries([]);
          setHydrated(true);
          return;
        }
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        const rows: Row[] = (data.mailboxes || []).map(
          (m: { id: string; address: string; createdAt: string }) => ({
            id: m.id,
            address: m.address,
            createdAt: m.createdAt,
          })
        );
        setEntries(rows);
      } catch {
        setEntries([]);
      } finally {
        setHydrated(true);
      }
      return;
    }

    // Unauthenticated: no actionable device history
    setEntries([]);
    setHydrated(true);
  }, [authenticated]);

  useEffect(() => {
    void load();
  }, [load]);

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
    async (entry: Row) => {
      if (entry.id) {
        try {
          const res = await fetch(`/api/mailboxes/${entry.id}`);
          if (res.status === 401) {
            router.push("/login?next=/dashboard");
            return;
          }
          if (!res.ok) {
            toast.error("Could not open inbox");
            return;
          }
          const data = await res.json();
          if (data.accessToken) {
            router.push(`/inbox/${data.accessToken}`);
            return;
          }
        } catch {
          toast.error("Could not open inbox");
        }
        return;
      }
      if (entry.accessToken) {
        router.push(`/inbox/${entry.accessToken}`);
      }
    },
    [router]
  );

  const remove = useCallback(async (entry: Row) => {
    if (!entry.id) return;
    try {
      const res = await fetch(`/api/mailboxes/${entry.id}`);
      if (!res.ok) {
        toast.error("Could not remove inbox");
        return;
      }
      const data = await res.json();
      if (!data.accessToken) {
        toast.error("Could not remove inbox");
        return;
      }
      const del = await fetch(`/api/inbox/${data.accessToken}`, {
        method: "DELETE",
      });
      if (!del.ok) {
        toast.error("Could not remove inbox");
        return;
      }
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      toast.success("Inbox deleted");
    } catch {
      toast.error("Could not remove inbox");
    }
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
          Your inboxes
        </h2>
        <span className="text-[11px] text-muted">Synced to your account</span>
      </div>

      <ul className="divide-y divide-border-subtle border-t border-b border-border-subtle">
        {entries.map((entry) => (
          <li
            key={entry.id || entry.address}
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
                onClick={() => remove(entry)}
                aria-label="Delete inbox"
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
