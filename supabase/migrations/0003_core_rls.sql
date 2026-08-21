-- Row Level Security for the core identity tables.
--
-- Posture, applied uniformly: every table gets RLS enabled, then an explicit
-- `revoke all` from anon and authenticated, then ONLY the grants it needs. A
-- policy without a matching grant does nothing, and a grant without a policy
-- does nothing -- both halves are required, so both are always written
-- together here.
--
-- CALL-SITE RULE for the helper functions: always wrap them in a scalar
-- subquery -- `(select public.is_admin())`, never bare `public.is_admin()`.
-- Wrapped, the planner hoists the call into an InitPlan evaluated ONCE PER
-- STATEMENT. Unwrapped, it is re-evaluated ONCE PER ROW -- a 300x cost
-- multiplier on a directory scan, and invisible until the table grows.

-- ===========================================================================
-- companies
-- ===========================================================================
alter table companies enable row level security;
revoke all on companies from anon, authenticated;
grant select on companies to authenticated;

create policy companies_select on companies
for select to authenticated
using (
  (select public.is_admin())
  -- A company-club member may see their own company record (name shown on
  -- their profile), and nobody else's.
  or exists (
    select 1 from clubs c
    where c.company_id = companies.id
      and c.id = (select public.current_club_id())
  )
);

-- ===========================================================================
-- clubs
-- ===========================================================================
alter table clubs enable row level security;
revoke all on clubs from anon, authenticated;
-- anon needs the public club list to render the /join picker BEFORE login.
grant select on clubs to anon, authenticated;

create policy clubs_select_public_anon on clubs
for select to anon
using (kind = 'public' and is_active);

create policy clubs_select_authenticated on clubs
for select to authenticated
using (is_active or (select public.is_admin()));

-- ===========================================================================
-- profiles
-- ===========================================================================
alter table profiles enable row level security;
revoke all on profiles from anon, authenticated;

-- anon gets NOTHING. The member directory requires login: a public list of 300
-- names and club affiliations is a data-protection liability with no business
-- need behind it.
grant select on profiles to authenticated;

-- COLUMN GRANTS, not a row policy, protect privileged fields.
--
-- RLS is row-level only. A `using (id = auth.uid())` UPDATE policy on its own
-- would let a member set their OWN row's role to 'super_admin' and
-- points_balance to 99999 through a raw PostgREST call -- the UI never has to
-- cooperate. role, status, club_id, points_balance, renewal_date and email are
-- absent from this grant by construction, so Postgres itself rejects any
-- UPDATE whose payload touches them.
grant update (first_name, last_name, phone, bio, avatar_path, learning_tags)
  on profiles to authenticated;

-- The directory visibility rule. Fails CLOSED on every axis: null target club,
-- null viewer club, non-active viewer, non-active target.
create policy profiles_select_visible on profiles
for select to authenticated
using (
  -- 1. always see yourself
  id = (select auth.uid())

  -- 2. staff see everyone
  or (select public.is_admin())

  -- 3. everyone else must be active, and so must you -- a pending applicant
  --    sees nobody but themselves
  or (
    status = 'active'
    and (select public.current_member_is_active())
    and (
      -- 3a. public-club members are in the open directory
      (select public.is_public_club(profiles.club_id))
      -- 3b. company-club members are visible ONLY to their own colleagues
      or profiles.club_id = (select public.current_club_id())
    )
  )
);

create policy profiles_update_own on profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Belt and braces. The column grants above are the real control; this trigger
-- is insurance against a future migration re-granting too much by accident.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Migrations (postgres) and trusted server-side code (service_role) are
  -- allowed through. PostgREST switches to the `authenticated` role for a
  -- logged-in user, so that path is always checked.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if new.role           is distinct from old.role
  or new.status         is distinct from old.status
  or new.club_id        is distinct from old.club_id
  or new.points_balance is distinct from old.points_balance
  or new.renewal_date   is distinct from old.renewal_date
  or new.email          is distinct from old.email then
    raise exception
      'profiles: role, status, club_id, points_balance, renewal_date and email are not self-editable';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileged_columns
  before update on profiles
  for each row execute function public.guard_profile_privileged_columns();

-- ===========================================================================
-- invites
-- ===========================================================================
-- Admin-only, and even then read-only through PostgREST: invites are created by
-- a service-role code path that also sends the Auth email, so there is no
-- reason to expose INSERT here.
alter table invites enable row level security;
revoke all on invites from anon, authenticated;
grant select on invites to authenticated;

create policy invites_select_admin on invites
for select to authenticated
using ((select public.is_admin()));

-- ===========================================================================
-- club_join_requests
-- ===========================================================================
alter table club_join_requests enable row level security;
revoke all on club_join_requests from anon, authenticated;
grant select on club_join_requests to authenticated;

create policy club_join_requests_select on club_join_requests
for select to authenticated
using (
  member_id = (select auth.uid())
  or (select public.is_admin())
);

-- No INSERT/UPDATE policy on purpose. Creating a request goes through the
-- request_club_join() RPC, which rejects any club whose kind <> 'public' --
-- that check is what stops a stranger self-joining a company club, and it
-- cannot be enforced by a row policy alone. Decisions go through
-- approve_join_request() / reject_join_request().

-- ===========================================================================
-- app_settings
-- ===========================================================================
-- Readable by any signed-in member: the renewal page needs the fee and term,
-- and the book list needs the discount percentage. Writable only via RPC.
alter table app_settings enable row level security;
revoke all on app_settings from anon, authenticated;
grant select on app_settings to authenticated;

create policy app_settings_select on app_settings
for select to authenticated
using (true);

-- ===========================================================================
-- admin_audit_log
-- ===========================================================================
-- Append-only, super-admin readable. Nothing may write to it through
-- PostgREST -- every entry comes from a security definer RPC.
alter table admin_audit_log enable row level security;
revoke all on admin_audit_log from anon, authenticated;
grant select on admin_audit_log to authenticated;

create policy admin_audit_log_select_super on admin_audit_log
for select to authenticated
using ((select public.is_super_admin()));
