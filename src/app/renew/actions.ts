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


/**
 * Pays for the borrowing add-on.
 *
 * Lives here beside the other two rather than in /library/actions, because
 * everything a PayHere checkout needs -- the configured check, buildCheckout,
 * the CheckoutPayload shape the PayButton expects -- is already here, and a
 * second copy would be a second place for the return and notify URLs to drift.
 *
 * The amount is not a parameter. start_library_addon_payment reads it from
 * app_settings and returns it, so the client never states a price.
 */
export async function startLibraryAddonPayment(): Promise<ActionResult> {
  const member = await requireActiveMember();

  if (!isPayHereConfigured()) {
    return {
      ok: false,
      error:
        "Online payment isn't set up yet. Please contact the club to pay another way.",
    };
  }

  const supabase = await getActionSupabase();
  const { data, error } = await supabase.rpc("start_library_addon_payment");
  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : undefined;
  if (!row) return { ok: false, error: "Couldn't start the payment." };

  const siteUrl = getSiteUrl();
  const checkout = buildCheckout({
    orderRef: row.order_ref as string,
    amount: row.amount as number,
    itemDescription: "Library borrowing add-on",
    returnUrl: `${siteUrl}/renew/result?ref=${row.order_ref}`,
    cancelUrl: `${siteUrl}/library?cancelled=1`,
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

const orderSchema = z.string().uuid();

/**
 * Pays for a book order whose price the club has already confirmed.
 *
 * The amount is not a parameter and cannot be. start_book_order_payment reads
 * `agreed_total_lkr` -- which only an admin RPC can write -- and refuses any
 * order that is not at status 'agreed'. See migration 0025 for why a
 * member-supplied price can never reach a checkout.
 */
export async function startBookOrderPayment(formData: FormData): Promise<ActionResult> {
  const member = await requireActiveMember();

  if (!isPayHereConfigured()) {
    return {
      ok: false,
      error:
        "Online payment isn't set up yet. Please contact the club to pay another way.",
    };
  }

  const orderId = orderSchema.safeParse(formData.get("orderId"));
  if (!orderId.success) return { ok: false, error: "Unknown order." };

  const supabase = await getActionSupabase();
  const { data, error } = await supabase.rpc("start_book_order_payment", {
    p_order_id: orderId.data,
  });
  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : undefined;
  if (!row) return { ok: false, error: "Couldn't start the payment." };

  const siteUrl = getSiteUrl();
  const checkout = buildCheckout({
    orderRef: row.order_ref as string,
    amount: row.amount as number,
    itemDescription: "Pick a Book order",
    returnUrl: `${siteUrl}/orders/${orderId.data}`,
    cancelUrl: `${siteUrl}/orders/${orderId.data}?cancelled=1`,
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
