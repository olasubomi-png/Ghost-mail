import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth/session";
import { loginUrl } from "@/lib/auth/redirect";
import AccountClient from "@/components/account/account-client";

export const metadata: Metadata = {
  title: `Account · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(loginUrl("/account"));
  }
  return <AccountClient />;
}
