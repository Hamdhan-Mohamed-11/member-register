import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AppShell member={null}>
      <div className="max-w-sm mx-auto pt-6">
        <h1 className="font-display text-2xl text-ink text-center mb-5">
          Choose a new password
        </h1>
        <Card>
          <SetPasswordForm submitLabel="Save password" redirectTo="/feed" />
        </Card>
      </div>
    </AppShell>
  );
}
