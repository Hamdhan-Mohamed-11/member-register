-- Club types, and the visibility rule they carry.
--
-- The club list has grown a layer above `clubs`:
--
--   Kids Club
--   Teen Club
--   Public Clubs      -- Arcane, Aureate, Subhavi, Ilakkiya Perarasu
--   Special Clubs     -- Entrepreneurs, The Conclave CEO, Mindfulness
--   Corporate Clubs   -- Acorn, Akbar Brothers
--
-- These are NOT a replacement for clubs.kind. `kind` ('public'|'company')
-- stays exactly as it is: it drives billing, the company-invite path, and the
-- one-club-per-company constraint, and nothing about that changed. A type is a
-- second, admin-editable dimension layered on top -- Corporate Clubs maps onto
-- kind='company', every other type onto kind='public'.
--
-- The one thing a type decides is WHO CAN SEE WHOM, and that single setting
-- drives both the member directory and the leaderboards. Encoding it here
-- rather than in policy code means adding a sixth type is an admin action, not
-- a deployment.

create table club_types (
  id      uuid primary key default gen_random_uuid(),
  name    text not null unique,
  slug    text not null unique,

  -- 'club' -- you see only members of your OWN club, even within this type.
  --           Corporate: Acorn must never see Akbar Brothers. Special: the
  --           CEO Club and the Entrepreneurs Club are separate rooms.
  -- 'type' -- you see every member of every club of this type. Public Clubs:
  --           Arcane sees Aureate sees Subhavi, because they are one community
  --           split into reading groups rather than five private ones.
  --
  -- Defaults to the CLOSED value. A type added by an admin who does not read
  -- this column leaks nothing.
  member_visibility text not null default 'club'
                      check (member_visibility in ('club','type')),

  -- Kids Club: the account belongs to a guardian who registers a child, so the
  -- join flow has to collect the child's details and the reader is not the
  -- account holder. Nothing branches on this yet -- it is here so the flow has
  -- something to branch on when it is built, rather than hardcoding a club id.
  requires_guardian boolean not null default false,

  description text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index club_types_order_idx on club_types(sort_order, name) where is_active;

alter table clubs
  add column type_id uuid references club_types(id) on delete restrict;

-- Whether a stranger can pick this club on /join.
--
-- Before this, /join listed every club with kind='public', which now includes
-- Kids, Teen and Special. Nobody should be able to self-register into The
-- Conclave CEO Club from a public form. Defaults to false and is set per club
-- by an admin, so a newly created club is invite-only until someone decides
-- otherwise -- the safe direction to fail in.
alter table clubs
  add column is_open_join boolean not null default false;

create index clubs_type_idx on clubs(type_id) where is_active;

-- ---------------------------------------------------------------------------
-- Seed the five types
-- ---------------------------------------------------------------------------
insert into club_types (name, slug, member_visibility, requires_guardian, sort_order, description) values
  ('Kids Club',       'kids',      'club', true,  10, 'Registered by a parent or guardian on a child''s behalf.'),
  ('Teen Club',       'teen',      'club', false, 20, 'Members see only their own club.'),
  ('Public Clubs',    'public',    'type', false, 30, 'One community across several reading groups -- members see each other.'),
  ('Special Clubs',   'special',   'club', false, 40, 'Interest-based clubs, each its own room.'),
  ('Corporate Clubs', 'corporate', 'club', false, 50, 'One private club per company. Companies never see each other.')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- Every existing club predates types. Company clubs are Corporate by
-- definition; everything else is a Public Club, which is what they were.
update clubs c
set type_id = (select id from club_types where slug = 'corporate')
where c.kind = 'company' and c.type_id is null;

update clubs c
set type_id = (select id from club_types where slug = 'public'),
    -- These are the clubs /join already offered, so keeping them offered is
    -- the no-change outcome for anyone mid-signup.
    is_open_join = true
where c.kind = 'public' and c.type_id is null;

-- ---------------------------------------------------------------------------
-- shares_active_club -- now type-aware
-- ---------------------------------------------------------------------------
-- Carried over from 0006, with the type rule added. Everything else about it
-- is unchanged: still SECURITY DEFINER, still keyed on auth.uid(), still the
-- single place the directory and every "can I see this member" check agree.
--
-- Fails closed twice over: a club with no type, or a type whose visibility is
-- 'club', both collapse back to plain same-club matching.
create or replace function public.shares_active_club(p_member_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from club_memberships mine
    join clubs mc on mc.id = mine.club_id
    left join club_types mt on mt.id = mc.type_id
    join club_memberships theirs
      on theirs.member_id = p_member_id
     and theirs.status = 'active'
    join clubs tc on tc.id = theirs.club_id
    where mine.member_id = (select auth.uid())
      and mine.status = 'active'
      and (
        theirs.club_id = mine.club_id
        or (
          mt.member_visibility = 'type'
          and tc.type_id = mc.type_id
          and mt.is_active
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Admin CRUD for types
-- ---------------------------------------------------------------------------
create or replace function public.create_club_type(
  p_name              text,
  p_member_visibility text default 'club',
  p_requires_guardian boolean default false,
  p_description       text default null,
  p_sort_order        int default 100
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_slug text;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'a name is required';
  end if;
  if p_member_visibility not in ('club','type') then
    raise exception 'visibility must be club or type';
  end if;

  v_slug := public.slugify(p_name);
  if exists (select 1 from club_types where slug = v_slug) then
    raise exception 'a club type with a similar name already exists';
  end if;

  insert into club_types (name, slug, member_visibility, requires_guardian, description, sort_order)
  values (trim(p_name), v_slug, p_member_visibility, p_requires_guardian,
          nullif(trim(p_description), ''), p_sort_order)
  returning id into v_id;

  perform public.write_audit('club_type.create', 'club_type', v_id::text, null,
    jsonb_build_object('name', trim(p_name), 'visibility', p_member_visibility));

  return v_id;
end;
$$;

create or replace function public.update_club_type(
  p_type_id           uuid,
  p_name              text default null,
  p_member_visibility text default null,
  p_requires_guardian boolean default null,
  p_description       text default null,
  p_sort_order        int default null,
  p_is_active         boolean default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;
  if p_member_visibility is not null and p_member_visibility not in ('club','type') then
    raise exception 'visibility must be club or type';
  end if;

  select to_jsonb(t) into v_before from club_types t where t.id = p_type_id;
  if v_before is null then
    raise exception 'club type not found';
  end if;

  -- Deactivating a type that still has live clubs would silently narrow every
  -- one of their members' directory back to same-club. Refuse instead.
  if p_is_active = false and exists (
    select 1 from clubs where type_id = p_type_id and is_active
  ) then
    raise exception 'move or archive this type''s clubs first';
  end if;

  update club_types
  set name              = coalesce(nullif(trim(p_name), ''), name),
      member_visibility = coalesce(p_member_visibility, member_visibility),
      requires_guardian = coalesce(p_requires_guardian, requires_guardian),
      description       = coalesce(nullif(trim(p_description), ''), description),
      sort_order        = coalesce(p_sort_order, sort_order),
      is_active         = coalesce(p_is_active, is_active)
  where id = p_type_id;

  perform public.write_audit('club_type.update', 'club_type', p_type_id::text, v_before,
    (select to_jsonb(t) from club_types t where t.id = p_type_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- create_public_club / update_club -- extended with type and open-join
-- ---------------------------------------------------------------------------
-- DROPPED and recreated rather than overloaded. Adding a defaulted parameter
-- creates a SECOND function with a different signature, and a four-argument
-- call would then be ambiguous between the two.
drop function if exists public.create_public_club(text, text, numeric, int);
drop function if exists public.update_club(uuid, text, text, numeric, int, boolean);

create or replace function public.create_public_club(
  p_name        text,
  p_description text default null,
  p_fee_lkr     numeric default null,
  p_term_months int default null,
  p_type_id     uuid default null,
  p_open_join   boolean default false
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_type uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'club name is required';
  end if;

  -- Fall back to Public Clubs rather than leaving type_id null: a club with no
  -- type appears nowhere in the grouped list and its members quietly get
  -- same-club-only visibility.
  v_type := coalesce(p_type_id, (select id from club_types where slug = 'public'));

  if exists (select 1 from club_types where id = v_type and slug = 'corporate') then
    raise exception 'use create_company_with_club for a corporate club';
  end if;

  insert into clubs (name, slug, kind, description, membership_fee_lkr, term_months,
                     type_id, is_open_join)
  values (trim(p_name), public.unique_club_slug(p_name), 'public',
          nullif(trim(p_description), ''), p_fee_lkr, p_term_months,
          v_type, coalesce(p_open_join, false))
  returning id into v_id;

  perform public.write_audit('club.create', 'club', v_id::text, null,
    jsonb_build_object('name', trim(p_name), 'type', v_type, 'open_join', p_open_join));

  return v_id;
end;
$$;

create or replace function public.update_club(
  p_club_id     uuid,
  p_name        text default null,
  p_description text default null,
  p_fee_lkr     numeric default null,
  p_term_months int default null,
  p_is_active   boolean default null,
  p_type_id     uuid default null,
  p_open_join   boolean default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  select to_jsonb(c) into v_before from clubs c where c.id = p_club_id;
  if v_before is null then
    raise exception 'club not found';
  end if;

  -- A company club cannot be moved out of Corporate: kind='company' carries
  -- the one-club-per-company constraint and the invite path, and the type has
  -- to keep agreeing with it.
  if p_type_id is not null
     and (v_before ->> 'kind') = 'company'
     and not exists (select 1 from club_types where id = p_type_id and slug = 'corporate') then
    raise exception 'a company club must stay under Corporate Clubs';
  end if;

  -- Null means "leave alone" for name/active/type/join. Fee and term are
  -- different: null there is a MEANINGFUL value (fall back to app_settings),
  -- so they are always written rather than coalesced away.
  update clubs
  set name        = coalesce(nullif(trim(p_name), ''), name),
      description = coalesce(nullif(trim(p_description), ''), description),
      membership_fee_lkr = p_fee_lkr,
      term_months        = p_term_months,
      is_active    = coalesce(p_is_active, is_active),
      type_id      = coalesce(p_type_id, type_id),
      is_open_join = coalesce(p_open_join, is_open_join)
  where id = p_club_id;

  perform public.write_audit('club.update', 'club', p_club_id::text, v_before,
    (select to_jsonb(c) from clubs c where c.id = p_club_id));
end;
$$;

-- create_company_with_club builds its club with a plain INSERT, so rather than
-- re-creating that function just to add one column, a trigger stamps the
-- Corporate type on any company club that arrives without one. This also
-- covers a company club created by any future path.
create or replace function public.stamp_corporate_type()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'company' and new.type_id is null then
    new.type_id := (select id from club_types where slug = 'corporate');
  end if;
  return new;
end;
$$;

create trigger clubs_stamp_corporate_type
  before insert on clubs
  for each row execute function public.stamp_corporate_type();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table club_types enable row level security;
revoke all on club_types from anon, authenticated;
grant select on club_types to anon, authenticated;

-- Readable by everyone, signed-out visitors included: /join groups the clubs
-- it offers under their type names. A type name is not private.
create policy club_types_select on club_types
for select to anon, authenticated
using (true);

revoke execute on function
  public.create_club_type(text, text, boolean, text, int),
  public.update_club_type(uuid, text, text, boolean, text, int, boolean),
  public.create_public_club(text, text, numeric, int, uuid, boolean),
  public.update_club(uuid, text, text, numeric, int, boolean, uuid, boolean),
  public.stamp_corporate_type()
from public;

grant execute on function
  public.create_club_type(text, text, boolean, text, int),
  public.update_club_type(uuid, text, text, boolean, text, int, boolean),
  public.create_public_club(text, text, numeric, int, uuid, boolean),
  public.update_club(uuid, text, text, numeric, int, boolean, uuid, boolean)
to authenticated;
