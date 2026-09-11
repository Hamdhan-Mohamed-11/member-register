import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { buttonClassName } from "@/components/ui/Button";
import { getSessionMember } from "@/lib/auth/session";

/**
 * The signed-out landing page.
 *
 * Structure follows the pattern the design pass recommended for a membership
 * product — hero, what it solves, what you get, proof, close — but the palette
 * comes from the brand guideline rather than the generic one that search
 * returned: #293896 and #00AEEF, Poppins for interface, Playfair for display.
 *
 * Motion is CSS only (`.reveal`, `.stagger` in globals.css). A scroll-triggered
 * library would mean shipping client JavaScript to the one page that currently
 * needs none, and the whole page is short enough that on-load reveals read
 * correctly anyway. Everything collapses under prefers-reduced-motion.
 */

function Icon({ name }: { name: "book" | "calendar" | "star" | "tag" | "users" | "heart" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "size-5",
    "aria-hidden": true,
  };
  switch (name) {
    case "book":
      return (
        <svg {...common}>
          <path d="M12 6.5S9.5 4.8 6 5.2v12c3.5-.4 6 1.3 6 1.3s2.5-1.7 6-1.3v-12c-3.5-.4-6 1.3-6 1.3z" />
          <path d="M12 6.5v12" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="4" y="5.5" width="16" height="14" rx="2" />
          <path d="M4 10h16M9 3.5v4M15 3.5v4" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="m12 4.5 2.3 4.9 5.2.7-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2L4.5 10l5.2-.7z" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9.5" cy="8.5" r="3.2" />
          <path d="M3.5 19.5a6 6 0 0 1 12 0M16 6.2a3.2 3.2 0 0 1 0 6.1M17.5 14.4a6 6 0 0 1 3 5.1" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common}>
          <path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8.4a3.8 3.8 0 0 1 7 2.4c0 4.8-7 9.2-7 9.2z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M4 11.5V5.5a1.5 1.5 0 0 1 1.5-1.5h6l8 8-7.5 7.5z" />
          <circle cx="8.5" cy="8.5" r="1.2" />
        </svg>
      );
  }
}

const BENEFITS = [
  {
    icon: "book" as const,
    title: "Track your reading",
    body: "Everything you're reading, want to read, or have finished — in one place.",
  },
  {
    icon: "calendar" as const,
    title: "Join club sessions",
    body: "Book a seat, turn up, and discuss the book with people who read it too.",
  },
  {
    icon: "star" as const,
    title: "Earn points and badges",
    body: "Attending, presenting and reading all count. So does turning up every month.",
  },
  {
    icon: "tag" as const,
    title: "25% off every book",
    body: "Member pricing across the whole Pick a Book catalogue, all year.",
  },
  {
    icon: "users" as const,
    title: "Borrow, don't buy",
    body: "Add borrowing to your membership and take books home from the library.",
  },
  {
    icon: "heart" as const,
    title: "Give while you read",
    body: "A share of every book you buy sends books to Sri Lankan schools.",
  },
];

const STEPS = [
  { n: "01", title: "Pick a club", body: "Choose one that fits — by city, by interest, or through your employer." },
  { n: "02", title: "Read the book", body: "One book a cycle. Read it, research it, form a view." },
  { n: "03", title: "Present and discuss", body: "Share what you found. That is where the reading turns into something." },
];

