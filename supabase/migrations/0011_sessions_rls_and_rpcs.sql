-- Session RPCs and policies.

-- ---------------------------------------------------------------------------
-- session_fee_for -- what a given member would pay for a given session
-- ---------------------------------------------------------------------------
-- The single source of truth for pricing. Anything that quotes a fee -- the
-- session page, the booking RPC, the eventual PayHere checkout -- calls this,
-- so a guest can never be charged a number the UI invented.
create or replace function public.session_fee_for(p_session_id uuid, p_member_id uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when s.pricing_kind = 'free' then 0
    -- Host-club members always attend their own club's sessions free.
    when exists (
      select 1 from club_memberships m
      where m.member_id = p_member_id
        and m.club_id = s.host_club_id
        and m.status = 'active'
    ) then 0
    else coalesce(s.guest_fee_lkr, 0)
  end
  from sessions s
  where s.id = p_session_id;
$$;

revoke execute on function public.session_fee_for(uuid, uuid) from public;
grant execute on function public.session_fee_for(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- upsert_session
-- ---------------------------------------------------------------------------
create or replace function public.upsert_session(
  p_session_id   uuid,
  p_host_club_id uuid,
  p_title        text,
  p_book_title   text,
  p_book_author  text,
  p_held_at      timestamptz,
  p_location     text default null,
  p_notes        text default null,
  p_presenter    uuid default null,
  p_pricing_kind text default 'free',
  p_guest_fee    numeric default null,
  p_capacity     int default null,
  p_status       text default 'scheduled',
  p_video_url    text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_before jsonb;
  v_fee    numeric;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'session title is required';
  end if;
  if p_pricing_kind not in ('free','paid') then
    raise exception 'invalid pricing kind';
  end if;

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
      video_url, created_by
    ) values (
      p_host_club_id, trim(p_title), coalesce(trim(p_book_title), ''),
      coalesce(trim(p_book_author), ''), p_held_at, nullif(trim(p_location), ''),
      nullif(trim(p_notes), ''), p_presenter, p_pricing_kind, v_fee, p_capacity,
      coalesce(p_status, 'scheduled'), nullif(trim(p_video_url), ''), auth.uid()
    )
    returning id into v_id;

    perform public.write_audit('session.create', 'session', v_id::text, null,
      jsonb_build_object('title', trim(p_title), 'club', p_host_club_id));
  else
    select to_jsonb(s) into v_before from sessions s where s.id = p_session_id;
    if v_before is null then
      raise exception 'session not found';
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
        video_url           = nullif(trim(p_video_url), '')
    where id = p_session_id;

    v_id := p_session_id;
    perform public.write_audit('session.update', 'session', v_id::text, v_before,
      (select to_jsonb(s) from sessions s where s.id = v_id));
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_session_attendance
-- ---------------------------------------------------------------------------
-- The live recorder: the Secretary saves the whole roster in one go.
--
-- p_entries is [{ "member_id": uuid, "codes": ["attend","present"] }, ...].
-- Codes absent from a member's list are REMOVED, so unticking a box and saving
-- actually undoes it -- this is an idempotent "make it look like this", not an
-- append.
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
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  if not exists (select 1 from sessions where id = p_session_id) then
    raise exception 'session not found';
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
$$;

-- ---------------------------------------------------------------------------
-- book_session -- a guest reserves a place
-- ---------------------------------------------------------------------------
-- Creates the booking and returns its id. The fee is computed here, never
-- accepted from the caller. A zero fee confirms immediately; a positive one
-- waits for payment (Phase 5 attaches PayHere to exactly this row).
create or replace function public.book_session(p_session_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := auth.uid();
  v_session sessions%rowtype;
  v_fee     numeric;
  v_taken   int;
  v_id      uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from profiles where id = v_me and status = 'active') then
    raise exception 'your membership is not active';
  end if;

  select * into v_session from sessions where id = p_session_id;
  if not found then
    raise exception 'session not found';
  end if;
  if v_session.status <> 'scheduled' then
    raise exception 'this session is not open for booking';
  end if;

  v_fee := public.session_fee_for(p_session_id, v_me);

  if v_session.capacity is not null then
    select count(*) into v_taken
    from session_bookings
    where session_id = p_session_id and status in ('pending_payment','confirmed');

    if v_taken >= v_session.capacity then
      raise exception 'this session is full';
    end if;
  end if;

  insert into session_bookings (session_id, member_id, status, fee_lkr, confirmed_at)
  values (
    p_session_id, v_me,
    case when v_fee = 0 then 'confirmed' else 'pending_payment' end,
    v_fee,
    case when v_fee = 0 then now() else null end
  )
  on conflict (session_id, member_id) do update
    set status = case
          -- Never downgrade a booking that is already paid for.
          when session_bookings.status = 'confirmed' then 'confirmed'
          when excluded.fee_lkr = 0 then 'confirmed'
          else 'pending_payment'
        end
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.cancel_session_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking session_bookings%rowtype;
begin
  select * into v_booking from session_bookings where id = p_booking_id;
  if not found then
    raise exception 'booking not found';
  end if;

  if v_booking.member_id <> auth.uid() and not public.is_admin() then
    raise exception 'not authorised';
  end if;

  -- A paid booking is a refund question, not a self-service cancel.
  if v_booking.status = 'confirmed' and v_booking.fee_lkr > 0 and not public.is_admin() then
    raise exception 'please contact the club to cancel a paid booking';
  end if;

  update session_bookings set status = 'cancelled' where id = p_booking_id;
end;
$$;

revoke execute on function
  public.upsert_session(uuid, uuid, text, text, text, timestamptz, text, text, uuid, text, numeric, int, text, text),
  public.record_session_attendance(uuid, jsonb),
  public.book_session(uuid),
  public.cancel_session_booking(uuid)
from public;

grant execute on function
  public.upsert_session(uuid, uuid, text, text, text, timestamptz, text, text, uuid, text, numeric, int, text, text),
  public.record_session_attendance(uuid, jsonb),
  public.book_session(uuid),
  public.cancel_session_booking(uuid)
to authenticated;

-- ===========================================================================
-- RLS
-- ===========================================================================

-- points_rules: everyone reads (the UI shows what each activity is worth),
-- only super admins write, and only through an RPC.
alter table points_rules enable row level security;
revoke all on points_rules from anon, authenticated;
grant select on points_rules to authenticated;

create policy points_rules_select on points_rules
for select to authenticated using (true);

-- sessions: readable by every active member regardless of club. Guests cannot
-- decide to pay for a session they cannot see.
alter table sessions enable row level security;
revoke all on sessions from anon, authenticated;
grant select on sessions to authenticated;

create policy sessions_select on sessions
for select to authenticated
using ((select public.current_member_is_active()) or (select public.is_admin()));

-- session_bookings: your own, plus admins.
alter table session_bookings enable row level security;
revoke all on session_bookings from anon, authenticated;
grant select on session_bookings to authenticated;

create policy session_bookings_select on session_bookings
for select to authenticated
using (member_id = (select auth.uid()) or (select public.is_admin()));

-- No INSERT/UPDATE policy: bookings go through book_session(), which is where
-- the fee is computed and capacity is enforced. A member writing their own
-- booking row could set fee_lkr to zero.

-- member_activities: your own, plus admins. Members can see the ledger behind
-- their balance but can never write to it.
alter table member_activities enable row level security;
revoke all on member_activities from anon, authenticated;
grant select on member_activities to authenticated;

create policy member_activities_select on member_activities
for select to authenticated
using (member_id = (select auth.uid()) or (select public.is_admin()));
