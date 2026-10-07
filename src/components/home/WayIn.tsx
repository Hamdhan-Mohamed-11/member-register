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
    <div className="mt-8 max-w-xl rounded-2xl border border-white/15 bg-white/[0.06] p-2 shadow-band backdrop-blur-sm">
      <fieldset>
        <legend className="px-2 pb-2.5 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">
          I&apos;m here to…
        </legend>
        {/* Four equal tiles in one row: nothing orphaned on a second line. */}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {WAYS.map((w) => {
            const on = w.id === selected;
            return (
              <label
                key={w.id}
                className={`press flex cursor-pointer flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-[13px] font-medium leading-tight transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-300 ${
                  on
                    ? "bg-white text-brand-800 shadow-card"
                    : "text-on-navy-muted hover:bg-white/10 hover:text-white"
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
                <span
                  className={`grid size-8 place-items-center rounded-full ${
                    on ? "bg-sky-100 text-sky-700" : "bg-white/10"
                  }`}
                >
                  <Icon name={w.icon} className="size-4" />
                </span>
                {w.chip}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="px-3 pb-3 pt-4 sm:px-4">
        <p aria-live="polite" className="min-h-10 text-sm leading-relaxed text-on-navy-muted">
          {way.note}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link
            href={way.href}
            className="press inline-flex min-h-12 items-center gap-2 rounded-lg bg-sky-500 px-6 font-medium text-brand-950 shadow-hero transition-colors hover:bg-sky-300"
          >
            {way.cta}
            <Icon name="arrow-right" className="size-4" />
          </Link>
          <p className="text-sm text-on-navy-muted">
            Already a member?{" "}
            <Link href="/login" className="font-medium text-white underline-offset-4 hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
