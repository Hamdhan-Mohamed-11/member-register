-- Let members and clubs be deleted without losing the payment record.
--
-- 0014 declared payments.member_id / club_id / booking_id as ON DELETE
-- RESTRICT, reasoning that financial records must not disappear. The reasoning
-- was right; the mechanism was wrong.
--
-- profiles cascades from auth.users, so RESTRICT on member_id means DELETING A
-- MEMBER WHO HAS EVER PAID FAILS -- with an opaque foreign-key error, from
-- inside Supabase's own admin API. That makes an account deletion request
-- impossible to honour without hand-editing the database, and it is how this
-- was found: the test suites stopped being able to clean up after themselves.
--
-- The fix is to keep the FACTS on the payment rather than a pointer to them.
-- Snapshot who paid and what for, then let the references null out. A payment
-- row remains a complete record of the transaction after every related row is
-- gone.

alter table payments
  add column if not exists member_email text,
  add column if not exists member_name  text,
  add column if not exists club_name    text,
  add column if not exists description  text;

-- Backfill from the rows that still exist.
update payments p
set member_email = coalesce(p.member_email, pr.email),
    member_name  = coalesce(p.member_name, nullif(trim(pr.first_name || ' ' || pr.last_name), ''))
from profiles pr
where pr.id = p.member_id and p.member_email is null;

update payments p
set club_name = coalesce(p.club_name, c.name)
from clubs c
where c.id = p.club_id and p.club_name is null;

-- Re-point the foreign keys at SET NULL.
alter table payments drop constraint if exists payments_member_id_fkey;
alter table payments
  alter column member_id drop not null,
  add constraint payments_member_id_fkey
    foreign key (member_id) references profiles(id) on delete set null;

alter table payments drop constraint if exists payments_club_id_fkey;
alter table payments
  add constraint payments_club_id_fkey
    foreign key (club_id) references clubs(id) on delete set null;

alter table payments drop constraint if exists payments_booking_id_fkey;
alter table payments
  add constraint payments_booking_id_fkey
    foreign key (booking_id) references session_bookings(id) on delete set null;

-- The old constraint demanded the target be present, which a deletion now
-- violates. Integrity at INSERT is enforced by the start_* RPCs, which are the
-- only way a payment is created; this keeps the weaker invariant that still
-- holds afterwards -- a payment never points at the WRONG kind of target.
alter table payments drop constraint if exists payments_target_ck;
alter table payments add constraint payments_target_ck check (
  (purpose = 'club_membership' and booking_id is null and order_id is null) or
  (purpose = 'session_booking' and club_id is null and order_id is null) or
  (purpose = 'book_order'      and club_id is null and booking_id is null)
);

comment on column payments.member_email is
  'Snapshot of who paid, so the record survives the account being deleted.';
comment on column payments.club_name is
  'Snapshot of what was paid for, so the record survives the club being deleted.';

-- ---------------------------------------------------------------------------
-- Populate the snapshots at creation time
-- ---------------------------------------------------------------------------
create or replace function public.start_club_membership_payment(p_club_id uuid)
returns table (
  payment_id uuid,
  order_ref  text,
  amount     numeric,
  club_name  text,
  is_renewal boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := auth.uid();
  v_fee      numeric;
  v_term     int;
  v_club     clubs%rowtype;
  v_profile  profiles%rowtype;
  v_existing club_memberships%rowtype;
  v_ref      text;
  v_id       uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select * into v_profile from profiles where id = v_me;
  if not found or v_profile.status <> 'active' then
    raise exception 'your account is not active';
  end if;

  select * into v_club from clubs where id = p_club_id and is_active;
  if not found then
    raise exception 'club not found';
  end if;

  select * into v_existing
  from club_memberships
  where member_id = v_me and club_id = p_club_id;

  -- Company clubs are invite-only. Letting someone buy their way in would
  -- route straight around that.
  if v_club.kind <> 'public' and not found then
    raise exception 'this club is invite only';
  end if;

  select fee_lkr, term_months into v_fee, v_term
  from public.resolve_club_terms(p_club_id);

  if coalesce(v_fee, 0) <= 0 then
    raise exception 'this club has no fee set; ask an admin to add you';
  end if;

  v_ref := public.new_payment_ref('MB');

  insert into payments (
    purpose, member_id, club_id, provider_order_ref, amount_lkr, term_months,
    member_email, member_name, club_name, description
  )
  values (
    'club_membership', v_me, p_club_id, v_ref, v_fee, coalesce(v_term, 12),
    v_profile.email,
    nullif(trim(v_profile.first_name || ' ' || v_profile.last_name), ''),
    v_club.name,
    v_club.name || ' membership'
  )
  returning id into v_id;

  return query
  select v_id, v_ref, v_fee, v_club.name, (v_existing.id is not null);
end;
$$;

create or replace function public.start_session_booking_payment(p_booking_id uuid)
returns table (payment_id uuid, order_ref text, amount numeric, session_title text)
language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := auth.uid();
  v_booking session_bookings%rowtype;
  v_profile profiles%rowtype;
  v_title   text;
  v_ref     text;
  v_id      uuid;
begin
  select * into v_booking from session_bookings where id = p_booking_id;
  if not found then
    raise exception 'booking not found';
  end if;
  if v_booking.member_id <> v_me then
    raise exception 'not authorised';
  end if;
  if v_booking.status = 'confirmed' then
    raise exception 'this booking is already confirmed';
  end if;
  if v_booking.fee_lkr <= 0 then
    raise exception 'this booking has nothing to pay';
  end if;

  select * into v_profile from profiles where id = v_me;
  select title into v_title from sessions where id = v_booking.session_id;

  -- Reuse an outstanding attempt rather than stacking references for the same
  -- booking.
  select id, provider_order_ref into v_id, v_ref
  from payments
  where purpose = 'session_booking' and booking_id = p_booking_id and status = 'pending'
  order by created_at desc
  limit 1;

  if v_id is null then
    v_ref := public.new_payment_ref('SB');
    insert into payments (
      purpose, member_id, booking_id, provider_order_ref, amount_lkr,
      member_email, member_name, description
    )
    values (
      'session_booking', v_me, p_booking_id, v_ref, v_booking.fee_lkr,
      v_profile.email,
      nullif(trim(v_profile.first_name || ' ' || v_profile.last_name), ''),
      'Session: ' || coalesce(v_title, 'booking')
    )
    returning id into v_id;
  end if;

  return query select v_id, v_ref, v_booking.fee_lkr, v_title;
end;
$$;
