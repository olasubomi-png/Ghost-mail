import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Forgot password · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <AuthForm mode="forgot" />;
}
