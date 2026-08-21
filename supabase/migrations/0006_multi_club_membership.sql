-- Members belong to MANY clubs, not one.
--
-- Model change: a member picks one club when they register (covered by the
-- signup membership fee), and may afterwards pay to join further clubs. Each
-- club membership renews SEPARATELY -- its own fee, its own renewal date -- so
-- renewal moves off `profiles` and onto the membership row.
--
-- Visibility follows club membership: you can see someone if you share an
-- active club with them. This replaces the old public/company split, and it
-- keeps working when a company employee pays to join a public club -- they
-- become visible to that club and stay invisible to everyone else.

-- ---------------------------------------------------------------------------
-- Per-club pricing
-- ---------------------------------------------------------------------------
-- Null means "use the app_settings default", so clubs only carry a value when
-- they actually differ. Resolve with coalesce(club.x, settings.x) -- never read
-- these directly.
alter table clubs
  add column if not exists membership_fee_lkr numeric(12,2)
    check (membership_fee_lkr is null or membership_fee_lkr >= 0),
  add column if not exists term_months int
    check (term_months is null or term_months > 0);

-- ---------------------------------------------------------------------------
-- club_memberships
-- ---------------------------------------------------------------------------
create table club_memberships (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references profiles(id) on delete cascade,
  club_id      uuid not null references clubs(id) on delete cascade,

  status       text not null default 'pending'
                 check (status in ('pending','active','expired','cancelled','rejected')),

  -- The club chosen at registration. Its fee is included in the signup
  -- membership payment; every later club is paid for separately. At most one
  -- per member (see the partial unique index below).
  is_primary   boolean not null default false,

  joined_on    date,
  renewal_date date,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (member_id, club_id)
);

create unique index club_memberships_one_primary_idx
  on club_memberships(member_id) where is_primary;
create index club_memberships_member_idx on club_memberships(member_id);
create index club_memberships_club_idx   on club_memberships(club_id);
-- The hot path: "who is in this club right now", used by every visibility check.
create index club_memberships_active_idx
  on club_memberships(club_id, member_id) where status = 'active';
create index club_memberships_renewal_idx
  on club_memberships(renewal_date) where status = 'active';

create trigger club_memberships_touch_updated_at
  before update on club_memberships
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Backfill from the single-club columns, then retire them
-- ---------------------------------------------------------------------------
insert into club_memberships (member_id, club_id, status, is_primary, joined_on, renewal_date)
select
  p.id,
  p.club_id,
  case when p.status = 'active' then 'active' else 'pending' end,
  true,
  p.joined_on,
  p.renewal_date
from profiles p
where p.club_id is not null
on conflict (member_id, club_id) do nothing;

-- These policies and the guard trigger reference the columns about to be
-- dropped, so they have to go first -- Postgres refuses to drop a column a
-- policy depends on.
drop policy if exists profiles_select_visible on profiles;
drop policy if exists companies_select on companies;

alter table profiles
  drop column if exists club_id,
  drop column if exists renewal_date;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- current_club_id() is gone: a member no longer has "a" club.
drop function if exists public.current_club_id();

create or replace function public.current_club_ids()
returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(club_id), '{}')
  from club_memberships
  where member_id = auth.uid() and status = 'active';
$$;

-- THE visibility primitive: do the viewer and the target share a live club?
--
-- Performance note: because this takes a per-row argument it CANNOT be hoisted
-- into a per-statement InitPlan the way the zero-argument helpers can -- it
-- runs once per candidate row. That is fine here (each call is an index-only
-- probe, and the directory is ~300 rows) but it is the reason this function
-- stays a single indexed EXISTS rather than doing anything cleverer.
create or replace function public.shares_active_club(p_member_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from club_memberships mine
    join club_memberships theirs on theirs.club_id = mine.club_id
    where mine.member_id = auth.uid()
      and mine.status = 'active'
      and theirs.member_id = p_member_id
      and theirs.status = 'active'
  );
$$;

-- Is a given member in ANY live club? Used to decide whether to nag them to
-- renew, and by policies that gate club-only content.
create or replace function public.current_member_has_active_club()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from club_memberships
    where member_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.can_view_member(p_member_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles t
    where t.id = p_member_id
      and (
        t.id = auth.uid()
        or coalesce(
             (select role from profiles where id = auth.uid())
               in ('secretary','super_admin'),
             false)
        or (
          t.status = 'active'
          and coalesce((select status from profiles where id = auth.uid()) = 'active', false)
          and public.shares_active_club(t.id)
        )
      )
  );
