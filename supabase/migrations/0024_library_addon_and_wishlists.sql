-- ---------------------------------------------------------------------------
-- 0024 — the borrowing add-on, borrow requests, and wishlists
-- ---------------------------------------------------------------------------
--
-- Borrowing is a paid extra on top of club membership: LKR 6,000, renewing
-- annually rather than bought once. It is deliberately NOT modelled as another
-- club membership, even though the money flow is nearly identical -- a club
-- membership grants visibility of other members, a renewal date on /me, and a
-- place on a leaderboard, none of which should follow from paying to borrow
-- books.
--
-- So it is one date on the profile. `library_expires_on` in the future means
-- the borrowing catalogue is visible and requests are accepted; null or past
-- means it is not.
-- ---------------------------------------------------------------------------

-- The fee is a setting, not a constant, for the same reason the membership fee
-- is: changing a price should not need a deployment.
alter table app_settings
  add column if not exists library_addon_fee_lkr numeric(12,2) not null default 6000.00,
  add column if not exists library_addon_term_months int not null default 12;

alter table app_settings drop constraint if exists app_settings_library_fee_check;
alter table app_settings add constraint app_settings_library_fee_check
  check (library_addon_fee_lkr >= 0 and library_addon_term_months > 0);

alter table profiles
  add column if not exists library_expires_on date;

comment on column profiles.library_expires_on is
  'Borrowing add-on paid until this date. Null or past = no borrowing.';

-- ---------------------------------------------------------------------------
-- Who may borrow
-- ---------------------------------------------------------------------------
-- One function, used by the RLS policies, the RPCs and the pages, so the
-- answer cannot differ between what a member is shown and what they are
-- allowed to do. An expired add-on fails exactly like one that never existed.
create or replace function public.has_library_access(p_member_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = p_member_id
      and status = 'active'
      and library_expires_on is not null
      and library_expires_on >= current_date
  );
$$;

create or replace function public.current_member_has_library()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_library_access((select auth.uid()));
$$;

revoke execute on function
  public.has_library_access(uuid), public.current_member_has_library() from public;
grant execute on function
  public.has_library_access(uuid), public.current_member_has_library() to authenticated;

-- ---------------------------------------------------------------------------
-- Paying for it
-- ---------------------------------------------------------------------------
alter table payments drop constraint if exists payments_purpose_check;
alter table payments add constraint payments_purpose_check
  check (purpose in ('club_membership','session_booking','book_order','library_addon'));

-- The add-on belongs to a member, not to a club, a booking or an order, so it
-- carries none of those ids. Mirrors the existing per-purpose shape rules.
alter table payments drop constraint if exists payments_target_ck;
alter table payments add constraint payments_target_ck check (
  (purpose = 'club_membership' and booking_id is null and order_id is null)
  or (purpose = 'session_booking' and club_id is null and order_id is null)
  or (purpose = 'book_order' and club_id is null and booking_id is null)
  or (purpose = 'library_addon' and club_id is null and booking_id is null and order_id is null)
);

