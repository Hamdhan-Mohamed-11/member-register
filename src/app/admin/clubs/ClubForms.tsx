"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Notice, SelectField, TextareaField } from "@/components/ui/Field";
import {
  appointSecretary,
  createClub,
  createClubType,
  inviteToClub,
  updateClub,
  updateClubType,
  type InviteOutcome,
} from "./actions";

export type ClubTypeOption = {
  id: string;
  name: string;
  slug: string;
  memberVisibility: "club" | "type";
  requiresGuardian: boolean;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  clubCount: number;
};

export type MemberOption = { id: string; name: string; email: string };

export type ClubRow = {
  id: string;
  secretaryId: string | null;
  secretaryName: string | null;
  name: string;
  description: string | null;
  kind: string;
  typeId: string | null;
  feeLkr: number | null;
  termMonths: number | null;
  isActive: boolean;
  isOpenJoin: boolean;
  memberCount: number;
};

/**
 * A checkbox with its label and hint.
 *
 * An unchecked box posts nothing, so the actions read absence as false. That
 * is only safe because every form here submits its complete set of checkboxes
 * -- if one is ever rendered conditionally, unticking it and hiding it become
 * the same thing on the server.
 */
function Check({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <div>
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="mt-0.5 size-4 shrink-0 rounded border-line-strong text-brand-600 focus:ring-brand-600/25"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">{label}</span>
          {hint ? <span className="block text-xs text-ink-muted">{hint}</span> : null}
        </span>
      </label>
    </div>
  );
}

const VISIBILITY_HINT =
  "“Only this club” keeps each club's members to themselves. “Every club of this type” makes all the clubs under it one directory and one leaderboard — that's what Public Clubs uses.";

function VisibilitySelect({ value }: { value?: "club" | "type" }) {
  return (
    <SelectField
      label="Members can see"
      name="memberVisibility"
      defaultValue={value ?? "club"}
      hint={VISIBILITY_HINT}
    >
      <option value="club">Only their own club</option>
      <option value="type">Every club of this type</option>
    </SelectField>
  );
}

/** Shared submit plumbing: run the action, surface the error, refresh. */
function useAction(onDone?: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function run(
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    event: React.FormEvent<HTMLFormElement>,
    { reset = false }: { reset?: boolean } = {},
  ) {
    event.preventDefault();
    setError(null);
    setDone(false);
    const form = event.currentTarget;
    const fd = new FormData(form);

    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        setError(result.error ?? "That didn't work.");
        return;
      }
      if (reset) form.reset();
      setDone(true);
      onDone?.();
      router.refresh();
    });
  }

  return { pending, error, done, run, setDone };
}

export function CreateTypeForm() {
  const { pending, error, done, run } = useAction();

  return (
    <form onSubmit={(e) => run(createClubType, e, { reset: true })} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}
      {done ? <Notice tone="success">Type added. Clubs can be filed under it now.</Notice> : null}

      <Field label="Type name" name="name" required placeholder="Special Clubs" />
      <VisibilitySelect />

      <Field
        label="Order"
        name="sortOrder"
        type="number"
        min={0}
        hint="Lower numbers appear first, on the join page and here."
      />

      <Check
        name="requiresGuardian"
        label="A guardian holds the account"
        hint="For Kids Club — the adult registers and the child is on their account."
      />

      <TextareaField
        label="Description"
        name="description"
        rows={2}
        placeholder="What kind of clubs belong under this type."
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add type"}
      </Button>
    </form>
  );
}

export function EditTypeForm({ type }: { type: ClubTypeOption }) {
  const { pending, error, done, run } = useAction();

  return (
    <form onSubmit={(e) => run(updateClubType, e)} className="space-y-4">
      <input type="hidden" name="typeId" value={type.id} />
      {error ? <Notice>{error}</Notice> : null}
      {done ? <Notice tone="success">Saved.</Notice> : null}

      <Field label="Type name" name="name" defaultValue={type.name} required />
      <VisibilitySelect value={type.memberVisibility} />

      <Field
        label="Order"
        name="sortOrder"
        type="number"
        min={0}
        defaultValue={type.sortOrder}
      />

      <Check
        name="requiresGuardian"
        label="A guardian holds the account"
        defaultChecked={type.requiresGuardian}
      />
      <Check
        name="isActive"
        label="In use"
        hint={
          type.clubCount > 0
            ? `Can't be switched off while ${type.clubCount} club${type.clubCount === 1 ? " is" : "s are"} filed under it.`
            : "Switch off to retire a type you no longer file clubs under."
        }
        defaultChecked={type.isActive}
      />

      <TextareaField
        label="Description"
        name="description"
        rows={2}
        defaultValue={type.description ?? ""}
      />

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save type"}
      </Button>
    </form>
  );
}

export function CreateClubForm({ types }: { types: ClubTypeOption[] }) {
  const { pending, error, done, run } = useAction();
  const usable = types.filter((t) => t.isActive);

  return (
    <form onSubmit={(e) => run(createClub, e, { reset: true })} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}
      {done ? <Notice tone="success">Club created. Invite its members below.</Notice> : null}

      <Field label="Club name" name="name" required placeholder="Aureate" />

      <SelectField label="Type" name="typeId" required defaultValue="">
        <option value="" disabled>
          Choose a type…
        </option>
        {usable.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </SelectField>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field
          label="Membership fee (LKR)"
          name="feeLkr"
          type="number"
          min={0}
          step="0.01"
          hint="Blank uses the default fee."
        />
        <Field
          label="Term (months)"
          name="termMonths"
          type="number"
          min={1}
          hint="Blank uses the default term."
        />
      </div>

      <Check
        name="openJoin"
        label="Anyone can apply to join"
        hint="Shows this club on the public join page. Leave off for a club an admin places people into."
      />

      <TextareaField label="Description" name="description" rows={2} />

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create club"}
      </Button>
    </form>
  );
}

