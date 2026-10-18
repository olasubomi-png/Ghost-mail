import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Register · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
