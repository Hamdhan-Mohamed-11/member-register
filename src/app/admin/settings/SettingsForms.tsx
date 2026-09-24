"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Notice, controlClassName } from "@/components/ui/Field";
import { updateAppTexts, updatePointsRule, updateSettings } from "./actions";

export type Settings = {
  membershipFee: number;
  termMonths: number;
  graceDays: number;
  expiringSoonDays: number;
  bookDiscount: number;
  libraryFee: number;
  libraryTermMonths: number;
  readrisePercent: number;
  readriseBookCost: number;
  readriseTarget: number;
  readriseTargetOn: string;
};

export type PointsRule = { code: string; label: string; points: number };

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateSettings(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}
      {saved ? <Notice tone="success">Settings saved.</Notice> : null}

      <div className="grid sm:grid-cols-2 gap-3">
        <Field
          label="Membership fee (LKR)"
          name="membershipFee"
          type="number"
          min={0}
          step="0.01"
          required
          defaultValue={settings.membershipFee}
          hint="Default for clubs that don't set their own."
        />
        <Field
          label="Term (months)"
          name="termMonths"
          type="number"
          min={1}
          required
          defaultValue={settings.termMonths}
          hint="How long a membership lasts."
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field
          label="Expiring soon (days)"
          name="expiringSoonDays"
          type="number"
          min={1}
          required
          defaultValue={settings.expiringSoonDays}
          hint="How early members are nudged to renew."
        />
        <Field
          label="Grace period (days)"
          name="graceDays"
          type="number"
          min={0}
          required
          defaultValue={settings.graceDays}
          hint="Days after expiry before access is cut."
        />
      </div>

      <Field
        label="Member book discount (%)"
        name="bookDiscount"
        type="number"
        min={0}
        max={100}
        step="0.01"
        required
        defaultValue={settings.bookDiscount}
        hint="Applied to catalogue prices in the portal. Separate from the main site's own discount."
      />

      <fieldset className="border-t border-line pt-4">
        <legend className="sr-only">Borrowing add-on</legend>
        <p className="text-sm font-medium text-ink mb-3">Borrowing add-on</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field
            label="Borrowing fee (LKR)"
            name="libraryFee"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={settings.libraryFee}
            hint="What members pay to borrow, on top of membership."
          />
          <Field
            label="Borrowing term (months)"
            name="libraryTermMonths"
            type="number"
            min={1}
            required
            defaultValue={settings.libraryTermMonths}
            hint="It renews rather than being bought once."
          />
        </div>
      </fieldset>

      <fieldset className="border-t border-line pt-4">
        <legend className="sr-only">Read and Rise</legend>
        <p className="text-sm font-medium text-ink mb-3">Read and Rise</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field
            label="Share of each order (%)"
            name="readrisePercent"
            type="number"
            min={0}
            max={100}
            step="0.01"
            required
            defaultValue={settings.readrisePercent}
            hint="Changing this affects orders priced from now on. What past orders donated stays as it was."
          />
          <Field
            label="Cost of one donated book (LKR)"
            name="readriseBookCost"
            type="number"
            min={1}
            step="0.01"
            required
            defaultValue={settings.readriseBookCost}
            hint="Used to turn rupees donated into a number of books."
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <Field
            label="Target (books)"
            name="readriseTarget"
            type="number"
            min={1}
            required
            defaultValue={settings.readriseTarget}
            hint="Shown as a progress bar on every member's home page."
          />
          <Field
            label="Target date"
            name="readriseTargetOn"
            type="date"
            required
            defaultValue={settings.readriseTargetOn}
          />
        </div>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}

