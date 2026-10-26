"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coins, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Pkg = {
  id: string;
  coins: number;
  priceNgn: number;
  label: string;
  priceDisplay: string;
  perCoinDisplay: string;
};

type Tx = {
  id: string;
  type: string;
  coins: number;
  amountKobo: number | null;
  currency: string | null;
  status: string;
  reference: string;
  createdAt: string;
};

type Props = {
  returnReference: string | null;
  paymentReturn: boolean;
};

export function BillingClient({ returnReference, paymentReturn }: Props) {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [paystackConfigured, setPaystackConfigured] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/wallet");
      if (res.status === 401) {
        router.replace("/login?next=/billing");
        return;
      }
      if (!res.ok) throw new Error("Failed to load wallet");
      const data = await res.json();
      setBalance(data.balance);
      setPackages(data.packages || []);
      setTransactions(data.transactions || []);
      setPaystackConfigured(Boolean(data.paystackConfigured));
    } catch {
      toast.error("Could not load billing");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!paymentReturn || !returnReference) return;
    let cancelled = false;
    (async () => {
      setVerifying(true);
      try {
        const res = await fetch("/api/billing/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: returnReference }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.ok) {
          toast.success(
            data.alreadyProcessed
              ? "Payment already applied"
              : `Added ${data.coins} Veil Coins`
          );
          setBalance(data.balance);
          await load();
        } else {
          toast.error(data.error || "Payment could not be verified");
        }
      } catch {
        if (!cancelled) toast.error("Verification failed");
      } finally {
        if (!cancelled) {
          setVerifying(false);
          router.replace("/billing");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentReturn, returnReference, load, router]);

  const buy = async (packageId: string) => {
    setBuying(packageId);
    try {
      const res = await fetch("/api/billing/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not start payment");
        return;
      }
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
        return;
      }
      toast.error("No checkout URL returned");
    } catch {
      toast.error("Network error");
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border-subtle bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <Logo size="sm" />
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/dashboard"
              className="px-3 py-1.5 text-foreground-secondary hover:text-foreground"
            >
              Dashboard
            </Link>
            <Link
              href="/account"
              className="px-3 py-1.5 text-foreground-secondary hover:text-foreground"
            >
              Account
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 py-8 sm:py-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
            <p className="mt-1 text-sm text-foreground-secondary">
              Buy Veil Coins. Each new email address costs 1 coin. Existing
              inboxes stay free to use.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface px-5 py-4 min-w-[10rem]">
            <p className="text-[11px] uppercase tracking-wide text-muted">
              Balance
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums flex items-center gap-2">
              <Coins className="h-5 w-5 text-accent" />
              {loading ? "…" : balance ?? 0}
              <span className="text-sm font-normal text-muted">coins</span>
            </p>
          </div>
        </div>

        {verifying && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground-secondary">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Confirming your payment…
          </div>
        )}

        {!paystackConfigured && (
          <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
            Payments are not configured. An administrator must set
            PAYSTACK_SECRET_KEY.
          </div>
        )}

        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">
          Packages
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-10">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="rounded-xl border border-border bg-surface p-5 flex flex-col"
            >
              <p className="text-lg font-semibold">{pkg.coins} coins</p>
              <p className="mt-1 text-2xl font-semibold text-accent tabular-nums">
                {pkg.priceDisplay}
              </p>
              <p className="mt-1 text-xs text-muted">
                {pkg.perCoinDisplay} per coin
              </p>
              <Button
                className="mt-4 w-full text-[#050A14]"
                disabled={!!buying || !paystackConfigured}
                isLoading={buying === pkg.id}
                onClick={() => buy(pkg.id)}
              >
                Buy {pkg.coins}
              </Button>
            </div>
          ))}
        </div>

        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">
          History
        </h2>
        {loading ? (
          <div className="h-24 rounded-lg bg-surface/50 animate-pulse" />
        ) : transactions.length === 0 ? (
          <p className="text-sm text-foreground-secondary py-6 border-t border-border-subtle">
            No transactions yet.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle border-t border-b border-border-subtle">
            {transactions.map((t) => (
              <li
                key={t.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium capitalize">
                    {t.type}
                    <span
                      className={cn(
                        "ml-2 text-xs font-normal",
                        t.status === "success"
                          ? "text-success"
                          : t.status === "pending"
                            ? "text-warning"
                            : "text-danger"
                      )}
                    >
                      {t.status}
                    </span>
                  </p>
                  <p className="text-xs text-muted font-mono truncate">
                    {t.reference}
                  </p>
                </div>
                <div className="text-sm tabular-nums text-right">
                  <p
                    className={
                      t.coins > 0 ? "text-success" : "text-foreground-secondary"
                    }
                  >
                    {t.coins > 0 ? "+" : ""}
                    {t.coins} coins
                  </p>
                  {t.amountKobo != null && (
                    <p className="text-xs text-muted">
                      ₦{(t.amountKobo / 100).toLocaleString("en-NG", {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  )}
                  <p className="text-[11px] text-muted">
                    {new Date(t.createdAt).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 text-xs text-muted flex items-start gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent" />
          Coins are credited only after Paystack confirms payment. Opening an
          existing inbox never costs a coin.
        </p>
      </main>
    </div>
  );
}
