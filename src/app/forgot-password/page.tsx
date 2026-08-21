import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { getSiteUrl } from "@/lib/supabase/env";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AppShell member={null}>
      <div className="max-w-sm mx-auto pt-6">
        <h1 className="text-xl font-semibold text-ink text-center mb-5">
          Reset your password
        </h1>
        <Card>
          <ForgotPasswordForm siteUrl={getSiteUrl()} />
        </Card>
      </div>
    </AppShell>
  );
}
