-- ============================================================================
-- 0042 -- feedback after a session: one form about the evening, one about the
--         person who presented
-- ============================================================================
-- Who may write it: whoever the club recorded as having attended. Attendance
-- is the club's own record of who was in the room, so it is the honest gate --
-- and it cannot be given before the session has happened, because attendance
-- cannot be recorded before then either (0040).
--
-- Who may read it:
--
--   session feedback    the club's admin (and a super admin). Not the
--                       secretary, not the presenter.
--   presenter feedback  the club's admin, and the presenter themselves --
--                       but the presenter sees it WITHOUT names, through
--                       presenter_feedback(), so people answer honestly.
--                       Admins see who wrote what, so that something
--                       abusive can be dealt with rather than shrugged at.
--
-- One row per member per session per kind: feedback is an opinion, not a
-- petition, and a second thought replaces the first rather than stacking.
-- ============================================================================

create table if not exists session_feedback (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  member_id    uuid not null references profiles(id) on delete cascade,
  kind         text not null check (kind in ('session', 'presenter')),
  -- The presenter this is about, kept even if the session's presenter is
  -- later changed: feedback belongs to the person who stood up that night.
  presenter_id uuid references profiles(id) on delete set null,
  rating       int  not null check (rating between 1 and 5),
  comment      text check (comment is null or char_length(comment) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (session_id, member_id, kind)
);

create index if not exists session_feedback_session_idx
  on session_feedback (session_id, kind);
create index if not exists session_feedback_presenter_idx
  on session_feedback (presenter_id) where kind = 'presenter';

alter table session_feedback enable row level security;
revoke all on session_feedback from anon, authenticated;
grant select on session_feedback to authenticated;

-- Reads: your own, or the club's admin. Writes go through the RPC below,
-- which is why there is no insert or update policy.
drop policy if exists session_feedback_select on session_feedback;
create policy session_feedback_select on session_feedback
for select to authenticated
using (
  member_id = (select auth.uid())
  or public.can_manage_club((select host_club_id from sessions s where s.id = session_id))
);

-- ---------------------------------------------------------------------------
-- Writing it
-- ---------------------------------------------------------------------------
create or replace function public.give_session_feedback(
  p_session_id uuid,
  p_kind       text,
  p_rating     int,
  p_comment    text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_session sessions%rowtype;
begin
  if p_kind not in ('session', 'presenter') then
    raise exception 'invalid feedback kind';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'a rating from 1 to 5 is needed';
  end if;

  select * into v_session from sessions where id = p_session_id;
  if not found then
    raise exception 'session not found';
  end if;
  if v_session.held_at > now() then
    raise exception 'this session has not happened yet';
  end if;

  -- The club's own record of who was there.
  if not exists (
    select 1 from member_activities a
    where a.session_id = p_session_id
      and a.member_id = (select auth.uid())
      and a.activity_code = 'attend'
  ) then
    raise exception 'only people the club recorded as attending can give feedback';
  end if;

  if p_kind = 'presenter' and v_session.presenter_member_id is null then
    raise exception 'this session had no presenter';
  end if;

  -- Nobody rates their own presenting.
  if p_kind = 'presenter' and v_session.presenter_member_id = (select auth.uid()) then
    raise exception 'you cannot give feedback on your own presenting';
  end if;

  insert into session_feedback (session_id, member_id, kind, presenter_id, rating, comment)
  values (
    p_session_id, (select auth.uid()), p_kind,
    case when p_kind = 'presenter' then v_session.presenter_member_id end,
    p_rating, nullif(btrim(coalesce(p_comment, '')), '')
  )
  on conflict (session_id, member_id, kind) do update
    set rating = excluded.rating,
        comment = excluded.comment,
        updated_at = now();
end;
$$;

revoke execute on function public.give_session_feedback(uuid, text, int, text) from public;
grant execute on function public.give_session_feedback(uuid, text, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- What the presenter sees: their own feedback, without names
-- ---------------------------------------------------------------------------
create or replace function public.presenter_feedback(p_session_id uuid)
returns table (rating int, comment text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.rating, f.comment, f.created_at
  from session_feedback f
  join sessions s on s.id = f.session_id
  where f.session_id = p_session_id
    and f.kind = 'presenter'
    and s.presenter_member_id = (select auth.uid())
  order by f.created_at desc;
$$;

revoke execute on function public.presenter_feedback(uuid) from public;
grant execute on function public.presenter_feedback(uuid) to authenticated;

-- Everything a presenter has ever been told, across their sessions.
create or replace function public.my_presenter_feedback()
returns table (
  session_id uuid,
  title      text,
  held_at    timestamptz,
  rating     int,
  comment    text,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.held_at, f.rating, f.comment, f.created_at
  from session_feedback f
  join sessions s on s.id = f.session_id
  where f.kind = 'presenter'
    and s.presenter_member_id = (select auth.uid())
  order by s.held_at desc, f.created_at desc;
$$;

revoke execute on function public.my_presenter_feedback() from public;
grant execute on function public.my_presenter_feedback() to authenticated;
