"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { Notice, selectClassName } from "@/components/ui/Field";
import type { JoinableClub } from "@/app/join/JoinForm";

/**
 * Shown to a confirmed account that has no application yet.
 *
 * This is the tail of the email-confirmation path: /join creates the account,
 * but Supabase withholds a session until the address is confirmed, so the club
 * choice cannot be submitted at that moment. It is stashed in sessionStorage
 * and applied here. If the stash is gone -- different device, cleared tab --
 * they just pick again.
 */
export function ApplyToClub({ clubs }: { clubs: JoinableClub[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  // The select stays UNCONTROLLED and the stashed choice is written straight
  // to the DOM node after mount. sessionStorage does not exist during SSR, so
  // seeding React state from it would either desync hydration or require a
  // setState inside an effect -- an extra render for something the browser can
  // just be told once.
  useEffect(() => {
    const stashed = window.sessionStorage.getItem("pab:pending-club");
    if (stashed && selectRef.current && clubs.some((c) => c.id === stashed)) {
      selectRef.current.value = stashed;
    }
  }, [clubs]);

  async function apply(clubId: string) {
    setError(null);
    setBusy(true);

    const supabase = getBrowserSupabaseClient();
    const { error: rpcError } = await supabase.rpc("request_club_join", {
      p_club_id: clubId,
    });

    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return;
    }

    window.sessionStorage.removeItem("pab:pending-club");
    router.refresh();
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const clubId = String(form.get("club_id") ?? "");
    if (!clubId) {
      setError("Please choose a club.");
      return;
    }
    await apply(clubId);
  }

  if (!clubs.length) {
    return (
      <Notice tone="info">
        There aren&apos;t any public clubs accepting members right now. Please
        check back later.
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 text-left">
      {error ? <Notice>{error}</Notice> : null}

      <label htmlFor="club_id" className="block text-sm font-medium text-ink">
        Choose a club to join
      </label>
      <select
        ref={selectRef}
        id="club_id"
        name="club_id"
        required
        defaultValue={clubs.length === 1 ? clubs[0].id : ""}
        className={selectClassName}
      >
        <option value="" disabled>
          Choose a club…
        </option>
        {clubs.map((club) => (
          <option key={club.id} value={club.id}>
            {club.name}
          </option>
        ))}
      </select>

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Sending…" : "Apply to join"}
      </Button>
    </form>
  );
}
