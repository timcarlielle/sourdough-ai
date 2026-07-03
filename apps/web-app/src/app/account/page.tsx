import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { AccountSettings } from "./AccountSettings";
import { BakeTimelineSettings } from "./BakeTimelineSettings";
import { ApiTokensSettings } from "./ApiTokensSettings";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <AppLayout>
      <h1 className="text-2xl font-semibold text-stone-800">Account</h1>
      <AccountSettings
        email={session.user.email}
        initialTimezone={session.user.timezone ?? "America/Edmonton"}
      />
      <BakeTimelineSettings />
      <ApiTokensSettings />
    </AppLayout>
  );
}
