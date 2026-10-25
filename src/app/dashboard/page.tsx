import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth/session";
import { loginUrl } from "@/lib/auth/redirect";
import DashboardClient from "@/components/dashboard/dashboard-client";

export const metadata: Metadata = {
  title: `Dashboard · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(loginUrl("/dashboard"));
  }
  return <DashboardClient />;
}
