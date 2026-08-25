import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { buttonClassName } from "@/components/ui/Button";
import { getSessionMember } from "@/lib/auth/session";

const FEATURES = [
  {
    title: "Your reading, in one place",
    body: "Keep track of what you're reading now, what's next, and everything you've finished.",
  },
  {
    title: "Sessions and points",
    body: "Turn up, present a book, earn points. Your club secretary records it as it happens.",
  },
  {
    title: "25% off every book",
    body: "The whole Pick a Book catalogue at member prices, plus the lending library.",
  },
];

export default async function Home() {
  // A signed-in member has no use for the sales pitch.
  if (await getSessionMember()) redirect("/feed");

  return (
    <AppShell member={null}>
      <div className="max-w-2xl mx-auto">
        <section className="text-center pt-8 pb-10">
          {/*
            A small piece of ornament rather than a stock illustration: it
            costs nothing to load, scales cleanly, and cannot look dated.
          */}
          <div
            aria-hidden="true"
            className="mx-auto mb-6 w-14 h-14 rounded-2xl bg-brand-600 shadow-hero grid place-items-center"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-accent-500)"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-7 h-7"
            >
              <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
              <path d="M8 4v16" />
            </svg>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl text-ink leading-[1.1]">
            The Pick a Book
            <span className="block text-brand-600">member portal</span>
          </h1>

          <p className="mt-4 text-ink-muted text-base sm:text-lg max-w-md mx-auto">
            Track what you&apos;re reading, see your club&apos;s sessions, earn
            points for taking part, and borrow or buy books at a member
            discount.
          </p>

          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/login" className={buttonClassName("primary")}>
              Log in
            </Link>
            <Link href="/join" className={buttonClassName("secondary")}>
              Join a club
            </Link>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-surface border border-line rounded-card p-4 shadow-card"
            >
              <h2 className="font-display text-base text-ink leading-snug">
                {f.title}
              </h2>
              <p className="text-sm text-ink-muted mt-1.5">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-4 rounded-card border border-accent-300 bg-accent-100 p-4 text-center">
          <p className="text-sm text-ink">
            Already a member of a company club? Look for your invite email — it
            has a link to set your password.
          </p>
        </section>

        <p className="text-center text-xs text-ink-faint mt-8 pb-4">
          Part of{" "}
          <a
            href="https://www.pickabook.lk"
            className="text-brand-600 hover:underline"
            rel="noopener"
          >
            pickabook.lk
          </a>
        </p>
      </div>
    </AppShell>
  );
}
