"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  Field,
  Notice,
  TextareaField,
  controlClassName,
  selectClassName,
} from "@/components/ui/Field";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { sessionImageUrl } from "@/lib/flyers/url";
import { saveSession, setSessionImage } from "./actions";

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
  presenterCount: string;
  status: "scheduled" | "completed" | "cancelled";
  videoUrl: string;
  /** The cover already saved, if this session has one. */
  imagePath: string | null;
  label: string;
  tagline: string;
  highlights: string[];
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};


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

  // The cover picture. Uploaded AFTER the session is saved, because the
  // storage policy keys on the session id in the path -- a new session has no
  // id to upload under until it exists.
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    sessionImageUrl(defaults.imagePath),
  );
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);

  function onImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!IMAGE_EXT[file.type]) {
      setError("A cover needs to be a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That picture is over 5MB. Please pick a smaller one.");
      return;
    }
    setError(null);
    setRemoveImage(false);
    setImage(file);
    setImagePreview((old) => {
      if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
  }

  function clearImage() {
    setImage(null);
    setRemoveImage(true);
    setImagePreview((old) => {
      if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
      return null;
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);
    setBusy(true);

    startTransition(async () => {
      const result = await saveSession(fd);
      if (!result.ok) {
        setBusy(false);
        setError(result.error);
        return;
      }

      const sessionId = result.data?.sessionId;
      if (sessionId && image) {
        const key = `${sessionId}/cover-${crypto.randomUUID()}.${IMAGE_EXT[image.type]}`;
        const { error: uploadError } = await getBrowserSupabaseClient()
          .storage.from("flyers")
          .upload(key, image, { contentType: image.type, upsert: false });
        if (uploadError) {
          // The session itself saved, so say what did not rather than
          // pretending the whole thing failed.
          setBusy(false);
          setError(`Session saved, but the picture did not upload: ${uploadError.message}`);
          return;
        }
        const attached = await setSessionImage(sessionId, key);
        if (!attached.ok) {
          setBusy(false);
          setError(`Session saved, but the picture did not attach: ${attached.error}`);
          return;
        }
      } else if (sessionId && removeImage && defaults.imagePath) {
        await setSessionImage(sessionId, null);
      }

      setBusy(false);
      router.push(`/admin/sessions/${sessionId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}
      <input type="hidden" name="sessionId" value={defaults.sessionId ?? ""} />

      {/* The cover members see on the session card. */}
      <div>
        <label htmlFor="session-image" className="mb-1.5 block text-sm font-medium text-ink">
          Cover picture
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="relative aspect-[16/7] w-full shrink-0 overflow-hidden rounded-card border border-line bg-canvas-deep sm:w-56">
            {imagePreview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imagePreview}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <span className="absolute inset-0 grid place-items-center px-3 text-center text-xs text-ink-faint">
                No picture yet
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <input
              id="session-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onImage}
              className="block w-full text-sm text-ink-muted file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
            />
            <p className="mt-1.5 text-xs text-ink-muted">
              JPEG, PNG or WebP, up to 5MB. A wide photo works best — the card crops it
              to a band across the top. Without one, the card shows the book on a
              brand-coloured plate.
            </p>
            {imagePreview ? (
              <button
                type="button"
                onClick={clearImage}
                className="mt-2 text-xs text-danger-600 hover:underline"
              >
                Remove the picture
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="hostClubId" className="block text-sm font-medium text-ink mb-1.5">
          Host club
        </label>
        <select
          id="hostClubId"
          name="hostClubId"
          required
          defaultValue={defaults.hostClubId}
          className={selectClassName}
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
          className={selectClassName}
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
            className={selectClassName}
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
        <Field
          label="How many are presenting?"
          name="presenterCount"
          type="number"
          min={1}
          max={50}
          defaultValue={defaults.presenterCount}
          hint="The attendance recorder stops at this many. Blank for no limit."
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-ink mb-1.5">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={defaults.status}
            className={selectClassName}
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

      {/* What members read on the session page. Placeholders show the kind
          of thing to write; every field is optional. */}
      <fieldset className="space-y-3 rounded-card border border-line p-4">
        <legend className="px-1 text-sm font-medium text-ink">On the session page</legend>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Field
            label="Label"
            name="label"
            defaultValue={defaults.label}
            maxLength={40}
            placeholder="Special event"
            hint="A short tag on the banner."
          />
          <Field
            label="Tagline"
            name="tagline"
            defaultValue={defaults.tagline}
            maxLength={140}
            placeholder="Ideas, stories and meaningful conversations."
            hint="One line under the title."
          />
        </div>

        <TextareaField
          label="About this session"
          name="notes"
          rows={4}
          defaultValue={defaults.notes}
          placeholder="What the evening is about, what the presenter will cover, and who will enjoy it."
        />

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">What to expect</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                name="highlight"
                aria-label={`What to expect, point ${i + 1}`}
                defaultValue={defaults.highlights[i] ?? ""}
                maxLength={80}
                placeholder={
                  ["Thoughtful discussion", "A short reading from the book", "Tea and new friends"][i]
                }
                className={controlClassName}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">Up to three short points.</p>
        </div>
      </fieldset>

      <Button type="submit" disabled={pending || busy}>
        {pending ? "Saving…" : defaults.sessionId ? "Save changes" : "Create session"}
      </Button>
    </form>
  );
}
