import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { InboxDashboard } from "@/components/inbox/inbox-dashboard";
import { APP_NAME } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth/session";
import { getInboxByToken, canAccessInbox } from "@/lib/db/inboxes";
import { loginUrl } from "@/lib/auth/redirect";

type Props = {
  params: Promise<{ token: string }>;
};

export const metadata: Metadata = {
  title: `Inbox · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default async function InboxPage({ params }: Props) {
  const { token } = await params;
  if (!token || token.length < 16) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect(loginUrl(`/inbox/${token}`));
  }

  const inbox = await getInboxByToken(token);
  if (!inbox || !canAccessInbox(inbox, { token, userId: user.id })) {
    // Do not leak existence of other users' inboxes
    notFound();
  }

  return <InboxDashboard token={token} />;
}
