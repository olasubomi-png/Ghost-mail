"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Copy,
  Check,
  Inbox,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  Mail,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRelativeTime } from "@/lib/utils";

type Mailbox = {
  id: string;
  address: string;
  createdAt: string;
};

type User = {
  id: string;
  email: string;
  emailVerified: boolean;
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [custom, setCustom] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const me = await fetch("/api/auth/me");
      if (!me.ok) {
        router.replace("/login");
        return;
      }
      const meData = await me.json();
      setUser(meData.user);

      const res = await fetch("/api/mailboxes");
      if (!res.ok) throw new Error("Failed to load mailboxes");
      const data = await res.json();
      setMailboxes(data.mailboxes || []);
    } catch {
      toast.error("Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const createMailbox = async (localPart?: string) => {
    setCreating(true);
    try {
      const res = await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localPart ? { localPart } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not create mailbox");
        return;
      }
      toast.success("Mailbox created", { description: data.address });
      setCustom("");
      await load();
    } catch {
      toast.error("Network error");
    } finally {
      setCreating(false);
    }
  };

  const openMailbox = async (id: string) => {
    try {
      const res = await fetch(`/api/mailboxes/${id}`);
      if (!res.ok) {
        toast.error("Could not open mailbox");
        return;
      }
      const data = await res.json();
      if (data.accessToken) {
        router.push(`/inbox/${data.accessToken}`);
      }
    } catch {
      toast.error("Network error");
    }
  };

  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(address);
      toast.success("Address copied");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between gap-3">
          <Logo />
          <div className="flex items-center gap-1.5">
            <Link
              href="/account"
              aria-label="Account settings"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground-secondary hover:bg-surface-elevated hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </Link>
            <Button variant="ghost" size="sm" onClick={logout} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your mailboxes</h1>
          <p className="mt-1 text-sm text-foreground-secondary">
            Signed in as{" "}
            <span className="text-foreground">{user?.email}</span>
            {!user?.emailVerified && (
              <span className="ml-2 text-warning text-xs">
                Email not verified
              </span>
            )}
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-surface/60 p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Plus className="h-4 w-4 text-accent" />
            Create permanent address
          </h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="custom-name (optional)"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={() => createMailbox(custom.trim() || undefined)}
              isLoading={creating}
            >
              Create
            </Button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => createMailbox()}
            disabled={creating}
          >
            Generate random address
          </Button>
        </section>

        <section className="space-y-3">
          {mailboxes.length === 0 ? (
            <div className="rounded-2xl border border-border-subtle bg-surface/40 px-6 py-12 text-center">
              <Mail className="h-8 w-8 mx-auto text-muted mb-3" />
              <p className="text-sm font-medium">No mailboxes yet</p>
              <p className="mt-1 text-xs text-muted max-w-xs mx-auto">
                Create an address to receive mail. Owned addresses work across
                devices while you are signed in.
              </p>
            </div>
          ) : (
            <ul className="rounded-2xl border border-border divide-y divide-border-subtle overflow-hidden">
              {mailboxes.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3.5 bg-surface/50 hover:bg-surface-elevated/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm truncate text-accent">
                      {m.address}
                    </p>
                    <p className="text-[11px] text-muted mt-0.5">
                      Created {formatRelativeTime(m.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyAddress(m.address)}
                      aria-label="Copy address"
                    >
                      {copied === m.address ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openMailbox(m.id)}
                    >
                      <Inbox className="h-3.5 w-3.5" />
                      Open
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-muted text-center">
          Guest temporary addresses on the{" "}
          <Link href="/" className="text-accent hover:underline">
            home page
          </Link>{" "}
          still work without an account.
        </p>
      </main>
    </div>
  );
}
