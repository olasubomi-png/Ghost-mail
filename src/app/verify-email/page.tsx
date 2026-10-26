import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { APP_NAME } from "@/lib/constants";
import { verifyEmailToken } from "@/lib/auth/verify-email";

export const metadata: Metadata = {
  title: `Verify email · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function VerifyEmailPage({ searchParams }: Props) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";

  const result = await verifyEmailToken(token);

  let title = "Email verification";
  let body = "";
  let tone: "ok" | "error" | "muted" = "muted";

  if (result.ok) {
    title = "Email verified";
    body =
      "Your email is confirmed. You can sign in and create mailboxes on your account.";
    tone = "ok";
  } else if (result.reason === "missing") {
    title = "Invalid verification link";
    body =
      "This link is missing a verification token. Open the link from your email, or request a new account if needed.";
    tone = "error";
  } else if (result.reason === "invalid") {
    title = "Link expired or already used";
    body =
      "This verification link is invalid, expired, or has already been used. Sign in if you already verified, or register again if the link is too old.";
    tone = "error";
  } else {
    title = "Something went wrong";
    body =
      "We could not verify your email right now. Please try the link again in a moment.";
    tone = "error";
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <Logo />
      <div className="mt-8 w-full max-w-sm text-center space-y-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p
          className={
            tone === "ok"
              ? "text-sm text-success leading-relaxed"
              : tone === "error"
                ? "text-sm text-danger leading-relaxed"
                : "text-sm text-foreground-secondary leading-relaxed"
          }
        >
          {body}
        </p>
        <div className="flex flex-col gap-2 pt-2">
          {result.ok ? (
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-accent px-5 text-sm font-medium text-[#050A14] hover:bg-accent-hover transition-colors"
            >
              Sign in
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-accent px-5 text-sm font-medium text-[#050A14] hover:bg-accent-hover transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-border px-5 text-sm font-medium text-foreground hover:bg-surface transition-colors"
              >
                Create account
              </Link>
            </>
          )}
          <Link
            href="/"
            className="text-xs text-muted hover:text-foreground transition-colors pt-2"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
