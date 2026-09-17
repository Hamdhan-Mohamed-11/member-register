"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * "Add to calendar": Google Calendar, or a calendar file that Apple Calendar
 * and Outlook open.
 *
 * Sessions store a start time only, so the event is given two hours -- about
 * as long as a club evening runs, and easy for a member to adjust.
 *
 * The file is built in the browser rather than served, so it needs no route
 * and carries nothing a member cannot already see on the page.
 */
const DURATION_MS = 2 * 60 * 60 * 1000;

/** 20260917T063500Z -- the UTC form both Google and iCalendar accept. */
function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** iCalendar text values escape backslash, semicolon, comma and newlines. */
function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function AddToCalendar({
  sessionId,
  title,
  startIso,
  location,
  details,
}: {
  sessionId: string;
  title: string;
  startIso: string;
  location: string | null;
  details: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const start = new Date(startIso);
  const end = new Date(start.getTime() + DURATION_MS);

  function pageUrl() {
    return `${window.location.origin}/sessions/${sessionId}`;
  }

  function google() {
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates: `${stamp(start)}/${stamp(end)}`,
      details: `${details}\n\n${pageUrl()}`.trim(),
      location: location ?? "",
    });
    window.open(`https://calendar.google.com/calendar/render?${params}`, "_blank", "noopener");
    setOpen(false);
  }

  function download() {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Pick a Book//Member portal//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:session-${sessionId}@member.pickabook.lk`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${icsText(title)}`,
      location ? `LOCATION:${icsText(location)}` : "",
      `DESCRIPTION:${icsText(`${details}\n\n${pageUrl()}`.trim())}`,
      `URL:${pageUrl()}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean);

    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "session"}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  const item =
    "flex w-full min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-sm text-ink hover:bg-canvas";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-brand-700 transition-colors hover:bg-canvas"
      >
        <Icon name="calendar" className="size-4" />
        Add to calendar
      </button>

      {open ? (
        <div
          role="menu"
          className="reveal absolute inset-x-0 top-full z-20 mt-2 rounded-card border border-line bg-surface p-1.5 shadow-band"
        >
          <button type="button" role="menuitem" onClick={google} className={item}>
            <Icon name="calendar" className="size-4 text-brand-600" />
            Google Calendar
          </button>
          <button type="button" role="menuitem" onClick={download} className={item}>
            <Icon name="inbox" className="size-4 text-brand-600" />
            Apple Calendar or Outlook (.ics file)
          </button>
        </div>
      ) : null}
    </div>
  );
}
