import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { APP_NAME } from "@/lib/constants";
import { safeRedirectPath } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: `Register · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function RegisterPage({ searchParams }: Props) {
  const sp = await searchParams;
  const nextPath = safeRedirectPath(sp.next, "/dashboard");
  return <AuthForm mode="register" nextPath={nextPath} />;
}
