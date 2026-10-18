import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Reset password · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ token?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;
  if (!token || token.length < 16) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-sm text-muted">
        Invalid or missing reset link.
      </div>
    );
  }
  return <AuthForm mode="reset" resetToken={token} />;
}
