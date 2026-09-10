-- ---------------------------------------------------------------------------
-- 0027 — a secretary belongs to one club
-- ---------------------------------------------------------------------------
--
-- Until now `secretary` was a global role: is_admin() returned true for every
-- secretary everywhere, and sixteen RPCs trusted it. A secretary appointed to
-- run one book club could create sessions for another, record attendance on
-- somebody else's roster, and approve their join requests.
--
-- The club asked for one secretary per club, able to act only on that club.
-- So the appointment moves onto the club itself -- `clubs.secretary_id` -- and
-- authorisation splits into two questions that used to be one:
--
--   is_super_admin()      may do anything, anywhere
--   can_admin_club(club)  may act on THIS club
--
-- Everything with a club attached (sessions, attendance, join requests,
-- bookings, videos) becomes club-scoped. Everything central -- money, book
-- orders, borrowing, settings, members, companies -- becomes super-admin only,
-- because those are not one club's business and were only reachable by a
-- secretary because `is_admin()` did not distinguish.
--
-- is_admin() itself is kept, unchanged, and still means "is staff of some
-- kind". It is the right question for "should this person see an admin area at
-- all", and the wrong one for "may they change this". Every remaining caller
-- has been checked; the ones that needed a club now ask for one.
-- ---------------------------------------------------------------------------

alter table clubs
  add column if not exists secretary_id uuid references profiles(id) on delete set null;

-- One club per secretary, which is the other half of what was asked: a
-- secretary is "specific to 1 club". A partial index rather than a plain
-- unique constraint, so any number of clubs may have no secretary yet.
drop index if exists clubs_secretary_unique;
create unique index clubs_secretary_unique
  on clubs (secretary_id) where secretary_id is not null;

comment on column clubs.secretary_id is
  'The one member who runs this club. See can_admin_club().';

-- ---------------------------------------------------------------------------
-- The two questions
-- ---------------------------------------------------------------------------

-- The club this member runs, or null. Also the answer to "which club is
-- 'my club' for a secretary", which several admin pages need in order to show
-- one club's worth of anything.
create or replace function public.secretary_club_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select c.id from clubs c where c.secretary_id = (select auth.uid()) limit 1;
$$;

