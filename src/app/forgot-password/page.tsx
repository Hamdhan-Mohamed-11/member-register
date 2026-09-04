import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AppShell signedOut>
      <div className="max-w-sm mx-auto pt-4 sm:pt-10">
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl sm:text-3xl text-ink">
            Reset your password
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            We&apos;ll email you a link to set a new one.
          </p>
        </div>
        <Card>
          <ForgotPasswordForm />
        </Card>
      </div>
    </AppShell>
  );
}
