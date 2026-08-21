"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Notice } from "@/components/ui/Field";
import { updatePointsRule, updateSettings } from "./actions";

export type Settings = {
  membershipFee: number;
  termMonths: number;
  graceDays: number;
  expiringSoonDays: number;
  bookDiscount: number;
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
          <li key={rule.code} className="py-3 flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <label
                htmlFor={`points-${rule.code}`}
                className="block text-sm font-medium text-ink"
              >
                {rule.label}
              </label>
              <p className="text-xs text-ink-faint">{rule.code}</p>
            </div>
            <input
              id={`points-${rule.code}`}
              type="number"
              min={0}
              defaultValue={rule.points}
              className="w-24 min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-600"
              onBlur={(e) => {
                if (Number(e.target.value) !== rule.points) {
                  save(rule.code, e.target.value);
                }
              }}
            />
            <span className="text-xs text-ink-faint w-12 shrink-0">
              {savedCode === rule.code && !pending ? "saved" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