export function EditClubForm({
  club,
  types,
}: {
  club: ClubRow;
  types: ClubTypeOption[];
}) {
  const { pending, error, done, run } = useAction();
  const isCompany = club.kind === "company";

  return (
    <form onSubmit={(e) => run(updateClub, e)} className="space-y-4">
      <input type="hidden" name="clubId" value={club.id} />
      {error ? <Notice>{error}</Notice> : null}
      {done ? <Notice tone="success">Saved.</Notice> : null}

      <Field label="Club name" name="name" defaultValue={club.name} required />

      <SelectField
        label="Type"
        name="typeId"
        defaultValue={club.typeId ?? ""}
        // A company club's type is not a choice. Moving it out of Corporate
        // would put its employees in a shared directory with another company,
        // so the database refuses it -- disabling the control here means an
        // admin finds that out before they submit rather than after.
        disabled={isCompany}
        hint={
          isCompany
            ? "Company clubs are always Corporate — that is what keeps one company's employees out of another's directory."
            : undefined
        }
      >
        <option value="" disabled>
          Choose a type…
        </option>
        {types.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </SelectField>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field
          label="Membership fee (LKR)"
          name="feeLkr"
          type="number"
          min={0}
          step="0.01"
          defaultValue={club.feeLkr ?? ""}
        />
        <Field
          label="Term (months)"
          name="termMonths"
          type="number"
          min={1}
          defaultValue={club.termMonths ?? ""}
        />
      </div>

      <Check
        name="isActive"
        label="Active"
        hint="Switching a club off hides it everywhere and stops new applications."
        defaultChecked={club.isActive}
      />
      <Check
        name="openJoin"
        label="Anyone can apply to join"
        hint="Off means invite or admin placement only. Company clubs ignore this — they are always invite-only."
        defaultChecked={club.isOpenJoin}
      />

      <TextareaField
        label="Description"
        name="description"
        rows={2}
        defaultValue={club.description ?? ""}
      />

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save club"}
      </Button>
    </form>
  );
}

export function InviteToClubForm({
  clubId,
  clubName,
}: {
  clubId: string;
  clubName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<InviteOutcome | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOutcome(null);
    const form = event.currentTarget;
    const fd = new FormData(form);
    fd.set("clubId", clubId);

    startTransition(async () => {
      const result = await inviteToClub(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOutcome(result.data ?? null);
      if (result.data?.invited.length) form.reset();
      router.refresh();
    });
  }

  // data-club-id says WHICH club this form posts to. Every club on the page
  // renders one, identical apart from that, so without it nothing in the DOM
  // tells two apart -- and a page-wide selector silently picks the first,
  // which is how the e2e suite once invited its fixtures into a real club.
  return (
    <form onSubmit={onSubmit} className="space-y-3" data-club-id={clubId}>
      {error ? <Notice>{error}</Notice> : null}

      {outcome ? (
        <div className="space-y-2">
          {outcome.invited.length ? (
            <Notice tone="success">
              Invited {outcome.invited.length}{" "}
              {outcome.invited.length === 1 ? "person" : "people"} to {clubName}.
            </Notice>
          ) : null}
          {outcome.failed.length ? (
            <div className="rounded-lg bg-warning-100 px-3 py-2.5 text-sm text-warning-600">
              <p className="font-medium">
                {outcome.failed.length}{" "}
                {outcome.failed.length === 1 ? "address" : "addresses"} didn&apos;t go
                through:
              </p>
              <ul className="mt-1 space-y-0.5">
                {outcome.failed.map((f) => (
                  <li key={f.email}>
                    <span className="font-medium">{f.email}</span> — {f.error}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <TextareaField
        label="Email addresses"
        name="emails"
        required
        rows={3}
        placeholder={"ada@example.lk\ngrace@example.lk, alan@example.lk"}
        hint="One per line or comma separated. “Name <a@b.com>” works too."
      />

      <SelectField label="Join as" name="role" defaultValue="member">
        <option value="member">Member</option>
        <option value="secretary">Secretary</option>
      </SelectField>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Sending invites…" : "Send invites"}
      </Button>
    </form>
  );
}

/**
 * Who runs this club.
 *
 * One club, one secretary, and one club per person -- so the list offers only
 * members who are not already running something else. The RPC refuses it
 * regardless; leaving them selectable would just be an error waiting to
 * happen.
 */
export function AppointSecretaryForm({
  club,
  members,
  takenBy,
}: {
  club: ClubRow;
  members: MemberOption[];
  /** member id -> the club they already run, for everyone who runs one. */
  takenBy: Record<string, string>;
}) {
  const { pending, error, done, run } = useAction();

  const selectable = members.filter(
    (m) => !takenBy[m.id] || m.id === club.secretaryId,
  );

  return (
    <form onSubmit={(e) => run(appointSecretary, e)} className="space-y-3">
      <input type="hidden" name="clubId" value={club.id} />
      {error ? <Notice>{error}</Notice> : null}
      {done ? <Notice tone="success">Saved.</Notice> : null}

      <SelectField
        label="Secretary"
        name="memberId"
        defaultValue={club.secretaryId ?? ""}
        hint="They can create sessions and record attendance for this club, and nothing else."
      >
        <option value="">Nobody yet</option>
        {selectable.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} · {m.email}
          </option>
        ))}
      </SelectField>

      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save secretary"}
      </Button>
    </form>
  );
}
