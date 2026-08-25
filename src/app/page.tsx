import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { buttonClassName } from "@/components/ui/Button";
import { getSessionMember } from "@/lib/auth/session";

const FEATURES = [
  {
    title: "Your reading, in one place",
    body: "What you're reading now, what's next, and everything you've finished.",
  },
  {
    title: "Sessions and points",
    body: "Turn up, present a book, earn points. Recorded as the session happens.",
  },
  {
    title: "25% off every book",
    body: "The full Pick a Book catalogue at member prices, plus the lending library.",
  },
];

export default async function Home() {
  // A signed-in member has no use for the sales pitch.
  if (await getSessionMember()) redirect("/feed");

  return (
    <AppShell member={null}>
      <div className="max-w-3xl mx-auto">
        <section className="text-center pt-10 pb-12">
          {/*
            An inline SVG rather than an image: nothing to load, scales cleanly,
            and cannot look dated. Kept small — restraint is what reads as
            professional here.
          */}
          <div
            aria-hidden="true"
            className="mx-auto mb-7 w-12 h-12 rounded-xl bg-brand-600 shadow-hero grid place-items-center"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6"
            >
              <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
              <path d="M8 4v16" />
            </svg>
          </div>

          <h1 className="text-4xl sm:text-5xl font-semibold text-ink leading-[1.08]">
            Everything your book
            <span className="block text-brand-600">club does, in one place</span>
          </h1>

          <p className="mt-5 text-ink-muted text-base sm:text-lg max-w-lg mx-auto leading-relaxed">
            Track your reading, join sessions, earn points for taking part, and
            buy or borrow books at a member discount.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/join" className={buttonClassName("primary")}>
              Join a club
            </Link>
            <Link href="/login" className={buttonClassName("secondary")}>
              Log in
            </Link>
          </div>
        </section>

        {/*
          A hairline divider instead of a section break. On a near-white page,
          a rule does the separating work a background colour would, without
          introducing a second surface.
        */}
        <div className="h-px bg-line" />

        <section className="grid gap-px sm:grid-cols-3 bg-line border-x border-b border-line rounded-b-card overflow-hidden">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-surface p-5">
              <h2 className="text-[15px] font-semibold text-ink leading-snug">
                {f.title}
              </h2>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 text-center">
          <p className="text-sm text-ink-muted">
            Already invited by your employer?{" "}
            <span className="text-ink">
              Check your email for a link to set your password.
            </span>
          </p>
        </section>

        <p className="text-center text-xs text-ink-faint mt-10 pb-4">
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
