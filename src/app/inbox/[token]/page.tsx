import { InboxDashboard } from "@/components/inbox/inbox-dashboard";

type Props = {
  params: Promise<{ token: string }>;
};

export default async function InboxPage({ params }: Props) {
  const { token } = await params;
  return <InboxDashboard token={token} />;
}