$$;

revoke execute on function
  public.current_club_ids(),
  public.shares_active_club(uuid),
  public.current_member_has_active_club()
from public;

grant execute on function
  public.current_club_ids(),
  public.shares_active_club(uuid),
  public.current_member_has_active_club()
to authenticated;

-- ---------------------------------------------------------------------------
-- Policies, rebuilt on the shared-club rule
-- ---------------------------------------------------------------------------
create policy profiles_select_visible on profiles
for select to authenticated
using (
  -- 1. always see yourself
  id = (select auth.uid())

  -- 2. staff see everyone
  or (select public.is_admin())

  -- 3. otherwise: both parties active, and you share a live club.
  --    Fails closed -- a member with no active club membership sees nobody,
  --    which is also what makes lapsed memberships bite.
  or (
    status = 'active'
    and (select public.current_member_is_active())
    and public.shares_active_club(profiles.id)
  )
);

create policy companies_select on companies
for select to authenticated
using (
  (select public.is_admin())
  -- Your own employer, via any company club you actively belong to.
  or exists (
    select 1 from clubs c
    where c.company_id = companies.id
      -- `@> array[x]` rather than `x = any(...)`: with a scalar subquery,
      -- `any(...)` is parsed as the SET form of ANY and Postgres then compares
      -- uuid against uuid[]. Array containment is unambiguous.
      and (select public.current_club_ids()) @> array[c.id]
  )
);

-- ---------------------------------------------------------------------------
-- club_memberships RLS
-- ---------------------------------------------------------------------------
alter table club_memberships enable row level security;
revoke all on club_memberships from anon, authenticated;
grant select on club_memberships to authenticated;

create policy club_memberships_select on club_memberships
for select to authenticated
using (
  member_id = (select auth.uid())
  or (select public.is_admin())
  -- You may see that a visible member belongs to a club you also belong to.
  -- Note this does NOT reveal their other clubs.
  or (
    (select public.current_club_ids()) @> array[club_id]
    and public.can_view_member(member_id)
  )
);

-- No INSERT/UPDATE policy on purpose. Joining a club goes through
-- request_club_join() (public clubs, needs approval) or a paid checkout, and
-- both must run server-side where the fee is computed and the club kind is
-- checked. A member must never be able to write their own membership row.

-- ---------------------------------------------------------------------------
-- Privileged-column guard, minus the columns that no longer exist
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if new.role           is distinct from old.role
  or new.status         is distinct from old.status
  or new.points_balance is distinct from old.points_balance
  or new.email          is distinct from old.email then
    raise exception
      'profiles: role, status, points_balance and email are not self-editable';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- handle_new_user, now creating a club membership rather than setting a column
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_invite invites%rowtype;
  v_term   int;
begin
  select * into v_invite
  from invites
  where lower(email) = lower(new.email)
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    -- Invited: active immediately, no approval step. See the security note on
    -- the invites table -- the invite, never raw_user_meta_data, is what
    -- carries role and club.
    insert into profiles (id, email, role, status)
    values (new.id, new.email, v_invite.role, 'active');

    if v_invite.club_id is not null then
      -- Club-specific term wins over the global default.
      select coalesce(c.term_months, s.membership_term_months, 12)
        into v_term
      from clubs c cross join app_settings s
      where c.id = v_invite.club_id and s.id = 1;

      insert into club_memberships
        (member_id, club_id, status, is_primary, joined_on, renewal_date)
      values (
        new.id,
        v_invite.club_id,
        'active',
        true,
        current_date,
        (current_date + (coalesce(v_term, 12) || ' months')::interval)::date
      )
      on conflict (member_id, club_id) do nothing;
    end if;

    update invites
    set status = 'accepted', accepted_at = now(), accepted_profile_id = new.id
    where id = v_invite.id;
  else
    -- Public self-signup. No club yet: they pick one, an admin approves, and
    -- the membership row is created then.
    insert into profiles (id, email, role, status)
    values (new.id, new.email, 'member', 'pending');
  end if;

  return new;
end;
$$;
