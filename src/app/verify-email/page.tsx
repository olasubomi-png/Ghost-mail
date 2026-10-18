"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

function VerifyInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    if (!token || token.length < 16) {
      setStatus("error");
      setMessage("Invalid verification link.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setStatus("error");
          setMessage(data.error || "Invalid or expired link.");
          return;
        }
        setStatus("ok");
        setMessage("Email verified. You can use your account fully.");
        setTimeout(() => router.push("/dashboard"), 1500);
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Network error. Please try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <Logo />
      <div className="mt-8 max-w-sm text-center space-y-4">
        <h1 className="text-xl font-semibold">Email verification</h1>
        <p className="text-sm text-foreground-secondary">{message}</p>
        {status !== "loading" && (
          <Button variant="secondary" onClick={() => router.push("/dashboard")}>
            Go to dashboard
          </Button>
        )}
        <p className="text-xs text-muted">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-muted">
          Loading…
        </div>
      }
    >
      <VerifyInner />
    </Suspense>
  );
}
