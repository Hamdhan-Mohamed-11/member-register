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
    <AppShell member={null}>
      <div className="max-w-sm mx-auto pt-6">
        <h1 className="text-xl font-semibold text-ink text-center mb-5">
          Log in to Pick a Book
        </h1>
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