export function PointsRulesForm({ rules }: { rules: PointsRule[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(null);

  function save(code: string, points: string) {
    setError(null);
    setSavedCode(null);
    const fd = new FormData();
    fd.set("code", code);
    fd.set("points", points);

    startTransition(async () => {
      const result = await updatePointsRule(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedCode(code);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error ? <Notice>{error}</Notice> : null}

      <Notice tone="info">
        Changing a value affects future sessions only. Points already awarded
        keep what they were worth at the time.
      </Notice>

      <ul className="divide-y divide-line">
        {rules.map((rule) => (
          <li key={rule.code} className="py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <label
                htmlFor={`points-${rule.code}`}
                className="block text-sm font-medium text-ink"
              >
                {rule.label}
              </label>
              <p className="text-xs text-ink-faint">{rule.code}</p>
            </div>
            {/* The width lives on a wrapper: controlClassName carries w-full,
                which wins over a w-24 beside it and stretched the box across
                the row, squeezing the label into a one-word column. */}
            <div className="w-24 shrink-0">
              <input
                id={`points-${rule.code}`}
                type="number"
                min={0}
                defaultValue={rule.points}
                className={`${controlClassName} text-right tabular-nums`}
                onBlur={(e) => {
                  if (Number(e.target.value) !== rule.points) {
                    save(rule.code, e.target.value);
                  }
                }}
              />
            </div>
            <span className="text-xs text-ink-faint">pts</span>
            <span className="text-xs text-success-600 w-12 shrink-0">
              {savedCode === rule.code && !pending ? "saved" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type AppTextsValue = {
  libraryCollectAt: string;
  joinGuidelines: string;
  borrowEmailSubject: string;
  borrowEmailBody: string;
};

/** What each placeholder stands for, shown under the email boxes. */
const EMAIL_TOKENS: [string, string][] = [
  ["{name}", "the member's first name"],
  ["{book}", "the book and its author"],
  ["{title}", "just the title"],
  ["{place}", "where books are collected"],
  ["{due}", "the date it is due back"],
  ["{due_line}", "a whole sentence about the due date"],
  ["{link}", "a link to their borrowing page"],
];

/** The same substitution the mailer does, for the preview. */
function fillPreview(text: string, collectAt: string): string {
  const values: Record<string, string> = {
    name: "Nimali",
    book: "The Book Thief by Markus Zusak",
    title: "The Book Thief",
    place: collectAt.trim() || "the Pick a Book office",
    due: "8 October 2026",
    due_line: "Please return it by 8 October 2026.",
    link: "https://member.pickabook.lk/library",
  };
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? values[key] : whole,
  );
}

/**
 * The club's own writing: the collection place and the join guidelines.
 *
 * One guideline per line, because the join form turns each line into its own
 * tick box -- so the shape of this textarea is the shape of what an applicant
 * has to agree to, and an admin can see that without a preview.
 */
export function AppTextsForm({ texts }: { texts: AppTextsValue }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [guidelines, setGuidelines] = useState(texts.joinGuidelines);
  const [collectAt, setCollectAt] = useState(texts.libraryCollectAt);
  const [subject, setSubject] = useState(texts.borrowEmailSubject);
  const [body, setBody] = useState(texts.borrowEmailBody);

  const count = guidelines.split("\n").filter((line) => line.trim()).length;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateAppTexts(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}
      {saved ? <Notice tone="success">Saved.</Notice> : null}

      <Field
        label="Where books are collected"
        name="libraryCollectAt"
        value={collectAt}
        onChange={(e) => setCollectAt(e.target.value)}
        maxLength={200}
        hint="Named in the email a member gets when their borrow request is approved."
      />

      <div className="rounded-xl border border-line bg-canvas p-3 sm:p-4">
        <p className="text-sm font-medium text-ink">
          The email when a borrow request is approved
        </p>
        <p className="mb-3 mt-0.5 text-xs text-ink-muted">
          Leave a box empty to go back to the wording Pick a Book ships with.
        </p>

        <div className="space-y-3">
          <Field
            label="Subject"
            name="borrowEmailSubject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
          />

          <div>
            <label
              htmlFor="borrowEmailBody"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Message
            </label>
            <textarea
              id="borrowEmailBody"
              name="borrowEmailBody"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={9}
              maxLength={4000}
              className={`${controlClassName} min-h-44 leading-relaxed`}
            />
            <p className="mt-1 text-xs text-ink-muted">
              A blank line starts a new paragraph. The link to their borrowing
              page is added at the end as a button.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {EMAIL_TOKENS.map(([token, means]) => (
              <p key={token} className="text-xs text-ink-muted">
                <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] text-brand-700">
                  {token}
                </code>{" "}
                {means}
              </p>
            ))}
          </div>

          <details className="rounded-lg border border-line bg-surface p-3">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              Preview
            </summary>
            <p className="mt-2 text-sm font-medium text-ink">
              {fillPreview(subject || "{book} is ready to collect", collectAt)}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
              {fillPreview(
                body ||
                  "Hello {name},\n\nYour borrow request for {book} has been approved.\n\nCome to {place} to pick it up, and bring your member details.\n\n{due_line}",
                collectAt,
              )}
            </p>
          </details>
        </div>
      </div>

      <div>
        <label
          htmlFor="joinGuidelines"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Registration guidelines
        </label>
        <textarea
          id="joinGuidelines"
          name="joinGuidelines"
          value={guidelines}
          onChange={(e) => setGuidelines(e.target.value)}
          rows={8}
          maxLength={4000}
          className={`${controlClassName} min-h-40 leading-relaxed`}
        />
        <p className="mt-1 text-xs text-ink-muted">
          One guideline per line. An applicant has to tick every line before
          they can apply — {count} {count === 1 ? "line" : "lines"} right now.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
