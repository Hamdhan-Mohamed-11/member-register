import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { requireActiveMember } from "@/lib/auth/session";
import { ResultPoller } from "./ResultPoller";

export const metadata: Metadata = { title: "Payment" };

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  await requireActiveMember();
  const { ref } = await searchParams;

  if (!ref) redirect("/renew");

  return (
    <AppShell>
      <div className="max-w-sm mx-auto pt-6">
        <h1 className="font-display text-2xl sm:text-3xl text-ink text-center mb-5">Payment</h1>
        <Card>
          <ResultPoller orderRef={ref} />
        </Card>
      </div>
    </AppShell>
  );
}
