"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

type User = {
  id: string;
  email: string;
  emailVerified: boolean;
};

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      setUser(data.user);
      setLoading(false);
    })();
  }, [router]);

  const deleteAccount = async () => {
    if (
      !confirm(
        "Delete your account? Owned mailboxes will be detached. This cannot be undone."
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/account", { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete account");
        return;
      }
      toast.success("Account deleted");
      router.push("/");
    } catch {
      toast.error("Network error");
    } finally {
      setDeleting(false);
    }
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
      <header className="border-b border-border bg-surface/90">
        <div className="mx-auto max-w-lg px-4 h-14 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground-secondary hover:bg-surface-elevated"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Logo />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-lg px-4 py-8 space-y-6">
        <h1 className="text-2xl font-semibold">Account settings</h1>

        <div className="rounded-2xl border border-border bg-surface/60 p-5 space-y-3">
          <div>
            <p className="text-xs text-muted">Email</p>
            <p className="text-sm font-medium mt-0.5">{user?.email}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Verification</p>
            <p className="text-sm mt-0.5">
              {user?.emailVerified ? (
                <span className="text-success">Verified</span>
              ) : (
                <span className="text-warning">Not verified</span>
              )}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-5 space-y-3">
          <h2 className="text-sm font-medium text-danger">Danger zone</h2>
          <p className="text-xs text-foreground-secondary">
            Deleting your account signs you out, soft-deletes the user record,
            and detaches owned mailboxes (they become anonymous). Messages are
            not mass-deleted automatically.
          </p>
          <Button
            variant="danger"
            onClick={deleteAccount}
            isLoading={deleting}
          >
            Delete account
          </Button>
        </div>
      </main>
    </div>
  );
}
