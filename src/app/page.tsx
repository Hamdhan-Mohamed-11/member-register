import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { buttonClassName } from "@/components/ui/Button";
import { getSessionMember } from "@/lib/auth/session";

/**
 * Outline icons in circles, matching the reference's feature band. Inline SVG
 * rather than an icon package: four glyphs do not justify a dependency, and
 * inlining keeps them in the server-rendered HTML with no client cost.
 */
function BandIcon({ name }: { name: "book" | "calendar" | "star" | "tag" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "w-5 h-5",
    "aria-hidden": true,
  };
  if (name === "book")
    return (
      <svg {...common}>
        <path d="M12 6.5S9.5 4.8 6 5.2v12c3.5-.4 6 1.3 6 1.3s2.5-1.7 6-1.3v-12c-3.5-.4-6 1.3-6 1.3z" />
        <path d="M12 6.5v12" />
      </svg>
    );
  if (name === "calendar")
    return (
      <svg {...common}>
        <rect x="4" y="5.5" width="16" height="14" rx="2" />
        <path d="M4 10h16M9 3.5v4M15 3.5v4" />
      </svg>
    );
  if (name === "star")
    return (
      <svg {...common}>
        <path d="m12 4.5 2.3 4.9 5.2.7-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2L4.5 10l5.2-.7z" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M4 11.5V5.5a1.5 1.5 0 0 1 1.5-1.5h6l8 8-7.5 7.5z" />
      <circle cx="8.5" cy="8.5" r="1.2" />
    </svg>
  );
}

const BAND = [
  {
    icon: "book" as const,
    title: "Track your reading",
    body: "Everything you're reading or plan to read, kept in one place.",
  },
  {
    icon: "calendar" as const,
    title: "Join club sessions",
    body: "Take part in sessions and discussions with your book club.",
  },
  {
    icon: "star" as const,
    title: "Earn points",
    body: "Attend, present, take part — your contribution is recognised.",
  },
  {
    icon: "tag" as const,
    title: "Member benefits",
    body: "25% off every book, and access to the lending library.",
  },
];

export default async function Home() {
  // A signed-in member has no use for the sales pitch.
  if (await getSessionMember()) redirect("/feed");

  return (
    <AppShell member={null} wide>
      <div className="max-w-5xl mx-auto space-y-4 pb-6">
        {/* ---- Hero ------------------------------------------------------ */}
        <section className="rounded-panel bg-cream border border-cream-deep overflow-hidden">
          <div className="px-6 sm:px-10 py-10 sm:py-14 max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-surface/70 border border-gold-200 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase text-gold-700">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-3 h-3"
                aria-hidden="true"
              >
                <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
              </svg>
              Welcome to Pick a Book
            </span>

            <h1 className="mt-5 font-display text-4xl sm:text-5xl text-ink leading-[1.08]">
              Your reading journey,{" "}
              <em className="italic text-brand-600">
                all in one place.
              </em>
            </h1>

            <p className="mt-5 text-ink-muted leading-relaxed max-w-md">
              Track what you&apos;re reading, join club sessions, earn points,
              and enjoy member benefits made for book lovers.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/join" className={buttonClassName("primary")}>
                Join a club
              </Link>
              <Link href="/login" className={buttonClassName("secondary")}>
                Log in
              </Link>
            </div>
          </div>
        </section>

        {/* ---- Navy feature band ----------------------------------------- */}
        <section className="on-navy rounded-panel bg-brand-900 shadow-band px-6 sm:px-10 py-9">
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {BAND.map((item, i) => (
              <li
                key={item.title}
                className={
                  // Hairline separators between columns, on large screens only.
                  i > 0 ? "lg:pl-6 lg:border-l lg:border-white/15" : undefined
                }
              >
                <span className="grid place-items-center w-10 h-10 rounded-full border border-white/25 text-gold-500">
                  <BandIcon name={item.icon} />
                </span>
                <h2 className="font-display text-lg text-on-navy mt-4">
                  {item.title}
                </h2>
                <p className="text-sm text-on-navy-muted mt-1.5 leading-relaxed">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Closing ---------------------------------------------------- */}
        <section className="rounded-panel bg-surface border border-line px-6 sm:px-10 py-10">
          <div className="max-w-md">
            <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-brand-600">
              Stronger together
            </p>
            {/* The one place gold is used structurally. */}
            <span className="block w-10 h-0.5 bg-gold-500 mt-2.5" aria-hidden="true" />

            <h2 className="font-display text-3xl text-ink mt-5 leading-[1.15]">
              Books are better when we read together.
            </h2>
            <p className="mt-4 text-ink-muted leading-relaxed">
              Join a club, meet other readers, and make every chapter one worth
              talking about.
            </p>

            <div className="mt-6">
              <Link href="/join" className={buttonClassName("primary")}>
                Find or join a club
              </Link>
            </div>

            <p className="mt-6 text-sm text-ink-muted">
              Already invited by your employer?{" "}
              <span className="text-ink">
                Check your email for a link to set your password.
              </span>
            </p>
          </div>
        </section>

        <p className="text-center text-xs text-ink-faint pt-2">
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
