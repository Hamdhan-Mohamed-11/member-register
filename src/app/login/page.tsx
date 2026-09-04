import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { getSessionMember } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  // Already signed in? Nothing to do here.
  if (await getSessionMember()) redirect("/feed");

  return (
    <AppShell signedOut>
      <div className="max-w-sm mx-auto pt-4 sm:pt-10">
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl sm:text-3xl text-ink">Welcome back</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Log in to your Pick a Book account.
          </p>
        </div>
        <Card>
          {/* LoginForm calls useSearchParams(), which requires a Suspense
              boundary or the whole route opts out of static rendering. */}
          <Suspense fallback={<div className="h-64" />}>
            <LoginForm />
          </Suspense>
        </Card>
      </div>
    </AppShell>
  );
}
