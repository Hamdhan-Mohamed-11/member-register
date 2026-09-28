import { NextResponse, type NextRequest } from "next/server";
import { csvFilename, csvResponse, toCsv } from "@/lib/admin/csv";
import { getSessionMember } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { CLUB_TZ } from "@/lib/time";

/**
 * The club's lists, as a spreadsheet: members, sessions, payments.
 *
 * A GET rather than a server action because the answer is a file: the browser
 * downloads it with one link, with no blob to hold in memory on the page.
 *
 * Every query runs under the caller's own session, so RLS decides what is in
 * the file -- a club admin's export contains their club and nothing else
 * without this route having to remember to filter. The club filter below is
 * belt and braces, and the role check is the door.
 */
export const dynamic = "force-dynamic";

const KINDS = ["members", "sessions", "payments"] as const;
type Kind = (typeof KINDS)[number];

function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value);
}

/** A timestamp as Colombo sees it, which is the only way these dates mean anything. */
function when(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", {
    timeZone: CLUB_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  if (!isKind(kind)) return NextResponse.json({ error: "Unknown export" }, { status: 404 });

  const member = await getSessionMember();
  // Secretaries do the club's work; taking a copy of its people out of the
  // portal is a decision for whoever answers for the club.
  if (!member || (member.role !== "super_admin" && member.role !== "club_admin")) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const isSuper = member.role === "super_admin";
  const clubId = isSuper ? null : member.staffClubId;
  if (!isSuper && !clubId) {
    return NextResponse.json({ error: "No club assigned" }, { status: 403 });
  }

  const supabase = await getServerComponentSupabase();
  const scope = isSuper ? null : member.staffClubName;

  if (kind === "members") {
    // Through club_memberships, not profiles: the export is of a club's
    // members, and a super admin's "everyone" is every membership of every
    // club rather than every account that ever signed up.
    let query = supabase
      .from("club_memberships")
      .select(
        `status, is_primary, renewal_date, joined_on,
         clubs ( name ),
         profiles ( first_name, last_name, email, phone, status, role, points_balance, joined_on )`,
      )
      .order("joined_on", { ascending: false });
    if (clubId) query = query.eq("club_id", clubId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Row = {
      status: string;
      is_primary: boolean;
      renewal_date: string | null;
      joined_on: string | null;
      clubs: { name: string } | null;
      profiles: {
        first_name: string;
        last_name: string;
        email: string;
        phone: string | null;
        status: string;
        role: string;
        points_balance: number;
        joined_on: string | null;
      } | null;
    };

    const rows = ((data ?? []) as unknown as Row[])
      .filter((r) => r.profiles)
      .map((r) => [
        r.profiles!.first_name,
        r.profiles!.last_name,
        r.profiles!.email,
        r.profiles!.phone ?? "",
        r.clubs?.name ?? "",
        r.status,
        r.is_primary ? "yes" : "no",
        r.renewal_date ?? "",
        r.profiles!.status,
        r.profiles!.role,
        r.profiles!.points_balance,
        when(r.joined_on ?? r.profiles!.joined_on),
      ]);

    return csvResponse(
      toCsv(
        [
          "First name",
          "Last name",
          "Email",
          "Phone",
          "Club",
          "Membership",
          "Primary club",
          "Renews on",
          "Account status",
          "Role",
          "Points",
          "Joined",
        ],
        rows,
      ),
      csvFilename("members", scope),
    );
  }

  if (kind === "sessions") {
    let query = supabase
      .from("sessions")
      .select(
        `id, title, held_at, location, book_title, book_author, guest_fee_lkr, pricing_kind,
         capacity, status, presenter_count,
         clubs ( name ),
         presenter:profiles!sessions_presenter_member_id_fkey ( first_name, last_name )`,
      )
      .order("held_at", { ascending: false });
    if (clubId) query = query.eq("host_club_id", clubId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Row = {
      id: string;
      title: string;
      held_at: string;
      location: string | null;
      book_title: string | null;
      book_author: string | null;
      guest_fee_lkr: number | null;
      pricing_kind: string | null;
      capacity: number | null;
      status: string | null;
      presenter_count: number | null;
      clubs: { name: string } | null;
      presenter: { first_name: string; last_name: string } | null;
    };

    // Attendance is the thing anyone actually wants counted, and it lives in
    // another table -- one query for the lot rather than one per session.
    const { data: attendance } = await supabase
      .from("member_activities")
      .select("session_id, activity_code");
    const attended = new Map<string, number>();
    for (const a of (attendance ?? []) as { session_id: string; activity_code: string }[]) {
      if (a.activity_code !== "attend") continue;
      attended.set(a.session_id, (attended.get(a.session_id) ?? 0) + 1);
    }

    const rows = ((data ?? []) as unknown as Row[]).map((s) => [
      s.title,
      when(s.held_at),
      s.clubs?.name ?? "",
      s.location ?? "",
      s.book_title ?? "",
      s.book_author ?? "",
      s.presenter ? `${s.presenter.first_name} ${s.presenter.last_name}`.trim() : "",
      s.pricing_kind ?? "",
      s.guest_fee_lkr ?? 0,
      s.capacity ?? "",
      s.status ?? "",
      attended.get(s.id) ?? 0,
    ]);

    return csvResponse(
      toCsv(
        [
          "Session",
          "Held",
          "Club",
          "Where",
          "Book",
          "Author",
          "Presenter",
          "Pricing",
          "Guest fee (LKR)",
          "Capacity",
          "Status",
          "Attended",
        ],
        rows,
      ),
      csvFilename("sessions", scope),
    );
  }

  // payments
  let query = supabase
    .from("payments")
    .select(
      `created_at, paid_at, purpose, amount_lkr, currency, status, provider,
       provider_order_ref, provider_payment_id, note, member_email, member_name,
       clubs ( name ), profiles ( first_name, last_name, email )`,
    )
    .order("created_at", { ascending: false });
  if (clubId) query = query.eq("club_id", clubId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type PaymentRow = {
    created_at: string;
    paid_at: string | null;
    purpose: string;
    amount_lkr: number;
    currency: string | null;
    status: string;
    provider: string | null;
    provider_order_ref: string | null;
    provider_payment_id: string | null;
    note: string | null;
    member_email: string | null;
    member_name: string | null;
    clubs: { name: string } | null;
    profiles: { first_name: string; last_name: string; email: string } | null;
  };

  const rows = ((data ?? []) as unknown as PaymentRow[]).map((p) => [
    when(p.created_at),
    when(p.paid_at),
    p.purpose,
    p.amount_lkr,
    p.currency ?? "LKR",
    p.status,
    p.provider ?? "",
    p.provider_order_ref ?? "",
    p.provider_payment_id ?? "",
    p.profiles
      ? `${p.profiles.first_name} ${p.profiles.last_name}`.trim()
      : (p.member_name ?? ""),
    p.profiles?.email ?? p.member_email ?? "",
    p.clubs?.name ?? "",
    p.note ?? "",
  ]);

  return csvResponse(
    toCsv(
      [
        "Created",
        "Paid",
        "Purpose",
        "Amount",
        "Currency",
        "Status",
        "Provider",
        "Order ref",
        "Payment id",
        "Member",
        "Email",
        "Club",
        "Note",
      ],
      rows,
    ),
    csvFilename("payments", scope),
  );
}
