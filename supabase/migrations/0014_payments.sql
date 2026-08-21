-- Payments.
--
-- One table, several purposes. A single payments table keeps the notify
-- handler, the admin screen and reconciliation coherent; a check constraint
-- stops the shapes bleeding into each other.
--
-- club_membership covers BOTH joining a new club and renewing an existing one.
-- They are the same fee and the same flow -- the only difference is whether a
-- club_memberships row already exists -- so splitting them into two purposes
-- would duplicate every downstream branch for no gain.

create table payments (
  id                    uuid primary key default gen_random_uuid(),

  purpose               text not null
                          check (purpose in ('club_membership','session_booking','book_order')),

  member_id             uuid not null references profiles(id) on delete restrict,

  -- Exactly one of these, matching the purpose (see the constraint below).
  club_id               uuid references clubs(id) on delete restrict,
  booking_id            uuid references session_bookings(id) on delete restrict,
  order_id              uuid,   -- book orders arrive in a later phase

  provider              text not null default 'payhere',

  -- What we send PayHere as its `order_id`. Short, readable, unique: it goes
  -- on the invoice and gets quoted in support tickets.
  provider_order_ref    text not null unique,
  -- PayHere's own payment id, only known once a notification succeeds.
  provider_payment_id   text,

  amount_lkr            numeric(12,2) not null check (amount_lkr > 0),
  currency              text not null default 'LKR',

  status                text not null default 'pending'
                          check (status in ('pending','success','failed','cancelled',
                                            'chargedback','manual')),
  status_code           int,

  -- Snapshotted so the side effect is decided when the payment is CREATED, not
  -- when it settles. If an admin changes the club's term in between, the
  -- member still gets what they were quoted.
  term_months           int,

  raw_notification      jsonb,
  note                  text,

  created_at            timestamptz not null default now(),
  paid_at               timestamptz,

  constraint payments_target_ck check (
    (purpose = 'club_membership'  and club_id is not null and booking_id is null and order_id is null) or
    (purpose = 'session_booking'  and booking_id is not null and club_id is null and order_id is null) or
    (purpose = 'book_order'       and order_id is not null and club_id is null and booking_id is null)
  )
);

-- Second line of defence for idempotency: even if the status guard were
-- somehow bypassed, the same PayHere payment id cannot land twice.
create unique index payments_provider_payment_idx
  on payments(provider, provider_payment_id) where provider_payment_id is not null;
create index payments_member_idx on payments(member_id, created_at desc);
create index payments_status_idx on payments(status, created_at desc);

-- Append-only log of EVERY notification, including replays and rejected ones.
-- Never truncated: this is the reconciliation trail, and the rejected rows are
-- the ones worth having when something looks wrong.
create table payment_events (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid references payments(id) on delete set null,
  provider_order_ref text,
  status_code        int,
  signature_ok       boolean not null,
  applied            boolean not null,   -- false when ignored as a duplicate or rejected
  outcome            text,
  payload            jsonb not null,
  received_at        timestamptz not null default now()
);

create index payment_events_payment_idx on payment_events(payment_id, received_at desc);
create index payment_events_received_idx on payment_events(received_at desc);

-- ---------------------------------------------------------------------------
-- Reference generator
-- ---------------------------------------------------------------------------
create or replace function public.new_payment_ref(p_prefix text)
returns text
language sql volatile set search_path = public as $$
  select p_prefix || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

-- ---------------------------------------------------------------------------
-- start_club_membership_payment
-- ---------------------------------------------------------------------------
-- Creates a pending payment for joining or renewing a club, and returns
-- everything the checkout page needs. The AMOUNT IS COMPUTED HERE -- the client
-- sends only a club id.
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
  v_existing club_memberships%rowtype;
  v_ref      text;
  v_id       uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from profiles where id = v_me and status = 'active') then
    raise exception 'your account is not active';
  end if;

  select * into v_club from clubs where id = p_club_id and is_active;
  if not found then
    raise exception 'club not found';
  end if;

  -- Company clubs are invite-only. Letting someone buy their way in would
  -- route straight around that, so the check lives here too, not just in
  -- request_club_join.
  select * into v_existing
  from club_memberships
  where member_id = v_me and club_id = p_club_id;

  if v_club.kind <> 'public' and not found then
    raise exception 'this club is invite only';
  end if;

  select fee_lkr, term_months into v_fee, v_term
  from public.resolve_club_terms(p_club_id);

  if coalesce(v_fee, 0) <= 0 then
    raise exception 'this club has no fee set; ask an admin to add you';
  end if;

  v_ref := public.new_payment_ref('MB');

  insert into payments (purpose, member_id, club_id, provider_order_ref, amount_lkr, term_months)
  values ('club_membership', v_me, p_club_id, v_ref, v_fee, coalesce(v_term, 12))
  returning id into v_id;

  return query
  select v_id, v_ref, v_fee, v_club.name, (v_existing.id is not null);
end;
$$;

