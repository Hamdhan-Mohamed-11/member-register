"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice, selectClassName } from "@/components/ui/Field";
import {
  addClubMembership,
  setMemberRole,
  setMemberStatus,
  setMembership,
} from "../actions";
import { appointSecretary } from "@/app/admin/clubs/actions";

export type SecretaryClubOption = { id: string; name: string; hasSecretary: boolean };



type Result = { ok: boolean; error?: string };

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function run(
    action: (fd: FormData) => Promise<Result>,
    fields: Record<string, string>,
  ) {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);

    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return { pending, error, saved, run };
}

export function RoleAndStatus({
  memberId,
  role,
  status,
  isSelf,
  clubs,
  secretaryOf,
}: {
  memberId: string;
  role: string;
  status: string;
  isSelf: boolean;
  /** Active clubs, for choosing which one a secretary runs. */
  clubs: SecretaryClubOption[];
  /** The club this member runs, if any. */
  secretaryOf: { id: string; name: string } | null;
}) {
  const { pending, error, saved, run } = useAction();
  // A secretary is a person AND a club: the role alone grants nothing, because
  // every admin action asks "may they act on THIS club?". Picking "Secretary"
  // therefore opens a club picker instead of saving straight away -- saving
  // the bare role is exactly how an account ended up secretary of nothing.
  const [choosingClub, setChoosingClub] = useState(false);
  const [clubId, setClubId] = useState(secretaryOf?.id ?? "");
  const [roleValue, setRoleValue] = useState(role);

  const orphaned = role === "secretary" && !secretaryOf;
  const showPicker = choosingClub || orphaned;
  const chosen = clubs.find((c) => c.id === clubId);

  function onRole(next: string) {
    setRoleValue(next);
    if (next === "secretary") {
      setChoosingClub(true);
      return;
    }
    setChoosingClub(false);
    if (secretaryOf && next === "member") {
      // Stepping down: clearing the club's secretary also returns the role
      // to member, in one step on the database side.
      run(appointSecretary, { clubId: secretaryOf.id, memberId: "" });
      return;
    }
    run(setMemberRole, { memberId, role: next });
  }

  return (
    <div className="space-y-3">
      {error ? <Notice>{error}</Notice> : null}
      {saved ? <Notice tone="success">Saved.</Notice> : null}

      {isSelf ? (
        <Notice tone="info">
          This is your own account. Changing your role here could lock you out of
          the admin area.
        </Notice>
      ) : null}

      {orphaned ? (
        <Notice>
          This account is a secretary but is not running any club, so it can open the
          admin area but cannot do anything there. Choose the club they run below.
        </Notice>
      ) : null}

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="role" className="block text-sm font-medium text-ink mb-1.5">
            Role
          </label>
          <select
            id="role"
            value={roleValue}
            disabled={pending}
            className={`${selectClassName} w-full`}
            onChange={(e) => onRole(e.target.value)}
          >
            <option value="member">Member</option>
            <option value="secretary">Secretary</option>
            <option value="super_admin">Super admin</option>
          </select>
          {secretaryOf && !choosingClub ? (
            <p className="mt-1.5 text-xs text-ink-muted">
              Runs <span className="font-medium text-ink">{secretaryOf.name}</span> ·{" "}
              <button
                type="button"
                onClick={() => setChoosingClub(true)}
                className="text-brand-600 hover:underline"
              >
                change club
              </button>
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-medium text-ink mb-1.5">
            Account status
          </label>
          <select
            id="status"
            defaultValue={status}
            disabled={pending}
            className={`${selectClassName} w-full`}
            onChange={(e) => run(setMemberStatus, { memberId, status: e.target.value })}
          >
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {showPicker ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
          <label htmlFor="secretary-club" className="block text-sm font-medium text-ink mb-1.5">
            Which club will they run?
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              id="secretary-club"
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
              className={`${selectClassName} w-full sm:flex-1`}
            >
              <option value="">Choose a club…</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.hasSecretary && c.id !== secretaryOf?.id ? " (has a secretary)" : ""}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={pending || !clubId || clubId === secretaryOf?.id}
              onClick={() => {
                run(appointSecretary, { clubId, memberId });
                setChoosingClub(false);
              }}
              className="sm:self-center"
            >
              {pending ? "Saving…" : "Make secretary"}
            </Button>
            {!orphaned ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setChoosingClub(false);
                  setRoleValue(role);
                }}
                className="sm:self-center"
              >
                Cancel
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            A secretary runs one club: its sessions, attendance, join requests and videos.
            {chosen?.hasSecretary && chosen.id !== secretaryOf?.id
              ? " The current secretary of that club goes back to being a member."
              : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function MembershipRow({
  memberId,
  membershipId,
  clubName,
  status,
  renewalDate,
  isPrimary,
}: {
  memberId: string;
  membershipId: string;
  clubName: string;
  status: string;
  renewalDate: string | null;
  isPrimary: boolean;
}) {
  const { pending, error, run } = useAction();

  return (
    <li className="px-4 py-3">
      {error ? (
        <div className="mb-2">
          <Notice>{error}</Notice>
        </div>
      ) : null}

      <p className="font-medium text-ink">
        {clubName}
        {isPrimary ? (
          <span className="ml-2 text-xs text-ink-faint">primary</span>
        ) : null}
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-ink-faint mb-1">Status</label>
          <select
            defaultValue={status}
            disabled={pending}
            className={selectClassName}
            onChange={(e) =>
              run(setMembership, { memberId, membershipId, status: e.target.value })
            }
          >
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-ink-faint mb-1">Renews on</label>
          <input
            type="date"
            defaultValue={renewalDate ?? ""}
            disabled={pending}
            className={selectClassName}
            onChange={(e) =>
              e.target.value &&
              run(setMembership, {
                memberId,
                membershipId,
                renewalDate: e.target.value,
              })
            }
          />
        </div>
      </div>
    </li>
  );
}

export function AddClubForm({
  memberId,
  clubs,
}: {
  memberId: string;
  clubs: { id: string; name: string }[];
}) {
  const { pending, error, saved, run } = useAction();
  const [clubId, setClubId] = useState(clubs[0]?.id ?? "");
  const [months, setMonths] = useState("");

  if (clubs.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        They already belong to every active club.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <Notice>{error}</Notice> : null}
      {saved ? <Notice tone="success">Club added.</Notice> : null}

      <Notice tone="info">
        Adding a club here skips both approval and payment. Use it for members
        who have paid another way.
      </Notice>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label className="block text-xs text-ink-faint mb-1">Club</label>
          <select
            value={clubId}
            onChange={(e) => setClubId(e.target.value)}
            className={`${selectClassName} w-full`}
          >
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-ink-faint mb-1">Months</label>
          <input
            type="number"
            min={1}
            value={months}
            placeholder="default"
            onChange={(e) => setMonths(e.target.value)}
            className={`${selectClassName} w-24`}
          />
        </div>

        <Button
          disabled={pending || !clubId}
          onClick={() => run(addClubMembership, { memberId, clubId, months })}
        >
          {pending ? "Adding…" : "Add club"}
        </Button>
      </div>
    </div>
  );
}
