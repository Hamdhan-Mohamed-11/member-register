import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";

export const metadata: Metadata = { title: "Set up your account" };

export default function AcceptInvitePage() {
  return (
    <AppShell member={null}>
      <div className="max-w-sm mx-auto pt-6">
        <h1 className="font-display text-2xl text-ink text-center">
          Welcome to Pick a Book
        </h1>
        <p className="text-sm text-ink-muted text-center mt-2 mb-5">
          Pick a password and your account is ready.
        </p>
        <Card>
          <SetPasswordForm submitLabel="Set password and continue" redirectTo="/feed" />
        </Card>
      </div>
    </AppShell>
  );
}
