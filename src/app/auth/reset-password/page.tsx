import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AppShell signedOut>
      <div className="max-w-sm mx-auto pt-4 sm:pt-10">
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl sm:text-3xl text-ink">
            Choose a new password
          </h1>
        </div>
        <Card>
          <SetPasswordForm submitLabel="Save password" redirectTo="/feed" />
        </Card>
      </div>
    </AppShell>
  );
}
