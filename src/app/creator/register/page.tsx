import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreatorShell } from "@/components/creator/CreatorShell";
import { Card } from "@/components/ui/Card";
import { getSessionMember, isAdmin, isCreator } from "@/lib/auth/session";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Register as an author or publisher" };

export default async function CreatorRegisterPage() {
  // Signed out is fine: the form creates the account and registers it in one
  // go. An author has no club to join, so /join is not their way in.
  const session = await getSessionMember();
  // Already one: their portal, not this form.
  if (session && isCreator(session)) redirect("/creator");
  // Staff cannot be creators -- register_creator refuses it, and sending them
  // to a form that will fail is worse than sending them back to their work.
  if (session && isAdmin(session)) redirect("/admin");

  return (
    <CreatorShell nav={false}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-4">
          <h1 className="page-title font-display text-2xl text-ink sm:text-3xl">
            Sell your books through Pick a Book
          </h1>
          <p className="text-sm text-ink-muted">
            Members buy through the club, at the club&apos;s member price. You
            see every sale as it happens.
          </p>
        </div>

        <Card>
          <RegisterForm signedIn={session != null} />
        </Card>
      </div>
    </CreatorShell>
  );
}