-- May the caller act on this club?
--
-- Deliberately NOT "is a member of". Being in a club and running it are
-- different things, and a policy written on membership would hand every member
-- their own club's admin actions.
create or replace function public.can_admin_club(p_club_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    p_club_id is not null
    and (
      public.is_super_admin()
      or exists (
        select 1 from clubs c
        where c.id = p_club_id and c.secretary_id = (select auth.uid())
      )
    );
$$;

-- Raises instead of returning false, so the RPCs read as one line and every
-- refusal carries the same wording.
create or replace function public.require_club_admin(p_club_id uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_admin_club(p_club_id) then
    raise exception 'not authorised for this club';
  end if;
end;
$$;

revoke execute on function
  public.secretary_club_id(),
  public.can_admin_club(uuid),
  public.require_club_admin(uuid)
from public;

grant execute on function
  public.secretary_club_id(),
  public.can_admin_club(uuid),
  public.require_club_admin(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Appointing one
-- ---------------------------------------------------------------------------
-- Appointment and role are set together on purpose. A club pointing at someone
-- whose role is still 'member' would be a club with a secretary who cannot
-- reach the admin area, and the two drifting apart is the sort of thing nobody
-- notices until a session needs recording.
create or replace function public.appoint_club_secretary(
  p_club_id   uuid,
  p_member_id uuid default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_previous uuid;
  v_club     text;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  select secretary_id, name into v_previous, v_club from clubs where id = p_club_id;
  if v_club is null then
    raise exception 'club not found';
  end if;

  if p_member_id is not null then
    if not exists (
      select 1 from profiles where id = p_member_id and status = 'active'
    ) then
      raise exception 'that member is not active';
    end if;

    -- Someone already running another club cannot take a second. The unique
    -- index would refuse it anyway; this says why.
    if exists (
      select 1 from clubs
      where secretary_id = p_member_id and id <> p_club_id
    ) then
      raise exception 'that member already runs another club';
    end if;
  end if;

  update clubs set secretary_id = p_member_id where id = p_club_id;

  -- Stepping down returns them to plain member, unless they are a super admin,
  -- whose access does not come from this appointment in the first place.
  if v_previous is not null and v_previous is distinct from p_member_id then
    update profiles
    set role = 'member'
    where id = v_previous and role = 'secretary';

    perform public.notify_member(v_previous, 'role.changed',
      'You are no longer secretary of ' || v_club, null, '/me',
      'secretary:' || p_club_id::text || ':off');
  end if;

  if p_member_id is not null then
    update profiles
    set role = 'secretary'
    where id = p_member_id and role = 'member';

    perform public.notify_member(p_member_id, 'role.changed',
      'You are now secretary of ' || v_club,
      'You can create sessions and record attendance for this club.',
      '/admin', 'secretary:' || p_club_id::text || ':on');
  end if;

  perform public.write_audit('club.secretary', 'club', p_club_id::text,
    jsonb_build_object('secretary_id', v_previous),
    jsonb_build_object('secretary_id', p_member_id));
end;
$$;

revoke execute on function public.appoint_club_secretary(uuid, uuid) from public;
grant execute on function public.appoint_club_secretary(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Back-fill
-- ---------------------------------------------------------------------------
-- Any existing secretary is left with the role but no club, which under the
-- new rules means they can reach the admin area and act on nothing. That is
-- the safe direction to fail, and it is visible: /admin/clubs shows every club
-- without a secretary. Appointing them takes one click and is a decision only
-- the club can make -- guessing would hand someone a club they never ran.
do $$
declare
  v_count int;
begin
  select count(*) into v_count from profiles where role = 'secretary';
  if v_count > 0 then
    raise notice '% secretary/secretaries now have no club until appointed at /admin/clubs', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The scoped functions
-- ---------------------------------------------------------------------------
-- Each of these was taken from pg_get_functiondef() against the LIVE database
-- and patched at the guard, rather than rebuilt from an earlier migration.
-- That is deliberate: 0022 was rebuilt from 0014 when 0015 had already
-- superseded it, and silently reverted four columns. Patching what is actually
-- deployed cannot make that mistake.
--
-- Formatting below is pg_get_functiondef's, not this file's house style.

CREATE OR REPLACE FUNCTION public.approve_join_request(p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req   club_join_requests%rowtype;
  v_term  int;
  v_first boolean;
  v_mid   uuid;
  v_club  text;
  v_until date;
begin
  perform public.require_club_admin(
    (select club_id from club_join_requests where id = p_request_id));

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
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_member(p_member_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from profiles t
    where t.id = p_member_id
      and (
        t.id = auth.uid()
        -- A super admin sees everyone. A secretary now sees only the club
        -- they actually run, which is the whole point of 0027.
        or coalesce(
             (select role from profiles where id = auth.uid()) = 'super_admin',
             false)
        or exists (
             select 1 from club_memberships cm
             join clubs c on c.id = cm.club_id
             where cm.member_id = t.id and cm.status = 'active'
               and c.secretary_id = auth.uid())
        or (
          t.status = 'active'
          and coalesce((select status from profiles where id = auth.uid()) = 'active', false)
          and public.shares_active_club(t.id)
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_session_booking(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_booking session_bookings%rowtype;
begin
  select * into v_booking from session_bookings where id = p_booking_id;
  if not found then
    raise exception 'booking not found';
  end if;

  if v_booking.member_id <> auth.uid() and not public.can_admin_club(
       (select host_club_id from sessions where id = v_booking.session_id)) then
    raise exception 'not authorised';
  end if;

  -- A paid booking is a refund question, not a self-service cancel.
  if v_booking.status = 'confirmed' and v_booking.fee_lkr > 0 and not public.can_admin_club(
       (select host_club_id from sessions where id = v_booking.session_id)) then
    raise exception 'please contact the club to cancel a paid booking';
  end if;

  update session_bookings set status = 'cancelled' where id = p_booking_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_video(p_video_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_video videos%rowtype;
begin
  select * into v_video from videos where id = p_video_id;
  if not found then
    raise exception 'video not found';
  end if;

  -- A member may withdraw their own submission while it is still pending.
  -- Once approved it is club content, and removing it is an admin decision --
  -- but only for the club the video belongs to, via its session.
  if not (
    public.is_super_admin()
    or public.can_admin_club(
         (select s.host_club_id from videos v
          left join sessions s on s.id = v.session_id
          where v.id = p_video_id))
  ) then
    if v_video.submitted_by <> auth.uid() or v_video.status <> 'pending' then
      raise exception 'not authorised';
    end if;
  end if;

  delete from videos where id = p_video_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.moderate_video(p_video_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_before jsonb;
  v_video  videos%rowtype;
  v_note   text;
begin
  -- A video is a club's business through the session it belongs to. One
  -- with no session has no club, so only a super admin can act on it --
  -- require_club_admin(null) refuses, which is the right default.
  if not public.is_super_admin() then
    perform public.require_club_admin(
      (select s.host_club_id from videos v
       left join sessions s on s.id = v.session_id
       where v.id = p_video_id));
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
$function$
;

CREATE OR REPLACE FUNCTION public.record_session_attendance(p_session_id uuid, p_entries jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entry      jsonb;
  v_member     uuid;
  v_codes      text[];
  v_code       text;
  v_points     int;
  v_written    int := 0;
  v_cap        int;
  v_presenters int;
begin
  perform public.require_club_admin(
    (select host_club_id from sessions where id = p_session_id));

  select presenter_count into v_cap from sessions where id = p_session_id;
  if not found then
    raise exception 'session not found';
  end if;

  if v_cap is not null then
    select count(*) into v_presenters
    from jsonb_array_elements(p_entries) e
    where exists (
      select 1
      from jsonb_array_elements_text(e.value -> 'codes') c
      join points_rules pr on pr.code = c.value
      where pr.is_presenting
    );

    if v_presenters > v_cap then
      raise exception
        'this session is set for % presenter(s), but % are marked as presenting',
        v_cap, v_presenters;
    end if;
  end if;

  -- ORDER BY member_id is a deadlock guard, not tidiness.
  --
  -- Each write takes a lock on that member's profile row (see
  -- recompute_member_points). Two Secretaries saving overlapping rosters in
  -- DIFFERENT orders would each hold a lock the other needs. Sorting gives
  -- every transaction the same lock order, so one simply waits.
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
        -- Keep the ORIGINAL points_awarded on re-save: re-ticking a box the
        -- Secretary already ticked must not silently re-price history at
        -- today's rule.
        set updated_by = auth.uid(),
            updated_at = now();

      v_written := v_written + 1;
    end loop;
  end loop;

  perform public.write_audit('session.attendance', 'session', p_session_id::text, null,
    jsonb_build_object('entries', jsonb_array_length(p_entries)));

  return v_written;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_join_request(p_request_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req  club_join_requests%rowtype;
  v_club text;
begin
  perform public.require_club_admin(
    (select club_id from club_join_requests where id = p_request_id));

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
$function$
;

CREATE OR REPLACE FUNCTION public.set_book_order_fulfilled(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  update book_orders
  set status = 'fulfilled', fulfilled_at = now()
  where id = p_order_id and status = 'paid';

  if not found then
    raise exception 'only a paid order can be marked as handed over';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_book_order_price(p_order_id uuid, p_unit_prices jsonb DEFAULT '[]'::jsonb, p_message text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order   book_orders%rowtype;
  v_row     jsonb;
  v_total   numeric(12,2) := 0;
  v_pct     numeric(5,2);
  v_raised  boolean := false;
  v_status  text;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  select * into v_order from book_orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if v_order.status not in ('review','quoted') then
    raise exception 'this order has already been settled';
  end if;

  -- Start every item from what the member asked, then overwrite the ones the
  -- admin actually changed.
  update book_order_items
  set agreed_unit_price_lkr = asking_unit_price_lkr
  where order_id = p_order_id;

  for v_row in select value from jsonb_array_elements(coalesce(p_unit_prices, '[]'::jsonb)) loop
    update book_order_items
    set agreed_unit_price_lkr = greatest(0, (v_row ->> 'unit_price')::numeric)
    where id = (v_row ->> 'item_id')::uuid and order_id = p_order_id;
  end loop;

  select coalesce(sum(agreed_unit_price_lkr * quantity), 0),
         bool_or(agreed_unit_price_lkr > asking_unit_price_lkr)
    into v_total, v_raised
  from book_order_items where order_id = p_order_id;

  select readrise_percent into v_pct from app_settings where id = 1;

  v_status := case when v_raised then 'quoted' else 'agreed' end;

  update book_orders
  set agreed_total_lkr = v_total,
      -- Frozen now. If the share changes next year, what this member was told
      -- they donated must not change with it.
      readrise_lkr = round(v_total * coalesce(v_pct, 0) / 100, 2),
      status = v_status,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_order_id;

  if coalesce(btrim(p_message), '') <> '' then
    insert into book_order_messages (order_id, sender_id, from_admin, body)
    values (p_order_id, auth.uid(), true, btrim(p_message));
  end if;

  perform public.notify_member(
    v_order.member_id,
    case when v_raised then 'order.quoted' else 'order.agreed' end,
    case when v_raised
         then 'The price of your order has changed'
         else 'Your order is confirmed — ready to pay' end,
    'LKR ' || to_char(v_total, 'FM999,999,990.00'),
    '/orders/' || p_order_id::text,
    'order-price:' || p_order_id::text || ':' || v_status
  );

  return v_status;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_borrow_status(p_id uuid, p_status text, p_due_on date DEFAULT NULL::date, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_before jsonb;
begin
  if not public.is_super_admin() then
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
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_session(p_host_club_id uuid, p_title text, p_held_at timestamp with time zone, p_book_title text DEFAULT ''::text, p_book_author text DEFAULT ''::text, p_location text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_presenter uuid DEFAULT NULL::uuid, p_pricing_kind text DEFAULT 'free'::text, p_guest_fee numeric DEFAULT NULL::numeric, p_capacity integer DEFAULT NULL::integer, p_status text DEFAULT 'scheduled'::text, p_video_url text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid, p_presenter_count integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id     uuid;
  v_before jsonb;
  v_fee    numeric;
  v_count  int;
begin
  -- Both ends, not just the destination. Checking only p_host_club_id
  -- would let a secretary move ANOTHER club's session into their own,
  -- and checking only the existing one would let them push theirs out.
  perform public.require_club_admin(p_host_club_id);
  if p_session_id is not null then
    perform public.require_club_admin(
      (select host_club_id from sessions where id = p_session_id));
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'session title is required';
  end if;
  if p_pricing_kind not in ('free','paid') then
    raise exception 'invalid pricing kind';
  end if;

  -- Zero and negative both mean "no limit" rather than "nobody may present".
  -- A form that posts an empty number field sends 0 in some browsers, and
  -- silently forbidding all presenters would be a baffling way to fail.
  v_count := case when coalesce(p_presenter_count, 0) > 0 then p_presenter_count end;

  -- Normalise before the check constraint sees it: a free session must carry
  -- no fee, and a paid one must carry a positive one.
  v_fee := case when p_pricing_kind = 'paid' then nullif(coalesce(p_guest_fee, 0), 0) else null end;
  if p_pricing_kind = 'paid' and v_fee is null then
    raise exception 'a paid session needs a guest fee above zero';
  end if;

  if p_session_id is null then
    insert into sessions (
      host_club_id, title, book_title, book_author, held_at, location, notes,
      presenter_member_id, pricing_kind, guest_fee_lkr, capacity, status,
      video_url, presenter_count, created_by
    ) values (
      p_host_club_id, trim(p_title), coalesce(trim(p_book_title), ''),
      coalesce(trim(p_book_author), ''), p_held_at, nullif(trim(p_location), ''),
      nullif(trim(p_notes), ''), p_presenter, p_pricing_kind, v_fee, p_capacity,
      coalesce(p_status, 'scheduled'), nullif(trim(p_video_url), ''), v_count, auth.uid()
    )
    returning id into v_id;

    perform public.write_audit('session.create', 'session', v_id::text, null,
      jsonb_build_object('title', trim(p_title), 'club', p_host_club_id));
  else
    select to_jsonb(s) into v_before from sessions s where s.id = p_session_id;
    if v_before is null then
      raise exception 'session not found';
    end if;

    -- Lowering the cap below what is already recorded would leave the session
    -- in a state the recorder cannot save without un-ticking someone. Refuse,
    -- and say how many are already marked, rather than accepting a number that
    -- makes the next save fail with a confusing message.
    if v_count is not null and exists (
      select 1 from sessions where id = p_session_id
    ) then
      declare
        v_marked int;
      begin
        select count(distinct ma.member_id) into v_marked
        from member_activities ma
        join points_rules pr on pr.code = ma.activity_code and pr.is_presenting
        where ma.session_id = p_session_id;

        if v_marked > v_count then
          raise exception
            '% presenters are already recorded for this session; the limit cannot be set below that',
            v_marked;
        end if;
      end;
    end if;

    update sessions
    set host_club_id        = p_host_club_id,
        title               = trim(p_title),
        book_title          = coalesce(trim(p_book_title), ''),
        book_author         = coalesce(trim(p_book_author), ''),
        held_at             = p_held_at,
        location            = nullif(trim(p_location), ''),
        notes               = nullif(trim(p_notes), ''),
        presenter_member_id = p_presenter,
        pricing_kind        = p_pricing_kind,
        guest_fee_lkr       = v_fee,
        capacity            = p_capacity,
        status              = coalesce(p_status, status),
        video_url           = nullif(trim(p_video_url), ''),
        presenter_count     = v_count
    where id = p_session_id;

    v_id := p_session_id;
    perform public.write_audit('session.update', 'session', v_id::text, v_before,
      (select to_jsonb(s) from sessions s where s.id = v_id));
  end if;

  return v_id;
end;
$function$
;

-- ---------------------------------------------------------------------------
-- Read policies
-- ---------------------------------------------------------------------------
-- Scoping the RPCs stops a secretary CHANGING another club's things. These
-- policies are the other half: stopping them READING them. Both matter -- the
-- club's objection was to a secretary seeing other clubs' members at all, not
-- only to editing them.
--
-- Two groups. Central records (money, orders, borrowing, invites, companies)
-- become super-admin only: they are nobody's club business, and a secretary
-- could reach them purely because is_admin() did not distinguish. Club records
-- (attendance, bookings, join requests, profiles) stay visible to whoever runs
-- THAT club.
--
-- Deliberately left alone: sessions_select and videos_select. Both already
-- grant every active member a read, so the is_admin() branch in them adds
-- nothing a secretary did not already have as an ordinary member.

-- --- central: super admin only ---------------------------------------------
drop policy if exists payments_select on payments;
create policy payments_select on payments
for select to authenticated
using (member_id = (select auth.uid()) or (select public.is_super_admin()));

drop policy if exists book_orders_select on book_orders;
create policy book_orders_select on book_orders
for select to authenticated
using (member_id = (select auth.uid()) or (select public.is_super_admin()));

drop policy if exists book_order_items_select on book_order_items;
create policy book_order_items_select on book_order_items
for select to authenticated
using (exists (
  select 1 from book_orders o
  where o.id = order_id
    and (o.member_id = (select auth.uid()) or (select public.is_super_admin()))
));

drop policy if exists book_order_messages_select on book_order_messages;
create policy book_order_messages_select on book_order_messages
for select to authenticated
using (exists (
  select 1 from book_orders o
  where o.id = order_id
    and (o.member_id = (select auth.uid()) or (select public.is_super_admin()))
));

drop policy if exists borrow_requests_select on borrow_requests;
create policy borrow_requests_select on borrow_requests
for select to authenticated
using (member_id = (select auth.uid()) or (select public.is_super_admin()));

drop policy if exists invites_select_admin on invites;
create policy invites_select_admin on invites
for select to authenticated
using ((select public.is_super_admin()));

drop policy if exists companies_select on companies;
create policy companies_select on companies
for select to authenticated
using (
  (select public.is_super_admin())
  or exists (
    select 1 from clubs c
    where c.company_id = companies.id
      and (select public.current_club_ids()) @> array[c.id]
  )
);

-- --- club records: whoever runs that club ----------------------------------
drop policy if exists profiles_select_visible on profiles;
create policy profiles_select_visible on profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (select public.is_super_admin())
  -- A secretary sees the members of the club they run, and no others. This
  -- replaces a bare is_admin(), which showed them everybody.
  or exists (
    select 1 from club_memberships cm
    join clubs c on c.id = cm.club_id
    where cm.member_id = profiles.id
      and cm.status = 'active'
      and c.secretary_id = (select auth.uid())
  )
  or (
    status = 'active'
    and (select public.current_member_is_active())
    and public.shares_active_club(id)
  )
);

drop policy if exists member_activities_select on member_activities;
create policy member_activities_select on member_activities
for select to authenticated
using (
  member_id = (select auth.uid())
  or (select public.is_super_admin())
  or exists (
    select 1 from sessions s
    where s.id = member_activities.session_id
      and public.can_admin_club(s.host_club_id)
  )
);

drop policy if exists session_bookings_select on session_bookings;
create policy session_bookings_select on session_bookings
for select to authenticated
using (
  member_id = (select auth.uid())
  or (select public.is_super_admin())
  or exists (
    select 1 from sessions s
    where s.id = session_bookings.session_id
      and public.can_admin_club(s.host_club_id)
  )
);

drop policy if exists club_join_requests_select on club_join_requests;
create policy club_join_requests_select on club_join_requests
for select to authenticated
using (
  member_id = (select auth.uid())
  or (select public.is_super_admin())
  or public.can_admin_club(club_id)
);
