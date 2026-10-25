"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";

type Mode = "login" | "register" | "forgot" | "reset";

export function AuthForm({
  mode,
  resetToken,
}: {
  mode: Mode;
  resetToken?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Registration failed");
          return;
        }
        toast.success("Account created");
        if (!data.verificationEmailSent) {
          toast.message("Check setup: verification email may need RESEND_API_KEY");
        }
        router.push("/dashboard");
        return;
      }

      if (mode === "login") {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Login failed");
          return;
        }
        toast.success("Signed in");
        router.push("/dashboard");
        return;
      }

      if (mode === "forgot") {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        toast.success(
          data.message ||
            "If an account exists, a reset link has been sent."
        );
        return;
      }

      if (mode === "reset") {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: resetToken, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Reset failed");
          return;
        }
        toast.success("Password updated. Please sign in.");
        router.push("/login");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }

  const titles: Record<Mode, string> = {
    login: "Sign in",
    register: "Create account",
    forgot: "Reset password",
    reset: "Choose a new password",
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {titles[mode]}
          </h1>
          <p className="text-sm text-foreground-secondary">
            Permanent mailboxes tied to your VeilMail account.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-border bg-surface/80 p-6 space-y-4 shadow-xl shadow-black/30"
        >
          {(mode === "login" || mode === "register" || mode === "forgot") && (
            <div>
              <label htmlFor="email" className="text-xs font-medium text-foreground-secondary">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5"
                placeholder="you@example.com"
              />
            </div>
          )}

          {(mode === "login" || mode === "register" || mode === "reset") && (
            <div>
              <label htmlFor="password" className="text-xs font-medium text-foreground-secondary">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5"
                placeholder={mode === "login" ? "Your password" : "At least 8 characters"}
              />
              {(mode === "register" || mode === "reset") && (
                <p className="mt-1.5 text-[11px] text-muted">
                  Use at least 8 characters with a letter and a number.
                </p>
              )}
            </div>
          )}

          <Button type="submit" className="w-full" isLoading={loading}>
            {mode === "login" && "Sign in"}
            {mode === "register" && "Create account"}
            {mode === "forgot" && "Send reset link"}
            {mode === "reset" && "Update password"}
          </Button>

          <div className="text-center text-xs text-foreground-secondary space-y-1.5 pt-1">
            {mode === "login" && (
              <>
                <p>
                  <Link href="/forgot-password" className="text-accent hover:underline">
                    Forgot password?
                  </Link>
                </p>
                <p>
                  No account?{" "}
                  <Link href="/register" className="text-accent hover:underline">
                    Register
                  </Link>
                </p>
              </>
            )}
            {mode === "register" && (
              <p>
                Already have an account?{" "}
                <Link href="/login" className="text-accent hover:underline">
                  Sign in
                </Link>
              </p>
            )}
            {(mode === "forgot" || mode === "reset") && (
              <p>
                <Link href="/login" className="text-accent hover:underline">
                  Back to sign in
                </Link>
              </p>
            )}
          </div>
        </form>

        <p className="text-center text-xs text-muted">
          <Link href="/" className="hover:text-foreground transition-colors">
            ← Back to VeilMail
          </Link>
        </p>
      </div>
    </div>
  );
}
