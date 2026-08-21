"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Notice, TextareaField } from "@/components/ui/Field";
import { saveSession } from "./actions";

export type ClubOption = { id: string; name: string };
export type MemberOption = { id: string; name: string };

export type SessionDefaults = {
  sessionId: string | null;
  hostClubId: string;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  heldAtLocal: string;
  location: string;
  notes: string;
  presenter: string;
  pricingKind: "free" | "paid";
  guestFee: string;
  capacity: string;
  status: "scheduled" | "completed" | "cancelled";
  videoUrl: string;
};

const selectClass =
  "w-full min-h-11 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-600";

export function SessionForm({
  clubs,
  members,
  defaults,
}: {
  clubs: ClubOption[];
  members: MemberOption[];
  defaults: SessionDefaults;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pricing, setPricing] = useState(defaults.pricingKind);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await saveSession(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/sessions/${result.data?.sessionId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}
      <input type="hidden" name="sessionId" value={defaults.sessionId ?? ""} />

      <div>
        <label htmlFor="hostClubId" className="block text-sm font-medium text-ink mb-1.5">
          Host club
        </label>
        <select
          id="hostClubId"
          name="hostClubId"
          required
          defaultValue={defaults.hostClubId}
          className={selectClass}
        >
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-muted">
          This club&apos;s members always attend free.
        </p>
      </div>

      <Field
        label="Session title"
        name="title"
        required
        defaultValue={defaults.title}
        placeholder="September book night"
      />

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Book title" name="bookTitle" defaultValue={defaults.bookTitle} />
        <Field label="Book author" name="bookAuthor" defaultValue={defaults.bookAuthor} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field
          label="Date and time"
          name="heldAt"
          type="datetime-local"
          required
          defaultValue={defaults.heldAtLocal}
        />
        <Field label="Location" name="location" defaultValue={defaults.location} />
      </div>

      <div>
        <label htmlFor="presenter" className="block text-sm font-medium text-ink mb-1.5">
          Presenter
        </label>
        <select
          id="presenter"
          name="presenter"
          defaultValue={defaults.presenter}
          className={selectClass}
        >
          <option value="">Not decided yet</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="pricingKind" className="block text-sm font-medium text-ink mb-1.5">
            Pricing
          </label>
          <select
            id="pricingKind"
            name="pricingKind"
            value={pricing}
            onChange={(e) => setPricing(e.target.value as "free" | "paid")}
            className={selectClass}
          >
            <option value="free">Free for everyone</option>
            <option value="paid">Paid for guests from other clubs</option>
          </select>
        </div>

        {/* Only rendered when relevant -- a disabled-but-present fee field
            invites filling it in and wondering why nothing happens. */}
        {pricing === "paid" ? (
          <Field
            label="Guest fee (LKR)"
            name="guestFee"
            type="number"
            min={1}
            step="0.01"
            required
            defaultValue={defaults.guestFee}
            hint="Members of the host club still attend free."
          />
        ) : null}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field
          label="Capacity"
          name="capacity"
          type="number"
          min={1}
          defaultValue={defaults.capacity}
          hint="Leave blank for no limit."
        />
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-ink mb-1.5">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={defaults.status}
            className={selectClass}
          >
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <Field
        label="Recording link"
        name="videoUrl"
        defaultValue={defaults.videoUrl}
        placeholder="https://youtu.be/…"
        hint="YouTube or Vimeo. Members watch it on the session page."
      />

      <TextareaField label="Notes" name="notes" defaultValue={defaults.notes} />

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : defaults.sessionId ? "Save changes" : "Create session"}
      </Button>
    </form>
  );
}
