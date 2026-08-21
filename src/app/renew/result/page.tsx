import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { requireActiveMember } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { ResultPoller } from "./ResultPoller";

export const metadata: Metadata = { title: "Payment" };

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const member = await requireActiveMember();
  const { ref } = await searchParams;

  if (!ref) redirect("/renew");

  return (
    <AppShell
      member={{
        firstName: member.firstName,
        lastName: member.lastName,
        avatarUrl: avatarUrl(member.userId, member.avatarPath),
      }}
    >
      <div className="max-w-sm mx-auto pt-6">
        <h1 className="text-xl font-semibold text-ink text-center mb-5">Payment</h1>
        <Card>
          <ResultPoller orderRef={ref} />
        </Card>
      </div>
    </AppShell>
  );
}
