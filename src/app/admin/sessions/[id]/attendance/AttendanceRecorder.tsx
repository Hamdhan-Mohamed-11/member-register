"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice, controlClassName } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { saveAttendance } from "@/app/admin/sessions/actions";

export type Rule = {
  code: string;
  label: string;
  points: number;
  /** Counts towards the session's presenter cap. */
  is_presenting: boolean;
};

export type RosterMember = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  clubNames: string[];
  isGuest: boolean;
  codes: string[];
};

/**
 * The live points recorder -- used one-handed, standing up, while a session is
 * happening. Design follows from that:
 *
 *   * every control is a large tap target
 *   * state is local and saving is explicit, so a dropped connection mid-room
 *     loses nothing until the Secretary chooses to save
 *   * the running total is always visible, because it is the number that gets
 *     sanity-checked out loud
 */
export function AttendanceRecorder({
  sessionId,
  rules,
  roster,
  presenterCap,
}: {
  sessionId: string;
  rules: Rule[];
  roster: RosterMember[];
  /** How many may be marked as presenting. Null = no limit. */
  presenterCap: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState("");

  const [state, setState] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(roster.map((m) => [m.id, m.codes])),
  );

  const pointsFor = useMemo(() => {
    const byCode = new Map(rules.map((r) => [r.code, r.points]));
    return (codes: string[]) =>
      codes.reduce((sum, c) => sum + (byCode.get(c) ?? 0), 0);
  }, [rules]);

  const total = useMemo(
    () => Object.values(state).reduce((sum, codes) => sum + pointsFor(codes), 0),
    [state, pointsFor],
  );

  const attending = useMemo(
    () => Object.values(state).filter((codes) => codes.length > 0).length,
    [state],
  );

  const presentingCodes = useMemo(
    () => new Set(rules.filter((r) => r.is_presenting).map((r) => r.code)),
    [rules],
  );

  // How many people are currently marked as presenting, counted per MEMBER --
  // someone ticked for both "presented" and "presented at another club" is one
  // presenter, not two. The RPC counts it the same way, and the two must agree
  // or the UI will allow a roster the save then rejects.
  const presenting = useMemo(
    () =>
      Object.values(state).filter((codes) =>
        codes.some((c) => presentingCodes.has(c)),
      ).length,
    [state, presentingCodes],
  );

  const capReached = presenterCap != null && presenting >= presenterCap;

  const dirty = useMemo(
    () =>
      roster.some((m) => {
        const now = [...(state[m.id] ?? [])].sort().join(",");
        const before = [...m.codes].sort().join(",");
        return now !== before;
      }),
    [roster, state],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((m) =>
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q),
    );
  }, [roster, query]);

  function toggle(memberId: string, code: string) {
    setSaved(false);
    setState((prev) => {
      const codes = prev[memberId] ?? [];
      return {
        ...prev,
        [memberId]: codes.includes(code)
          ? codes.filter((c) => c !== code)
          : [...codes, code],
      };
    });
  }

  function save() {
    setError(null);
    setSaved(false);

    // Send EVERY member, including those with no codes -- the RPC treats the
    // payload as the full desired state and deletes what is missing. Sending
    // only the ticked ones would make it impossible to untick anybody.
    const entries = roster.map((m) => ({
      member_id: m.id,
      codes: state[m.id] ?? [],
    }));

    startTransition(async () => {
      const result = await saveAttendance(sessionId, entries);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error ? <Notice>{error}</Notice> : null}
      {saved && !dirty ? <Notice tone="success">Attendance saved.</Notice> : null}

      {/*
        A greyed button with a tooltip explains nothing on a phone, which is
        where this screen is actually used. Say it in words instead, and only
        once the limit is actually reached.
      */}
      {capReached ? (
        <Notice tone="info">
          All {presenterCap} presenter{presenterCap === 1 ? "" : "s"} are marked.
          To change who presented, untick someone first.
        </Notice>
      ) : null}

      {/* Sticky summary: the running total is the number said out loud, so it
          must stay on screen while scrolling a long roster. */}
      <div className="sticky top-14 z-30 bg-canvas py-2">
        <Card className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-ink-muted">
              {attending} of {roster.length} taking part
              {presenterCap != null ? (
                <>
                  {" · "}
                  <span className={capReached ? "text-warning-600 font-medium" : ""}>
                    {presenting}/{presenterCap} presenting
                  </span>
                </>
              ) : null}
            </p>
            <p className="text-2xl font-semibold text-brand-600">{total} points</p>
          </div>
          <Button onClick={save} disabled={pending || !dirty}>
            {pending ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </Card>
      </div>

      {roster.length > 8 ? (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a member…"
          className={controlClassName}
        />
      ) : null}

      {visible.length === 0 ? (
        <Card flush>
          <EmptyState
            title={query ? "Nobody matches that" : "No members to record"}
            description={
              query ? undefined : "Members of the host club and anyone who booked will appear here."
            }
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {visible.map((m) => {
            const codes = state[m.id] ?? [];
            const memberPoints = pointsFor(codes);

            return (
              <li key={m.id}>
                <Card className={codes.length ? "ring-1 ring-brand-500" : undefined}>
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={m.avatarUrl}
                      firstName={m.firstName}
                      lastName={m.lastName}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink truncate">
                        {`${m.firstName} ${m.lastName}`.trim() || "Member"}
                        {m.isGuest ? (
                          <span className="ml-2 text-xs font-medium text-warning-600 bg-warning-100 rounded-full px-1.5 py-0.5">
                            guest
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-ink-faint truncate">
                        {m.clubNames.join(" · ") || "No club"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold ${
                        memberPoints ? "text-brand-600" : "text-ink-faint"
                      }`}
                    >
                      {memberPoints ? `+${memberPoints}` : "—"}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {rules.map((rule) => {
                      const on = codes.includes(rule.code);
                      // Blocked only for someone NOT already presenting. The
                      // person who is stays clickable, or the Secretary could
                      // not swap one presenter for another without first
                      // clearing the whole row.
                      const blocked =
                        rule.is_presenting &&
                        !on &&
                        capReached &&
                        !codes.some((c) => presentingCodes.has(c));
                      return (
                        <button
                          key={rule.code}
                          type="button"
                          aria-pressed={on}
                          disabled={blocked}
                          title={
                            blocked
                              ? `This session is set for ${presenterCap} presenter${presenterCap === 1 ? "" : "s"}. Untick someone else first.`
                              : undefined
                          }
                          onClick={() => toggle(m.id, rule.code)}
                          className={`min-h-11 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
                            on
                              ? "bg-brand-600 text-white"
                              : blocked
                                ? "bg-canvas text-ink-faint opacity-50 cursor-not-allowed"
                                : "bg-canvas text-ink-muted hover:bg-brand-50"
                          }`}
                        >
                          {rule.label}
                          <span className={on ? "opacity-80" : "opacity-60"}>
                            {" "}
                            +{rule.points}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
