import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { AuthLayout } from "@/components/shell/AuthLayout";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AppShell signedOut wide>
      <AuthLayout
        title="Reset your password"
        subtitle="We'll email you a link to set a new one."
      >
        <ForgotPasswordForm />
      </AuthLayout>
    </AppShell>
  );
}
