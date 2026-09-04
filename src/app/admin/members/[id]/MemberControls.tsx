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
}: {
  memberId: string;
  role: string;
  status: string;
  isSelf: boolean;
}) {
  const { pending, error, saved, run } = useAction();

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

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="role" className="block text-sm font-medium text-ink mb-1.5">
            Role
          </label>
          <select
            id="role"
            defaultValue={role}
            disabled={pending}
            className={`${selectClassName} w-full`}
            onChange={(e) => run(setMemberRole, { memberId, role: e.target.value })}
          >
            <option value="member">Member</option>
            <option value="secretary">Secretary</option>
            <option value="super_admin">Super admin</option>
          </select>
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