-- ---------------------------------------------------------------------------
-- start_session_booking_payment
-- ---------------------------------------------------------------------------
create or replace function public.start_session_booking_payment(p_booking_id uuid)
returns table (payment_id uuid, order_ref text, amount numeric, session_title text)
language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := auth.uid();
  v_booking session_bookings%rowtype;
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

  select title into v_title from sessions where id = v_booking.session_id;

  -- Reuse an outstanding attempt rather than stacking references for the same
  -- booking; a member who backs out of checkout and returns should not create
  -- a second pending payment.
  select id, provider_order_ref into v_id, v_ref
  from payments
  where purpose = 'session_booking' and booking_id = p_booking_id and status = 'pending'
  order by created_at desc
  limit 1;

  if v_id is null then
    v_ref := public.new_payment_ref('SB');
    insert into payments (purpose, member_id, booking_id, provider_order_ref, amount_lkr)
    values ('session_booking', v_me, p_booking_id, v_ref, v_booking.fee_lkr)
    returning id into v_id;
  end if;

  return query select v_id, v_ref, v_booking.fee_lkr, v_title;
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_payhere_notification -- the idempotent settlement path
-- ---------------------------------------------------------------------------
-- PayHere retries. Duplicate notifications are NORMAL, not exceptional, so
-- everything here happens in one transaction behind a row lock, and a payment
-- that has already succeeded is logged and ignored rather than applied twice.
--
-- Called ONLY by the notify route, after it has verified the md5 signature.
-- Signature verification cannot happen in SQL (the secret must not live in the
-- database), which is why p_signature_ok is passed in.
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
  else
    v_outcome := 'applied';
  end if;

  insert into payment_events (payment_id, provider_order_ref, status_code, signature_ok, applied, outcome, payload)
  values (v_pay.id, p_order_ref, p_status_code, true, true, v_outcome, p_payload);

  return v_outcome;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_mark_payment_paid -- manual reconciliation
-- ---------------------------------------------------------------------------
-- Needed for two real situations: local development, where no webhook can
-- reach the machine, and the day PayHere's callback genuinely fails. Status
-- 'manual' rather than 'success' so reconciliation can tell them apart.
create or replace function public.admin_mark_payment_paid(p_payment_id uuid, p_reason text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_pay payments%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required';
  end if;

  select * into v_pay from payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment not found';
  end if;
  if v_pay.status in ('success','manual') then
    raise exception 'this payment is already settled';
  end if;

  update payments
  set status = 'manual', paid_at = now(), note = trim(p_reason)
  where id = p_payment_id;

  perform public.write_audit('payment.manual', 'payment', p_payment_id::text,
    jsonb_build_object('status', v_pay.status),
    jsonb_build_object('status', 'manual', 'reason', trim(p_reason)));

  -- Same side effects as a real settlement, via the same code path shape.
  if v_pay.purpose = 'club_membership' then
    insert into club_memberships
      (member_id, club_id, status, is_primary, joined_on, renewal_date)
    values (
      v_pay.member_id, v_pay.club_id, 'active',
      not exists (select 1 from club_memberships where member_id = v_pay.member_id and is_primary),
      current_date,
      (current_date + (coalesce(v_pay.term_months, 12) || ' months')::interval)::date
    )
    on conflict (member_id, club_id) do update
      set status = 'active',
          joined_on = coalesce(club_memberships.joined_on, current_date),
          renewal_date = (
            greatest(coalesce(club_memberships.renewal_date, current_date), current_date)
            + (coalesce(v_pay.term_months, 12) || ' months')::interval
          )::date;
    return 'membership_extended';

  elsif v_pay.purpose = 'session_booking' then
    update session_bookings
    set status = 'confirmed', confirmed_at = now()
    where id = v_pay.booking_id;
    return 'booking_confirmed';
  end if;

  return 'applied';
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table payments enable row level security;
revoke all on payments from anon, authenticated;
grant select on payments to authenticated;

create policy payments_select on payments
for select to authenticated
using (member_id = (select auth.uid()) or (select public.is_admin()));

-- No INSERT/UPDATE policy. Payments are created by the start_* RPCs, which
-- compute the amount, and settled by the notify handler. A member writing
-- their own payment row could set amount_lkr to 1.

alter table payment_events enable row level security;
revoke all on payment_events from anon, authenticated;
grant select on payment_events to authenticated;

create policy payment_events_select_super on payment_events
for select to authenticated
using ((select public.is_super_admin()));

revoke execute on function
  public.new_payment_ref(text),
  public.start_club_membership_payment(uuid),
  public.start_session_booking_payment(uuid),
  public.apply_payhere_notification(text, text, int, numeric, text, boolean, jsonb),
  public.admin_mark_payment_paid(uuid, text)
from public;

grant execute on function
  public.start_club_membership_payment(uuid),
  public.start_session_booking_payment(uuid),
  public.admin_mark_payment_paid(uuid, text)
to authenticated;

-- apply_payhere_notification is deliberately NOT granted to authenticated.
-- It is called by the notify route through the service-role client, which
-- bypasses grants -- so no signed-in user can invoke settlement directly.
grant execute on function
  public.apply_payhere_notification(text, text, int, numeric, text, boolean, jsonb)
to service_role;
