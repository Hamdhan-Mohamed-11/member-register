import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { AuthLayout } from "@/components/shell/AuthLayout";
import { getSessionMember } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  // Already signed in? Nothing to do here.
  if (await getSessionMember()) redirect("/home");

  return (
    <AppShell signedOut wide>
      <AuthLayout
        title="Welcome back"
        subtitle="Log in to your Pick a Book account."
      >
        {/* LoginForm calls useSearchParams(), which requires a Suspense
            boundary or the whole route opts out of static rendering. */}
        <Suspense fallback={<div className="h-64" />}>
          <LoginForm />
        </Suspense>
      </AuthLayout>
    </AppShell>
  );
}
