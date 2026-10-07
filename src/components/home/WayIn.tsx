import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * The hero's way in. Four kinds of visitor arrive here -- a reader, someone
 * who runs a club, a company, an author or publisher -- and four buttons in a
 * row would bury the one most people want. So they are four equal tiles under
 * one question, "I'm here to…", each a link straight to its form. Reading
 * comes first; logging in lives in the top bar.
 */

type Way = {
  id: string;
  chip: string;
  icon: IconName;
  href: string;
};

const WAYS: Way[] = [
  {
    id: "read",
    chip: "Read with a club",
    icon: "book",
    href: "/join",
  },
  {
    id: "club",
    chip: "Bring my club",
    icon: "users",
    href: "/clubs/new",
  },
  {
    id: "company",
    chip: "Start one at work",
    icon: "id",
    href: "/clubs/new?for=company",
  },
  {
    id: "creator",
    chip: "Sell my books",
    icon: "pencil",
    href: "/creator/register",
  },
];

export function WayIn() {
  return (
    <nav
      aria-labelledby="way-in"
      className="mt-8 max-w-xl rounded-2xl border border-white/15 bg-white/[0.06] p-2 shadow-band backdrop-blur-sm"
    >
      <p
        id="way-in"
        className="px-2 pb-2.5 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200"
      >
        I&apos;m here to…
      </p>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {WAYS.map((w, i) => (
          <li key={w.id}>
            <Link
              href={w.href}
              className={`press group flex h-full flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-[13px] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
                i === 0
                  ? "bg-white text-brand-800 shadow-card hover:bg-sky-100"
                  : "text-on-navy-muted hover:bg-white hover:text-brand-800"
              }`}
            >
              <span
                className={`grid size-8 place-items-center rounded-full transition-colors ${
                  i === 0
                    ? "bg-sky-100 text-sky-700"
                    : "bg-white/10 group-hover:bg-sky-100 group-hover:text-sky-700"
                }`}
              >
                <Icon name={w.icon} className="size-4" />
              </span>
              {w.chip}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
