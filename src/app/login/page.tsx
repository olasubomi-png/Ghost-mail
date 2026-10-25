import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { APP_NAME } from "@/lib/constants";
import { safeRedirectPath } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: `Sign in · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const nextPath = safeRedirectPath(sp.next, "/dashboard");
  return <AuthForm mode="login" nextPath={nextPath} />;
}