export default async function Home() {
  // A signed-in member has no use for the sales pitch.
  if (await getSessionMember()) redirect("/feed");

  return (
    <AppShell signedOut wide>
      <div className="max-w-5xl mx-auto space-y-4 pb-8">
        {/* ---- Hero ------------------------------------------------------ */}
        <section className="reveal relative overflow-hidden rounded-panel bg-brand-900 shadow-band">
          {/*
            The brand's two blues as a field rather than a flat block. Radial
            rather than linear so the light blue reads as a glow behind the
            words instead of a band across them — a hard diagonal split is the
            thing that makes a gradient look like a template.
          */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(1100px 520px at 78% -10%, rgba(0,174,239,0.55), transparent 62%), radial-gradient(680px 420px at 8% 110%, rgba(0,174,239,0.20), transparent 60%)",
            }}
          />

          <div className="relative px-6 sm:px-10 py-12 sm:py-16 max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full rounded-full bg-sky-300 opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex size-1.5 rounded-full bg-sky-300" />
              </span>
              Pick a Book members
            </span>

            <h1 className="mt-5 font-display text-4xl sm:text-[3.25rem] leading-[1.05] text-white">
              A life without books is{" "}
              <em className="italic text-sky-300">an unfulfilled life.</em>
            </h1>

            <p className="mt-5 max-w-lg leading-relaxed text-on-navy-muted">
              Pick a book, read it properly, and tell the room what you found.
              This is where your club, your reading and your progress live.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/join"
                className="press inline-flex min-h-12 items-center rounded-lg bg-sky-500 px-6 font-medium text-brand-950 shadow-hero transition-colors hover:bg-sky-300"
              >
                Join a club
              </Link>
              <Link
                href="/login"
                className="press inline-flex min-h-12 items-center rounded-lg border border-white/30 px-6 font-medium text-white transition-colors hover:bg-white/10"
              >
                Log in
              </Link>
            </div>

            <p className="mt-6 text-sm text-on-navy-muted">
              Invited by your employer? Check your email for a link to set your
              password.
            </p>
          </div>
        </section>

        {/* ---- What it is ------------------------------------------------- */}
        <section className="rounded-panel border border-cream-deep bg-cream px-6 sm:px-10 py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
            How it works
          </p>
          <span className="mt-2.5 block h-0.5 w-10 bg-sky-500" aria-hidden />

          <h2 className="mt-5 font-display text-2xl sm:text-3xl leading-[1.15] text-ink">
            Reading, then saying something about it.
          </h2>
          <p className="mt-3 max-w-xl leading-relaxed text-ink-muted">
            Every member picks a book, reads and researches it, and presents a
            summary. It builds the reading habit and the confidence to speak at
            the same time.
          </p>

          <ol className="stagger mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step) => (
              <li
                key={step.n}
                className="rounded-card border border-cream-deep bg-surface/70 p-5"
              >
                <span className="font-display text-2xl text-sky-600">{step.n}</span>
                <h3 className="mt-2 font-medium text-ink">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---- What you get ----------------------------------------------- */}
        <section className="rounded-panel border border-line bg-surface px-6 sm:px-10 py-10">
          <h2 className="font-display text-2xl sm:text-3xl leading-[1.15] text-ink">
            What membership gives you
          </h2>

          <ul className="stagger mt-7 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((item) => (
              <li key={item.title}>
                <span className="grid size-10 place-items-center rounded-full bg-sky-100 text-sky-700">
                  <Icon name={item.icon} />
                </span>
                <h3 className="mt-3.5 font-medium text-ink">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Close ------------------------------------------------------ */}
        <section className="relative overflow-hidden rounded-panel bg-brand-600 px-6 sm:px-10 py-12 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(620px 320px at 50% 0%, rgba(0,174,239,0.42), transparent 65%)",
            }}
          />
          <div className="relative mx-auto max-w-lg">
            <h2 className="font-display text-2xl sm:text-3xl leading-[1.15] text-white">
              Books are better when we read together.
            </h2>
            <p className="mt-3 leading-relaxed text-on-navy-muted">
              Join a club, meet other readers, and make every chapter one worth
              talking about.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/join"
                className="press inline-flex min-h-12 items-center rounded-lg bg-white px-6 font-medium text-brand-700 transition-colors hover:bg-sky-100"
              >
                Find a club
              </Link>
              <Link
                href="/login"
                className={`${buttonClassName("ghost", "lg")} text-white hover:bg-white/10`}
              >
                I already have an account
              </Link>
            </div>

            <p className="mt-8 text-xs uppercase tracking-[0.18em] text-sky-300">
              #IamaReader · #WeInspireChange
            </p>
          </div>
        </section>

        <p className="pt-2 text-center text-xs text-ink-faint">
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