create or replace function public.start_library_addon_payment()
returns table (
  payment_id uuid,
  order_ref  text,
  amount     numeric,
  is_renewal boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_fee  numeric;
  v_term int;
  v_exp  date;
  v_ref  text;
  v_id   uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select library_expires_on into v_exp
  from profiles where id = v_me and status = 'active';
  if not found then
    raise exception 'your account is not active';
  end if;

  select library_addon_fee_lkr, library_addon_term_months into v_fee, v_term
  from app_settings where id = 1;

  if coalesce(v_fee, 0) <= 0 then
    raise exception 'borrowing is not on sale at the moment';
  end if;

  -- One pending add-on payment at a time. Without this, tapping the pay button
  -- twice leaves two pending rows, and both settle if the member pays once and
  -- PayHere retries -- which would add two years for one payment.
  update payments
  set status = 'cancelled', note = 'superseded by a newer attempt'
  where member_id = v_me and purpose = 'library_addon' and status = 'pending';

  v_ref := public.new_payment_ref('LB');

  insert into payments (purpose, member_id, provider_order_ref, amount_lkr, term_months)
  values ('library_addon', v_me, v_ref, v_fee, coalesce(v_term, 12))
  returning id into v_id;

  return query
  select v_id, v_ref, v_fee, (v_exp is not null);
end;
$$;

revoke execute on function public.start_library_addon_payment() from public;
grant execute on function public.start_library_addon_payment() to authenticated;

-- ---------------------------------------------------------------------------
-- Wishlists
-- ---------------------------------------------------------------------------
-- Two lists in one table, separated by `kind`: books to borrow later, and books
-- to buy later. They behave identically and differ only in which button added
-- them, so two tables would be two of everything for no gain.
--
-- Title and author are SNAPSHOTS. The catalogue lives in a MySQL database on
-- another host that is periodically unreachable (there is a circuit breaker
-- for it), and a wishlist that renders as a list of blank rows when that host
-- is slow is useless. The price is deliberately NOT snapshotted -- prices
-- change, and a stale price on a buy list is a promise the shop has to honour.
create table if not exists book_wishlist (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references profiles(id) on delete cascade,
  book_id    bigint not null,
  kind       text not null check (kind in ('borrow','buy')),
  title      text not null default '',
  author     text not null default '',
  created_at timestamptz not null default now(),
  unique (member_id, book_id, kind)
);

create index if not exists book_wishlist_member_idx
  on book_wishlist (member_id, kind, created_at desc);

alter table book_wishlist enable row level security;
revoke all on book_wishlist from anon, authenticated;
grant select, insert, delete on book_wishlist to authenticated;

-- A wishlist is private. Not even an admin needs to browse it, and "who wants
-- what" across the membership is exactly the sort of thing that should not be
-- casually readable.
drop policy if exists book_wishlist_own on book_wishlist;
create policy book_wishlist_own on book_wishlist
for all to authenticated
using (member_id = (select auth.uid()))
with check (member_id = (select auth.uid()));

-- No UPDATE grant: a wishlist row has nothing worth editing, and add/remove is
-- the whole interaction.

-- ---------------------------------------------------------------------------
-- Borrow requests
-- ---------------------------------------------------------------------------
create table if not exists borrow_requests (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references profiles(id) on delete cascade,
  book_id     bigint not null,
  title       text not null default '',
  author      text not null default '',
  status      text not null default 'requested'
              check (status in ('requested','approved','issued','returned','rejected','cancelled')),
  note        text,
  due_on      date,
  requested_at timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references profiles(id) on delete set null,
  returned_at timestamptz
);

create index if not exists borrow_requests_member_idx
  on borrow_requests (member_id, requested_at desc);
create index if not exists borrow_requests_open_idx
  on borrow_requests (status, requested_at desc);

alter table borrow_requests enable row level security;
revoke all on borrow_requests from anon, authenticated;
grant select on borrow_requests to authenticated;

drop policy if exists borrow_requests_select on borrow_requests;
create policy borrow_requests_select on borrow_requests
for select to authenticated
using (member_id = (select auth.uid()) or (select public.is_admin()));

-- No INSERT or UPDATE policy. Both go through the RPCs below, because both
-- carry a rule a row policy cannot express: the add-on must be paid and in
-- date, and a member may only withdraw a request nobody has acted on yet.

create or replace function public.request_borrow(
  p_book_id bigint,
  p_title   text default '',
  p_author  text default ''
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  -- THE paywall. The catalogue page also hides itself from members without the
  -- add-on, but that is presentation; this is the rule.
  if not public.has_library_access(v_me) then
    raise exception 'borrowing needs the library add-on';
  end if;

  if exists (
    select 1 from borrow_requests
    where member_id = v_me and book_id = p_book_id
      and status in ('requested','approved','issued')
  ) then
    raise exception 'you have already asked for this book';
  end if;

  -- A cap on how many books are out at once, so one member cannot empty the
  -- shelf. Three is a guess; it is a single number to change if it is wrong.
  if (
    select count(*) from borrow_requests
    where member_id = v_me and status in ('approved','issued')
  ) >= 3 then
    raise exception 'you already have three books out; please return one first';
  end if;

  insert into borrow_requests (member_id, book_id, title, author)
  values (v_me, p_book_id, coalesce(trim(p_title), ''), coalesce(trim(p_author), ''))
  returning id into v_id;

  -- Taking a book off the borrow wishlist once it is actually requested keeps
  -- the two lists from disagreeing about what the member is still waiting for.
  delete from book_wishlist
  where member_id = v_me and book_id = p_book_id and kind = 'borrow';

  return v_id;
end;
$$;

create or replace function public.cancel_borrow_request(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  update borrow_requests
  set status = 'cancelled', decided_at = now()
  where id = p_id and member_id = v_me and status = 'requested';

  if not found then
    raise exception 'that request cannot be withdrawn any more';
  end if;
end;
$$;

-- Admin side: approve, hand over, take back.
create or replace function public.set_borrow_status(
  p_id     uuid,
  p_status text,
  p_due_on date default null,
  p_note   text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  if p_status not in ('approved','issued','returned','rejected') then
    raise exception 'invalid status';
  end if;

  select to_jsonb(b) into v_before from borrow_requests b where b.id = p_id;
  if v_before is null then
    raise exception 'request not found';
  end if;

  update borrow_requests
  set status      = p_status,
      note        = coalesce(nullif(trim(p_note), ''), note),
      due_on      = case when p_status = 'issued' then coalesce(p_due_on, current_date + 21)
                         else due_on end,
      returned_at = case when p_status = 'returned' then now() else returned_at end,
      decided_at  = now(),
      decided_by  = auth.uid()
  where id = p_id;

  perform public.write_audit('borrow.' || p_status, 'borrow_request', p_id::text,
    v_before, (select to_jsonb(b) from borrow_requests b where b.id = p_id));

  -- Tell the member. A book approved in silence is a book nobody collects.
  perform public.notify_member(
    (select member_id from borrow_requests where id = p_id),
    case when p_status = 'rejected' then 'borrow.rejected' else 'borrow.updated' end,
    case p_status
      when 'approved' then 'Your borrow request was approved'
      when 'issued'   then 'Your book is ready to collect'
      when 'returned' then 'Thanks for returning your book'
      else 'Your borrow request was declined'
    end,
    (select title from borrow_requests where id = p_id),
    '/me/borrowing',
    'borrow:' || p_id::text
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership normalisation -- run this migration as supabase_admin
-- ---------------------------------------------------------------------------
-- `notifications`, `club_types`, `badges` and `member_badges` came out of
-- migrations 0019-0021 owned by `supabase_admin`, because those were applied
-- through Studio's SQL editor; every other table in this schema is owned by
-- `postgres`. In self-hosted Supabase `postgres` is NOT a superuser, so it
-- cannot alter a supabase_admin-owned table -- which is how this migration
-- first failed, at exactly the line below, with "must be owner of table
-- notifications".
--
-- Left alone it recurs on every future migration that touches one of those
-- four. Normalising them to `postgres` matches the other eighteen and makes
-- the schema alterable by the same role that owns the rest of it. Policies,
-- grants and indexes all survive an owner change untouched.
--
-- This block needs a superuser, so apply the whole file as supabase_admin:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -f -
-- CREATE OR REPLACE FUNCTION does not change an existing function's owner, so
-- apply_payhere_notification below stays owned by postgres either way.
do $$
declare
  t text;
begin
  foreach t in array array['notifications','club_types','badges','member_badges'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I owner to postgres', t);
    end if;
  end loop;
end $$;

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'video.approved','video.rejected','join.approved','join.rejected',
    'payment.received','points.awarded','membership.added','membership.changed',
    'role.changed','account.status','badge.earned',
    'borrow.updated','borrow.rejected','library.activated'
  ));

revoke execute on function
  public.request_borrow(bigint, text, text),
  public.cancel_borrow_request(uuid),
  public.set_borrow_status(uuid, text, date, text)
from public;

grant execute on function
  public.request_borrow(bigint, text, text),
  public.cancel_borrow_request(uuid)
to authenticated;

grant execute on function public.set_borrow_status(uuid, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Settlement — the add-on branch
-- ---------------------------------------------------------------------------
-- Identical to 0014 apart from the library_addon case. Extends from
-- GREATEST(current expiry, today) for exactly the reason the membership branch
-- does: renewing early must add a year to what is left, not burn it.
create or replace function public.apply_payhere_notification(
  p_order_ref    text,
  p_payment_id   text,
  p_status_code  int,
  p_amount       numeric,
  p_currency     text,
  p_signature_ok boolean,
  p_payload      jsonb
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_pay     payments%rowtype;
  v_new     date;
  v_first   boolean;
  v_outcome text;
begin
  -- 1. Bad signature: log and stop. Never trust the body.
  if not p_signature_ok then
    insert into payment_events (provider_order_ref, status_code, signature_ok, applied, outcome, payload)
    values (p_order_ref, p_status_code, false, false, 'bad_signature', p_payload);
    return 'bad_signature';
  end if;

  -- 2. Lock the payment row. Two concurrent retries serialise here.
  select * into v_pay from payments where provider_order_ref = p_order_ref for update;

  if not found then
    insert into payment_events (provider_order_ref, status_code, signature_ok, applied, outcome, payload)
    values (p_order_ref, p_status_code, true, false, 'unknown_ref', p_payload);
    return 'unknown_ref';
  end if;

  -- 3. THE idempotency key. A second successful notification for an
  --    already-successful payment must not advance a renewal date twice.
  if v_pay.status in ('success','manual') then
    insert into payment_events (payment_id, provider_order_ref, status_code, signature_ok, applied, outcome, payload)
    values (v_pay.id, p_order_ref, p_status_code, true, false, 'already_applied', p_payload);
    return 'already_applied';
  end if;

  -- 4. A valid signature over a tampered amount is still a tampered amount.
  if p_amount is distinct from v_pay.amount_lkr or upper(p_currency) <> upper(v_pay.currency) then
    insert into payment_events (payment_id, provider_order_ref, status_code, signature_ok, applied, outcome, payload)
    values (v_pay.id, p_order_ref, p_status_code, true, false, 'amount_mismatch', p_payload);
    return 'amount_mismatch';
  end if;

  -- 5. Failure codes: record and stop. 2 = success, 0 = pending,
  --    -1 = cancelled, -2 = failed, -3 = chargedback.
  if p_status_code <> 2 then
    update payments
    set status = case p_status_code
                   when 0  then 'pending'
                   when -1 then 'cancelled'
                   when -3 then 'chargedback'
                   else 'failed'
                 end,
        status_code = p_status_code,
        raw_notification = p_payload
    where id = v_pay.id;

    insert into payment_events (payment_id, provider_order_ref, status_code, signature_ok, applied, outcome, payload)
    values (v_pay.id, p_order_ref, p_status_code, true, true, 'not_successful', p_payload);
    return 'not_successful';
  end if;

  -- 6. Success. Flip the payment AND apply the side effect in the SAME
  --    transaction -- there must be no window where money is taken and the
  --    membership is not extended.
  update payments
  set status = 'success', provider_payment_id = p_payment_id,
      status_code = p_status_code, paid_at = now(), raw_notification = p_payload
  where id = v_pay.id;

  if v_pay.purpose = 'club_membership' then
    v_first := not exists (
      select 1 from club_memberships where member_id = v_pay.member_id and is_primary
    );

    insert into club_memberships
      (member_id, club_id, status, is_primary, joined_on, renewal_date)
    values (
      v_pay.member_id, v_pay.club_id, 'active', v_first, current_date,
      (current_date + (coalesce(v_pay.term_months, 12) || ' months')::interval)::date
    )
    on conflict (member_id, club_id) do update
      -- Extend from GREATEST(current renewal, today). Renewing three months
      -- early must add a full term to the existing expiry, not restart from
      -- today and burn the remaining three months -- members notice that.
      set status = 'active',
          joined_on = coalesce(club_memberships.joined_on, current_date),
          renewal_date = (
            greatest(coalesce(club_memberships.renewal_date, current_date), current_date)
            + (coalesce(v_pay.term_months, 12) || ' months')::interval
          )::date
    returning renewal_date into v_new;

    v_outcome := 'membership_extended';

  elsif v_pay.purpose = 'session_booking' then
    update session_bookings
    set status = 'confirmed', confirmed_at = now()
    where id = v_pay.booking_id;

    v_outcome := 'booking_confirmed';

  elsif v_pay.purpose = 'library_addon' then
    update profiles
    set library_expires_on = (
      greatest(coalesce(library_expires_on, current_date), current_date)
      + (coalesce(v_pay.term_months, 12) || ' months')::interval
    )::date
    where id = v_pay.member_id
    returning library_expires_on into v_new;

    perform public.notify_member(
      v_pay.member_id,
      'library.activated',
      'Borrowing is now open to you',
      'You can borrow books until ' || to_char(v_new, 'DD Mon YYYY') || '.',
      '/library',
      'library:' || v_pay.id::text
    );

    v_outcome := 'library_extended';
  else
    v_outcome := 'applied';
  end if;

  insert into payment_events (payment_id, provider_order_ref, status_code, signature_ok, applied, outcome, payload)
  values (v_pay.id, p_order_ref, p_status_code, true, true, v_outcome, p_payload);

  return v_outcome;
end;
$$;
