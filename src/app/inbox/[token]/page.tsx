import type { Metadata } from "next";
import { InboxDashboard } from "@/components/inbox/inbox-dashboard";
import { APP_NAME } from "@/lib/constants";

type Props = {
  params: Promise<{ token: string }>;
};

export const metadata: Metadata = {
  title: `Inbox · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default async function InboxPage({ params }: Props) {
  const { token } = await params;
  return <InboxDashboard token={token} />;
}
