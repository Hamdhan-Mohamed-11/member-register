-- In-app notifications.
--
-- Until now every decision an admin made about a member -- a video approved, a
-- join request accepted, points awarded for a session, a payment settled --
-- happened silently. The member found out by revisiting the page and noticing
-- the state had changed, which for a rejection means they may never find out
-- at all.
--
-- This is deliberately IN-APP ONLY. No email, no push. The club is ~300 people
-- and every event here is something they will see next time they open the
-- portal; adding a second delivery channel doubles the failure surface
-- (bounces, unsubscribes, spam folders) for events that are not time-critical.
--
-- Rows are written ONLY by public.notify_member(), which is called from inside
-- the existing security-definer RPCs so the notification lands in the SAME
-- transaction as the thing it announces. A notification that survived a
-- rolled-back approval would be worse than no notification at all.

create table notifications (
  id          uuid primary key default gen_random_uuid(),

  member_id   uuid not null references profiles(id) on delete cascade,

  kind        text not null check (kind in (
                'video.approved',
                'video.rejected',
                'join.approved',
                'join.rejected',
                'payment.received',
                'points.awarded',
                'membership.added',
                'membership.changed',
                'role.changed',
                'account.status'
              )),

  title       text not null,
  body        text,

  -- Where tapping the notification goes. An in-app path ONLY -- this is
  -- rendered into a <Link href>, and an absolute URL from the database would
  -- turn the notification list into an open redirect.
  href        text check (href is null or href like '/%'),

  -- Idempotency. The RPCs that write these are re-runnable by design: a
  -- Secretary re-saves an attendance roster, PayHere retries a webhook, an
  -- admin flips a video back and forth. Without a stable key per real-world
  -- event, each re-run stacks another identical row on the member's bell.
  dedupe_key  text,

  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create unique index notifications_dedupe_idx
  on notifications (member_id, dedupe_key)
  where dedupe_key is not null;

create index notifications_member_idx on notifications (member_id, created_at desc);

-- Partial index: the bell's unread count is the most frequent read in the app
-- (every signed-in page render), and it only ever looks at unread rows.
create index notifications_unread_idx
  on notifications (member_id)
  where read_at is null;

-- ---------------------------------------------------------------------------
-- notify_member -- the only writer
-- ---------------------------------------------------------------------------
-- Never raises. A notification is a courtesy; it must not be able to fail an
-- approval, a payment settlement or an attendance save. The one case that
-- would otherwise throw is a null member -- payments keep their row after the
-- member is deleted (see 0015) -- so that returns quietly.
--
-- On a repeat of the same dedupe_key the row is REFRESHED rather than
-- duplicated, and only when the message actually changed. Re-saving an
-- unchanged roster therefore does not resurface a notification the member has
-- already read, while correcting someone's points does.
create or replace function public.notify_member(
  p_member_id  uuid,
  p_kind       text,
  p_title      text,
  p_body       text default null,
  p_href       text default null,
  p_dedupe_key text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_member_id is null then
    return;
  end if;

  insert into notifications (member_id, kind, title, body, href, dedupe_key)
  values (p_member_id, p_kind, p_title, p_body, p_href, p_dedupe_key)
  on conflict (member_id, dedupe_key) where dedupe_key is not null
  do update
    set kind       = excluded.kind,
        title      = excluded.title,
        body       = excluded.body,
        href       = excluded.href,
        created_at = now(),
        read_at    = null
  where notifications.title is distinct from excluded.title
     or notifications.body  is distinct from excluded.body;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table notifications enable row level security;
revoke all on notifications from anon, authenticated;

-- SELECT and a narrow UPDATE. The update grant is COLUMN-SCOPED to read_at:
-- with a table-wide grant the RLS policy would still let a member rewrite the
-- title and body of their own notifications, which turns a record they are the
-- subject of ("your video was rejected") into something they can edit.
grant select on notifications to authenticated;
grant update (read_at) on notifications to authenticated;

create policy notifications_select_own on notifications
for select to authenticated
using (member_id = (select auth.uid()));

create policy notifications_update_own on notifications
for update to authenticated
using (member_id = (select auth.uid()))
with check (member_id = (select auth.uid()));

-- No INSERT or DELETE policy anywhere. Members do not author their own
-- notifications, and a member deleting the record of a rejection is exactly
-- what the dedupe key exists to keep stable.

revoke execute on function
  public.notify_member(uuid, text, text, text, text, text)
from public;

-- Deliberately NOT granted to `authenticated` either. Every caller is a
-- security-definer function that already runs as the owner, so nothing needs
-- client access -- and a client that could call this could forge "your payment
-- was received".

-- ===========================================================================
-- Wire the existing RPCs.
--
-- Each function below is re-created in full rather than patched, because a
-- plpgsql body cannot be edited in place. The ONLY change in each is the added
-- notify_member() call (and the locals it needs) -- everything else is copied
-- verbatim from the migration named in its comment, so diffing the two shows
-- exactly what this migration changed.
-- ===========================================================================

-- --- moderate_video (from 0016) -------------------------------------------
create or replace function public.moderate_video(
  p_video_id uuid,
  p_status   text,
  p_note     text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_video  videos%rowtype;
  v_note   text;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;
  if p_status not in ('approved','rejected','pending') then
    raise exception 'invalid moderation status';
  end if;

  select to_jsonb(v) into v_before from videos v where v.id = p_video_id;
  if v_before is null then
    raise exception 'video not found';
  end if;

  update videos
  set status      = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(trim(p_note), '')
  where id = p_video_id
  returning * into v_video;

  perform public.write_audit('video.moderate', 'video', p_video_id::text, v_before,
    jsonb_build_object('status', p_status));

  -- Only the submitter is told, and only about a decision. Moving a video back
  -- to 'pending' is an admin correcting themselves, not news for the member.
  v_note := nullif(trim(p_note), '');

  if p_status = 'approved' then
    perform public.notify_member(
      v_video.submitted_by,
      'video.approved',
      'Your video was approved',
      format('%s is now visible to the club.', v_video.title),
      '/videos',
      'video:' || p_video_id::text
    );
  elsif p_status = 'rejected' then
    perform public.notify_member(
      v_video.submitted_by,
      'video.rejected',
      'Your video was not approved',
      coalesce(v_note, format('%s was reviewed and not published.', v_video.title)),
      '/me/videos',
      'video:' || p_video_id::text
    );
  end if;
end;
$$;

-- --- approve_join_request (from 0007) --------------------------------------
create or replace function public.approve_join_request(p_request_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_req   club_join_requests%rowtype;
  v_term  int;
  v_first boolean;
  v_mid   uuid;
  v_club  text;
  v_until date;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  select * into v_req from club_join_requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request already decided';
  end if;

  select term_months into v_term from public.resolve_club_terms(v_req.club_id);
  v_term := coalesce(v_term, 12);

  v_first := not exists (
    select 1 from club_memberships where member_id = v_req.member_id and is_primary
  );

  insert into club_memberships
    (member_id, club_id, status, is_primary, joined_on, renewal_date)
  values (
    v_req.member_id, v_req.club_id, 'active', v_first, current_date,
    (current_date + (v_term || ' months')::interval)::date
  )
  on conflict (member_id, club_id) do update
    set status = 'active',
        joined_on = coalesce(club_memberships.joined_on, current_date),
        renewal_date = excluded.renewal_date
  returning id, renewal_date into v_mid, v_until;

  update profiles
  set status = 'active'
  where id = v_req.member_id and status = 'pending';

  update club_join_requests
  set status = 'approved', decided_by = auth.uid(), decided_at = now()
  where id = p_request_id;

  perform public.write_audit(
    'join_request.approve', 'club_join_request', p_request_id::text,
    to_jsonb(v_req), jsonb_build_object('membership_id', v_mid)
  );

  select name into v_club from clubs where id = v_req.club_id;

  perform public.notify_member(
    v_req.member_id,
    'join.approved',
    format('You''re in — welcome to %s', coalesce(v_club, 'the club')),
    format('Your membership runs until %s.', to_char(v_until, 'DD Mon YYYY')),
    '/me',
    'join:' || p_request_id::text
  );

  return v_mid;
end;
$$;

-- --- reject_join_request (from 0007) ---------------------------------------
create or replace function public.reject_join_request(p_request_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req  club_join_requests%rowtype;
  v_club text;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  select * into v_req from club_join_requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request already decided';
  end if;

  update club_join_requests
  set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
      message = coalesce(p_reason, message)
  where id = p_request_id;

  update profiles p
  set status = 'rejected'
  where p.id = v_req.member_id
    and p.status = 'pending'
    and not exists (
      select 1 from club_memberships m
      where m.member_id = p.id and m.status = 'active'
    );

  perform public.write_audit(
    'join_request.reject', 'club_join_request', p_request_id::text,
    to_jsonb(v_req), null
  );

  select name into v_club from clubs where id = v_req.club_id;

  perform public.notify_member(
    v_req.member_id,
    'join.rejected',
    format('Your request to join %s was declined', coalesce(v_club, 'the club')),
    nullif(trim(coalesce(p_reason, '')), ''),
    '/pending',
    'join:' || p_request_id::text
  );
end;
$$;

-- --- record_session_attendance (from 0011) ---------------------------------
create or replace function public.record_session_attendance(
  p_session_id uuid,
  p_entries    jsonb
)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_entry   jsonb;
  v_member  uuid;
  v_codes   text[];
  v_code    text;
  v_points  int;
  v_written int := 0;
  v_title   text;
  v_row     record;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  if not exists (select 1 from sessions where id = p_session_id) then
    raise exception 'session not found';
  end if;

  for v_entry in
    select value
    from jsonb_array_elements(p_entries)
    order by (value ->> 'member_id')::uuid
  loop
    v_member := (v_entry ->> 'member_id')::uuid;
    v_codes  := coalesce(
      array(select jsonb_array_elements_text(v_entry -> 'codes')),
      '{}'::text[]
    );

    delete from member_activities
    where session_id = p_session_id
      and member_id = v_member
      and not (activity_code = any (v_codes));

    foreach v_code in array v_codes loop
      select points into v_points
      from points_rules
      where code = v_code and is_active;

      if v_points is null then
        raise exception 'unknown or inactive activity code: %', v_code;
      end if;

      insert into member_activities
        (session_id, member_id, activity_code, points_awarded, recorded_by, updated_by)
      values
        (p_session_id, v_member, v_code, v_points, auth.uid(), auth.uid())
      on conflict (session_id, member_id, activity_code) do update
        set updated_by = auth.uid(),
            updated_at = now();

      v_written := v_written + 1;
    end loop;
  end loop;

  perform public.write_audit('session.attendance', 'session', p_session_id::text, null,
    jsonb_build_object('entries', jsonb_array_length(p_entries)));

  -- ONE notification per member per session, summarising the total, rather
  -- than one per activity code. Someone who presented, attended AND brought a
  -- guest would otherwise get three separate pings for a single evening.
  --
  -- Read back from member_activities rather than accumulating inside the loop,
  -- so the total reflects what is actually stored after the deletes above --
  -- including the case where the Secretary unticked everything for a member,
  -- which correctly produces no row here and so refreshes nothing.
  select title into v_title from sessions where id = p_session_id;

  for v_row in
    select member_id, sum(points_awarded)::int as points
    from member_activities
    where session_id = p_session_id
    group by member_id
  loop
    perform public.notify_member(
      v_row.member_id,
      'points.awarded',
      format('You earned %s points', v_row.points),
      format('For %s.', coalesce(v_title, 'a session')),
      '/me/points',
      'attendance:' || p_session_id::text
    );
  end loop;

  return v_written;
end;
$$;

-- --- apply_payhere_notification (from 0014) --------------------------------
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
  if not p_signature_ok then
    insert into payment_events (provider_order_ref, status_code, signature_ok, applied, outcome, payload)
    values (p_order_ref, p_status_code, false, false, 'bad_signature', p_payload);
    return 'bad_signature';
  end if;

  select * into v_pay from payments where provider_order_ref = p_order_ref for update;

  if not found then
    insert into payment_events (provider_order_ref, status_code, signature_ok, applied, outcome, payload)
    values (p_order_ref, p_status_code, true, false, 'unknown_ref', p_payload);
    return 'unknown_ref';
  end if;

  if v_pay.status in ('success','manual') then
    insert into payment_events (payment_id, provider_order_ref, status_code, signature_ok, applied, outcome, payload)
    values (v_pay.id, p_order_ref, p_status_code, true, false, 'already_applied', p_payload);
    return 'already_applied';
  end if;

  if p_amount is distinct from v_pay.amount_lkr or upper(p_currency) <> upper(v_pay.currency) then
    insert into payment_events (payment_id, provider_order_ref, status_code, signature_ok, applied, outcome, payload)
    values (v_pay.id, p_order_ref, p_status_code, true, false, 'amount_mismatch', p_payload);
    return 'amount_mismatch';
  end if;

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

    -- A cancelled checkout is the member's own deliberate act, taken while
    -- looking at the result page. Only a FAILURE is worth a notification,
    -- because that one can land after they have walked away from the screen.
    if p_status_code in (-2, -3) then
      perform public.notify_member(
        v_pay.member_id,
        'payment.received',
        'A payment did not go through',
        format('Rs %s could not be collected. Nothing was charged.',
               to_char(v_pay.amount_lkr, 'FM999,999,990.00')),
        '/renew',
        'payment:' || v_pay.id::text
      );
    end if;

    return 'not_successful';
  end if;

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
      set status = 'active',
          joined_on = coalesce(club_memberships.joined_on, current_date),
          renewal_date = (
            greatest(coalesce(club_memberships.renewal_date, current_date), current_date)
            + (coalesce(v_pay.term_months, 12) || ' months')::interval
          )::date
    returning renewal_date into v_new;

    v_outcome := 'membership_extended';

    perform public.notify_member(
      v_pay.member_id,
      'payment.received',
      'Payment received',
      format('%s is now active until %s.',
             coalesce(v_pay.club_name, 'Your membership'),
             to_char(v_new, 'DD Mon YYYY')),
      '/me',
      'payment:' || v_pay.id::text
    );

  elsif v_pay.purpose = 'session_booking' then
    update session_bookings
    set status = 'confirmed', confirmed_at = now()
    where id = v_pay.booking_id;

    v_outcome := 'booking_confirmed';

    perform public.notify_member(
      v_pay.member_id,
      'payment.received',
      'Your place is booked',
      coalesce(v_pay.description, 'Your session booking is confirmed.'),
      '/sessions',
      'payment:' || v_pay.id::text
    );
  else
    v_outcome := 'applied';
  end if;

  insert into payment_events (payment_id, provider_order_ref, status_code, signature_ok, applied, outcome, payload)
  values (v_pay.id, p_order_ref, p_status_code, true, true, v_outcome, p_payload);

  return v_outcome;
end;
$$;

-- --- admin_mark_payment_paid (from 0014) -----------------------------------
-- Manual reconciliation notifies too. Without it, a member whose PayHere
-- callback failed gets silence precisely when they are most anxious about
-- whether the money arrived.
create or replace function public.admin_mark_payment_paid(p_payment_id uuid, p_reason text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_pay payments%rowtype;
  v_new date;
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
          )::date
    returning renewal_date into v_new;

    perform public.notify_member(
      v_pay.member_id,
      'payment.received',
      'Payment received',
      format('%s is now active until %s.',
             coalesce(v_pay.club_name, 'Your membership'),
             to_char(v_new, 'DD Mon YYYY')),
      '/me',
      'payment:' || p_payment_id::text
    );

    return 'membership_extended';

  elsif v_pay.purpose = 'session_booking' then
    update session_bookings
    set status = 'confirmed', confirmed_at = now()
    where id = v_pay.booking_id;

    perform public.notify_member(
      v_pay.member_id,
      'payment.received',
      'Your place is booked',
      coalesce(v_pay.description, 'Your session booking is confirmed.'),
      '/sessions',
      'payment:' || p_payment_id::text
    );

    return 'booking_confirmed';
  end if;

  return 'applied';
end;
$$;

-- --- admin_add_club_membership (from 0013) ---------------------------------
create or replace function public.admin_add_club_membership(
  p_member_id uuid,
  p_club_id   uuid,
  p_months    int default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_term  int;
  v_first boolean;
  v_id    uuid;
  v_until date;
  v_club  text;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  if p_months is null then
    select term_months into v_term from public.resolve_club_terms(p_club_id);
  else
    v_term := p_months;
  end if;
  v_term := coalesce(v_term, 12);

  v_first := not exists (
    select 1 from club_memberships where member_id = p_member_id and is_primary
  );

  insert into club_memberships
    (member_id, club_id, status, is_primary, joined_on, renewal_date)
  values (
    p_member_id, p_club_id, 'active', v_first, current_date,
    (current_date + (v_term || ' months')::interval)::date
  )
  on conflict (member_id, club_id) do update
    set status = 'active',
        joined_on = coalesce(club_memberships.joined_on, current_date),
        renewal_date = (
          greatest(coalesce(club_memberships.renewal_date, current_date), current_date)
          + (v_term || ' months')::interval
        )::date
  returning id, renewal_date into v_id, v_until;

  perform public.write_audit('membership.add', 'club_membership', v_id::text, null,
    jsonb_build_object('member', p_member_id, 'club', p_club_id, 'months', v_term));

  select name into v_club from clubs where id = p_club_id;

  -- Keyed on the MEMBERSHIP, not the call: an admin extending the same
  -- membership twice refreshes one notification rather than stacking two.
  perform public.notify_member(
    p_member_id,
    'membership.added',
    format('You were added to %s', coalesce(v_club, 'a club')),
    format('Your membership runs until %s.', to_char(v_until, 'DD Mon YYYY')),
    '/me',
    'membership:' || v_id::text
  );

  return v_id;
end;
$$;

-- --- admin_set_membership (from 0013) --------------------------------------
create or replace function public.admin_set_membership(
  p_membership_id uuid,
  p_status        text default null,
  p_renewal_date  date default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_after  club_memberships%rowtype;
  v_club   text;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  select to_jsonb(m) into v_before from club_memberships m where m.id = p_membership_id;
  if v_before is null then
    raise exception 'membership not found';
  end if;

  if p_status is not null
     and p_status not in ('pending','active','expired','cancelled','rejected') then
    raise exception 'invalid membership status';
  end if;

  update club_memberships
  set status       = coalesce(p_status, status),
      renewal_date = coalesce(p_renewal_date, renewal_date)
  where id = p_membership_id
  returning * into v_after;

  perform public.write_audit('membership.update', 'club_membership',
    p_membership_id::text, v_before,
    (select to_jsonb(m) from club_memberships m where m.id = p_membership_id));

  -- Only tell the member when something they can SEE changed. An admin
  -- re-saving the same values is not news; a membership being cancelled very
  -- much is.
  if (v_before ->> 'status')       is distinct from v_after.status
  or (v_before ->> 'renewal_date') is distinct from v_after.renewal_date::text then
    select name into v_club from clubs where id = v_after.club_id;

    perform public.notify_member(
      v_after.member_id,
      'membership.changed',
      format('Your %s membership was updated', coalesce(v_club, 'club')),
      case
        when v_after.status <> 'active' then format('It is now %s.', v_after.status)
        when v_after.renewal_date is not null
          then format('It now runs until %s.', to_char(v_after.renewal_date, 'DD Mon YYYY'))
        else null
      end,
      '/me',
      'membership:' || p_membership_id::text
    );
  end if;
end;
$$;

-- --- set_member_role (from 0007) -------------------------------------------
create or replace function public.set_member_role(p_member_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old text;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;
  if p_role not in ('member','secretary','super_admin') then
    raise exception 'invalid role';
  end if;

  select role into v_old from profiles where id = p_member_id;
  if v_old = 'super_admin' and p_role <> 'super_admin' then
    if (select count(*) from profiles where role = 'super_admin' and status = 'active') <= 1 then
      raise exception 'cannot remove the last super admin';
    end if;
  end if;

  update profiles set role = p_role where id = p_member_id;

  perform public.write_audit('member.set_role', 'profile', p_member_id::text,
    jsonb_build_object('role', v_old), jsonb_build_object('role', p_role));

  if v_old is distinct from p_role then
    perform public.notify_member(
      p_member_id,
      'role.changed',
      case p_role
        when 'member' then 'Your admin access was removed'
        else 'You were given admin access'
      end,
      case p_role
        when 'secretary'   then 'You can now run sessions and record attendance.'
        when 'super_admin' then 'You now have full access to the admin area.'
        else null
      end,
      case when p_role = 'member' then '/me' else '/admin' end,
      'role:' || p_member_id::text || ':' || p_role
    );
  end if;
end;
$$;

-- --- set_member_status (from 0007) -----------------------------------------
create or replace function public.set_member_status(p_member_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old text;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;
  if p_status not in ('pending','active','suspended','rejected') then
    raise exception 'invalid status';
  end if;

  select status into v_old from profiles where id = p_member_id;
  update profiles set status = p_status where id = p_member_id;

  perform public.write_audit('member.set_status', 'profile', p_member_id::text,
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));

  -- A suspended or rejected member cannot reach the app to read this, so the
  -- only one of these worth sending is the REINSTATEMENT -- which is also the
  -- one they have no other way of discovering.
  if v_old is distinct from p_status and p_status = 'active' then
    perform public.notify_member(
      p_member_id,
      'account.status',
      'Your account is active again',
      'Welcome back — everything is available to you.',
      '/feed',
      'status:' || p_member_id::text || ':' || p_status
    );
  end if;
end;
$$;
