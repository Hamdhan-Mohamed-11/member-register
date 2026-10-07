"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * The hero's call to action. Four kinds of visitor arrive here -- a reader,
 * someone who runs a club, a company, an author or publisher -- and four
 * equal buttons would bury the one most people want. So the hero asks one
 * question, "I'm here to…", and the single primary button changes to fit the
 * answer. Readers are the default, so a visitor who never touches the chips
 * gets exactly the old "Join a club" button.
 *
 * Native radios underneath, so it is a real radio group to a keyboard and a
 * screen reader; before hydration the default link still works.
 */

type Way = {
  id: string;
  chip: string;
  icon: IconName;
  cta: string;
  href: string;
  note: string;
};

const WAYS: Way[] = [
  {
    id: "read",
    chip: "Read with a club",
    icon: "book",
    cta: "Join a club",
    href: "/join",
    note: "Pick a public club, pay the membership, and you're in.",
  },
  {
    id: "club",
    chip: "Bring my club",
    icon: "users",
    cta: "Bring your club",
    href: "/clubs/new",
    note: "Already meet? Get sessions, points, a member list and the shop.",
  },
  {
    id: "company",
    chip: "Start one at work",
    icon: "id",
    cta: "Start a company club",
    href: "/clubs/new?for=company",
    note: "A private club for your employees. Invited by your employer? Check your email instead.",
  },
  {
    id: "creator",
    chip: "Sell my books",
    icon: "pencil",
    cta: "Register as an author or publisher",
    href: "/creator/register",
    note: "Members buy through their club, and you see every sale as it happens.",
  },
];

export function WayIn() {
  const [selected, setSelected] = useState(WAYS[0].id);
  const way = WAYS.find((w) => w.id === selected) ?? WAYS[0];

  return (
    <div className="mt-8">
      <fieldset>
        <legend className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">
          I&apos;m here to…
        </legend>
        <div className="flex flex-wrap gap-2">
          {WAYS.map((w) => {
            const on = w.id === selected;
            return (
              <label
                key={w.id}
                className={`press inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-300 ${
                  on
                    ? "border-sky-300 bg-white text-brand-800"
                    : "border-white/25 bg-white/10 text-white hover:bg-white/15"
                }`}
              >
                <input
                  type="radio"
                  name="way-in"
                  value={w.id}
                  checked={on}
                  onChange={() => setSelected(w.id)}
                  className="sr-only"
                />
                <Icon name={w.icon} className="size-4" />
                {w.chip}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href={way.href}
          className="press inline-flex min-h-12 items-center gap-2 rounded-lg bg-sky-500 px-6 font-medium text-brand-950 shadow-hero transition-colors hover:bg-sky-300"
        >
          {way.cta}
          <Icon name="arrow-right" className="size-4" />
        </Link>
        <Link
          href="/login"
          className="press inline-flex min-h-12 items-center rounded-lg border border-white/30 px-6 font-medium text-white transition-colors hover:bg-white/10"
        >
          Log in
        </Link>
      </div>

      <p aria-live="polite" className="mt-4 max-w-md text-sm text-on-navy-muted">
        {way.note}
      </p>
    </div>
  );
}
