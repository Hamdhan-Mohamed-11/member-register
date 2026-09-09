-- ---------------------------------------------------------------------------
-- 0023 — how many presenters a session is allowed
-- ---------------------------------------------------------------------------
--
-- Presenting is worth 20 points against attending's 10, so a roster where
-- everyone is marked as having presented is the cheapest way to inflate a
-- leaderboard. The session already knows how many people were scheduled to
-- present; this makes that number a limit rather than a note.
--
-- The limit is enforced in record_session_attendance, NOT only in the
-- recorder's UI. Greying out a button stops an honest mistake; it does not
-- stop a hand-rolled POST to PostgREST by anyone holding a secretary session,
-- which is exactly the person the rule exists to constrain.
-- ---------------------------------------------------------------------------

-- Which activity codes count as "presenting" is data, not a hardcoded list.
-- There are two of them today and there could be a third next year; a rule
-- flagged here is counted by the cap with no code change anywhere.
alter table points_rules
  add column if not exists is_presenting boolean not null default false;

update points_rules
set is_presenting = true
where code in ('present', 'present_other_club');

comment on column points_rules.is_presenting is
  'Counts towards a session''s presenter cap. See record_session_attendance.';

-- Null means "no limit", which is what every existing session gets. That is
-- deliberate: back-filling a guess onto sessions that already have their
-- attendance recorded could invalidate a roster somebody saved months ago.
alter table sessions
  add column if not exists presenter_count int;

alter table sessions drop constraint if exists sessions_presenter_count_check;
alter table sessions add constraint sessions_presenter_count_check
  check (presenter_count is null or presenter_count > 0);

comment on column sessions.presenter_count is
  'How many people are scheduled to present. Null = no limit.';

-- ---------------------------------------------------------------------------
-- upsert_session — carries the new field
-- ---------------------------------------------------------------------------
-- The old signature must be DROPPED, not just replaced. Adding a parameter
-- with a default creates a second overload rather than replacing the first,
-- and PostgREST then cannot decide which one a call means -- it fails with
-- "could not choose the best candidate function", which reads like a bad
-- request rather than a migration problem.
drop function if exists public.upsert_session(
  uuid, text, timestamptz, text, text, text, text, uuid, text, numeric, int, text, text, uuid
);

create or replace function public.upsert_session(
  p_host_club_id   uuid,
  p_title          text,
  p_held_at        timestamptz,
  p_book_title     text default '',
  p_book_author    text default '',
  p_location       text default null,
  p_notes          text default null,
  p_presenter      uuid default null,
  p_pricing_kind   text default 'free',
  p_guest_fee      numeric default null,
  p_capacity       int default null,
  p_status         text default 'scheduled',
  p_video_url      text default null,
  p_session_id     uuid default null,
  p_presenter_count int default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_before jsonb;
  v_fee    numeric;
  v_count  int;
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
$$;

revoke execute on function public.upsert_session(
  uuid, text, timestamptz, text, text, text, text, uuid, text, numeric, int, text, text, uuid, int
) from public;

grant execute on function public.upsert_session(
  uuid, text, timestamptz, text, text, text, text, uuid, text, numeric, int, text, text, uuid, int
) to authenticated;

-- ---------------------------------------------------------------------------
-- record_session_attendance — the cap is enforced here
-- ---------------------------------------------------------------------------
-- Identical to 0011 apart from the presenter check. p_entries is the FULL
-- desired roster state, not a delta, so counting presenters straight off it is
-- both complete and correct -- there is no "already saved" set to add.
create or replace function public.record_session_attendance(
  p_session_id uuid,
  p_entries    jsonb
)
returns int
language plpgsql security definer set search_path = public as $$
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
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

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
$$;
