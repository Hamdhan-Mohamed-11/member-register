-- ============================================================================
-- 0040 -- a club admin, and two rules about who may do what and when
-- ============================================================================
-- 1. A third staff role, between secretary and super admin: club_admin. They
--    run ONE club completely -- its sessions, attendance, points, join
--    requests, videos, Discover, its members and its money -- and nothing
--    outside it. A super admin still reaches everything.
--
--    Authorisation now asks two questions instead of one:
--
--      can_admin_club(club)     may act on this club's day-to-day work
--                               (super admin, its admin, or its secretary)
--      can_manage_club(club)    may decide FOR this club: admit members,
--                               appoint its secretary, see its money
--                               (super admin or its admin -- not a secretary)
--
--    Join requests move from can_admin_club to can_manage_club, which is the
--    club asking that a secretary no longer admits members.
--
-- 2. Points cannot be recorded before the session has happened. Recording
--    attendance for a session that has not taken place lets someone hand out
--    points for an evening nobody sat through.
--
-- Borrowing already required a super admin (set_borrow_status), which is what
-- the club wants: the shelf people borrow from is at head office.
-- ============================================================================

-- --- The role ---------------------------------------------------------------
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('member', 'secretary', 'club_admin', 'super_admin'));

alter table clubs
  add column if not exists admin_id uuid references profiles(id) on delete set null;

-- One club each, the same rule as secretary_id: a club admin who ran two
-- clubs would be a super admin with extra steps.
drop index if exists clubs_admin_unique;
create unique index clubs_admin_unique on clubs (admin_id) where admin_id is not null;

comment on column clubs.admin_id is
  'The member who runs this club, above its secretary. See can_manage_club().';

-- --- The two questions -------------------------------------------------------
create or replace function public.club_admin_club_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select c.id from clubs c where c.admin_id = (select auth.uid()) limit 1;
$$;

-- The one club this staff member runs, whichever way they run it.
create or replace function public.staff_club_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(public.club_admin_club_id(), public.secretary_club_id());
$$;

create or replace function public.can_admin_club(p_club_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    p_club_id is not null
    and (
      public.is_super_admin()
      or exists (
        select 1 from clubs c
        where c.id = p_club_id
          and (c.secretary_id = (select auth.uid()) or c.admin_id = (select auth.uid()))
      )
    );
$$;

-- Deciding FOR the club, rather than doing its work.
create or replace function public.can_manage_club(p_club_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    p_club_id is not null
    and (
      public.is_super_admin()
      or exists (
        select 1 from clubs c where c.id = p_club_id and c.admin_id = (select auth.uid())
      )
    );
$$;

create or replace function public.require_club_manager(p_club_id uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_manage_club(p_club_id) then
    raise exception 'only this club''s admin may do that';
  end if;
end;
$$;

revoke execute on function
  public.club_admin_club_id(), public.staff_club_id(),
  public.can_manage_club(uuid), public.require_club_manager(uuid)
from public;
grant execute on function
  public.club_admin_club_id(), public.staff_club_id(),
  public.can_manage_club(uuid), public.require_club_manager(uuid)
to authenticated;

-- --- Join requests are the club admin's call ---------------------------------
do $$
declare
  v_def text;
  v_old text := 'perform public.require_club_admin(
    (select club_id from club_join_requests where id = p_request_id));';
  v_new text := 'perform public.require_club_manager(
    (select club_id from club_join_requests where id = p_request_id));';
begin
  foreach v_def in array array[
    pg_get_functiondef('public.approve_join_request(uuid)'::regprocedure),
    pg_get_functiondef('public.reject_join_request(uuid, text)'::regprocedure)
  ] loop
    if strpos(v_def, v_old) = 0 then
      raise exception 'join request guard not found; already patched?';
    end if;
    execute replace(v_def, v_old, v_new);
  end loop;
end;
$$;

-- --- Appointing a secretary: the club's admin, or a super admin ---------------
do $$
declare
  v_def text := pg_get_functiondef('public.appoint_club_secretary(uuid, uuid)'::regprocedure);
  v_old text := 'if not public.is_super_admin() then
    raise exception ''not authorised'';
  end if;';
begin
  if strpos(v_def, v_old) = 0 then
    raise exception 'appoint_club_secretary guard not found; already patched?';
  end if;
  execute replace(v_def, v_old, 'perform public.require_club_manager(p_club_id);');
end;
$$;

-- --- Points only after the evening --------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.record_session_attendance(uuid, jsonb)'::regprocedure);
  v_old text := 'select presenter_count into v_cap from sessions where id = p_session_id;
  if not found then
    raise exception ''session not found'';
  end if;';
  v_new text := 'select presenter_count, held_at into v_cap, v_held_at
  from sessions where id = p_session_id;
  if not found then
    raise exception ''session not found'';
  end if;

  -- Attendance and points are a record of what happened. Before the session
  -- has taken place there is nothing to record, and allowing it would let
  -- points be handed out for an evening nobody sat through.
  if v_held_at > now() then
    raise exception ''this session has not happened yet -- points can be recorded once it has'';
  end if;';
begin
  if strpos(v_def, v_old) = 0 then
    raise exception 'attendance body not found; already patched?';
  end if;
  v_def := replace(v_def, v_old, v_new);
  -- The new variable, declared beside the others.
  v_def := replace(v_def, '  v_presenters int;', '  v_presenters int;
  v_held_at    timestamptz;');
  execute v_def;
end;
$$;

-- --- Seeing people: a club admin sees their club, like its secretary ----------
create or replace function public.runs_club_applied_to(p_member_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from club_join_requests jr
    join clubs c on c.id = jr.club_id
    where jr.member_id = p_member_id
      and (c.secretary_id = (select auth.uid()) or c.admin_id = (select auth.uid()))
  );
$$;

drop policy if exists profiles_select_visible on profiles;
create policy profiles_select_visible on profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (select public.is_super_admin())
  or exists (
    select 1
    from club_memberships cm
    join clubs c on c.id = cm.club_id
    where cm.member_id = profiles.id
      and cm.status = 'active'
      and (c.secretary_id = (select auth.uid()) or c.admin_id = (select auth.uid()))
  )
  or public.runs_club_applied_to(profiles.id)
  or (
    status = 'active'
    and (select public.current_member_is_active())
    and public.shares_active_club(id)
  )
);

-- --- Their club's money --------------------------------------------------------
drop policy if exists payments_select_club_admin on payments;
create policy payments_select_club_admin on payments
for select to authenticated
using (public.can_manage_club(club_id));
