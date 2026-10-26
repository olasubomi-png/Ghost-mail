import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth/session";
import { loginUrl } from "@/lib/auth/redirect";
import { BillingClient } from "@/components/billing/billing-client";

export const metadata: Metadata = {
  title: `Billing · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ payment?: string; ref?: string }>;
};

export default async function BillingPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(loginUrl("/billing"));
  }
  const sp = await searchParams;
  return (
    <BillingClient
      returnReference={typeof sp.ref === "string" ? sp.ref : null}
      paymentReturn={sp.payment === "return"}
    />
  );
}
