"use server";

import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";
import { getSiteUrl } from "@/lib/supabase/env";
import { buildCheckout, isPayHereConfigured } from "@/lib/payments/payhere";

export type CheckoutPayload = {
  action: string;
  fields: Record<string, string>;
  orderRef: string;
  amount: string;
};

export type ActionResult =
  | { ok: true; data: CheckoutPayload }
  | { ok: false; error: string };

const clubSchema = z.string().uuid();

/**
 * Starts a club membership payment -- joining a new club or renewing one.
 *
 * The amount comes from start_club_membership_payment(), which reads the
 * club's fee (or the global default) server-side. The client sends only a club
 * id; any amount in the request is ignored because there is nowhere to put it.
 */
export async function startClubPayment(formData: FormData): Promise<ActionResult> {
  const member = await requireActiveMember();

  if (!isPayHereConfigured()) {
    return {
      ok: false,
      error:
        "Online payment isn't set up yet. Please contact the club to pay another way.",
    };
  }

  const clubId = clubSchema.safeParse(formData.get("clubId"));
  if (!clubId.success) return { ok: false, error: "Invalid club." };

  const supabase = await getActionSupabase();
  const { data, error } = await supabase.rpc("start_club_membership_payment", {
    p_club_id: clubId.data,
  });

  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : undefined;
  if (!row) return { ok: false, error: "Couldn't start the payment." };

  const siteUrl = getSiteUrl();
  const checkout = buildCheckout({
    orderRef: row.order_ref as string,
    amount: row.amount as number,
    itemDescription: `${row.club_name} membership`,
    returnUrl: `${siteUrl}/renew/result?ref=${row.order_ref}`,
    cancelUrl: `${siteUrl}/renew?cancelled=1`,
    notifyUrl: `${siteUrl}/api/payhere/notify`,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
  });

  return {
    ok: true,
    data: {
      action: checkout.action,
      fields: checkout.fields,
      orderRef: row.order_ref as string,
      amount: checkout.fields.amount,
    },
  };
}

const bookingSchema = z.string().uuid();

export async function startBookingPayment(formData: FormData): Promise<ActionResult> {
  const member = await requireActiveMember();

  if (!isPayHereConfigured()) {
    return {
      ok: false,
      error:
        "Online payment isn't set up yet. Please contact the club to pay another way.",
    };
  }

  const bookingId = bookingSchema.safeParse(formData.get("bookingId"));
  if (!bookingId.success) return { ok: false, error: "Invalid booking." };

  const supabase = await getActionSupabase();
  const { data, error } = await supabase.rpc("start_session_booking_payment", {
    p_booking_id: bookingId.data,
  });

  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : undefined;
  if (!row) return { ok: false, error: "Couldn't start the payment." };

  const siteUrl = getSiteUrl();
  const checkout = buildCheckout({
    orderRef: row.order_ref as string,
    amount: row.amount as number,
    itemDescription: `Session: ${row.session_title ?? "booking"}`,
    returnUrl: `${siteUrl}/renew/result?ref=${row.order_ref}`,
    cancelUrl: `${siteUrl}/sessions`,
    notifyUrl: `${siteUrl}/api/payhere/notify`,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
  });

  return {
    ok: true,
    data: {
      action: checkout.action,
      fields: checkout.fields,
      orderRef: row.order_ref as string,
      amount: checkout.fields.amount,
    },
  };
}
