-- Core identity: companies, clubs, profiles, invites, join requests, settings,
-- audit log. Everything else in the portal hangs off `profiles`, so this file
-- lands before anything that needs an owner.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
-- A company that has bought club membership for its employees. Employees are
-- onboarded by invite only (see `invites`), never by public application.
create table companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  contact_email text,
  contact_phone text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- clubs
-- ---------------------------------------------------------------------------
-- A member belongs to exactly ONE club (profiles.club_id). Sessions are global
-- and are NOT scoped to a club -- club membership only drives directory
-- visibility, never who may attend what.
create table clubs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  kind        text not null check (kind in ('public','company')),
  company_id  uuid references companies(id) on delete restrict,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  -- A company club must name its company; a public club must not.
  constraint clubs_company_kind_ck check ((kind = 'company') = (company_id is not null))
);

-- One company maps to exactly one club. This is what lets the directory
-- visibility rule collapse "visible to colleagues" into `club_id = my_club_id`
-- instead of needing a company-level join in every policy.
create unique index clubs_one_per_company_idx
  on clubs(company_id) where kind = 'company';
create index clubs_kind_idx on clubs(kind) where is_active;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- profiles.id IS auth.users.id. No separate user_id column, no join table.
-- This is the single most load-bearing structural decision in the schema:
--   * every ownership policy is `id = (select auth.uid())` -- a PK lookup
--   * storage object ownership works via (storage.foldername(name))[1]
--     with no indirection
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,

  role           text not null default 'member'
                   check (role in ('member','secretary','super_admin')),
  status         text not null default 'pending'
                   check (status in ('pending','active','suspended','rejected')),

  first_name     text not null default '',
  last_name      text not null default '',

  -- Denormalised from auth.users. RLS-protected client queries cannot read
  -- auth.users at all, and every admin list needs the email, so it is mirrored
  -- here by handle_new_user() and kept in sync on email change.
  email          text not null,
  phone          text,

  club_id        uuid references clubs(id) on delete set null,

  -- Storage object key, NOT a URL. The avatars bucket is private; URLs are
  -- signed on demand after a visibility check.
  avatar_path    text,
  bio            text,

  -- "Currently learning" free-text tags. An array rather than a child table:
  -- no join, no second RLS surface, and 300 members will never need facets.
  learning_tags  text[] not null default '{}',

  -- Denormalised cache of sum(member_activities.points_awarded). Never written
  -- by hand -- maintained by the recompute trigger added in a later migration.
  points_balance int not null default 0,

  renewal_date   date,
  joined_on      date not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index profiles_email_lower_idx on profiles (lower(email));
create index profiles_club_idx    on profiles(club_id);
create index profiles_role_idx    on profiles(role) where role <> 'member';
create index profiles_status_idx  on profiles(status);
create index profiles_renewal_idx on profiles(renewal_date) where status = 'active';

-- Membership state (active / expiring soon / expired) is DERIVED, never
-- stored: it depends on now(), so it cannot be a generated column. This is the
-- SQL mirror of the TypeScript helper, for admin queries and reports.
create or replace function membership_state(p_renewal date, p_expiring_soon_days int default 30)
returns text
language sql
immutable
as $$
  select case
    when p_renewal is null                                     then 'none'
    when p_renewal < current_date                              then 'expired'
    when p_renewal <= current_date + p_expiring_soon_days      then 'expiring_soon'
    else 'active'
  end;
$$;

-- ---------------------------------------------------------------------------
-- invites
-- ---------------------------------------------------------------------------
-- The invite is the SOURCE OF TRUTH for role and club assignment.
--
-- SECURITY: this table exists specifically so that handle_new_user() never has
-- to read role/club from auth.users.raw_user_meta_data. That column is
-- whatever the client passed to signUp({data}) and stays writable afterwards
-- via auth.updateUser({data}) -- deriving a role from it would let any member
-- promote themselves to super_admin with one client-side call.
create table invites (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null,
  club_id             uuid references clubs(id) on delete cascade,
  company_id          uuid references companies(id) on delete cascade,
  role                text not null default 'member'
                        check (role in ('member','secretary','super_admin')),
  status              text not null default 'pending'
                        check (status in ('pending','accepted','revoked','expired')),
  invited_by          uuid references profiles(id) on delete set null,
  expires_at          timestamptz not null default (now() + interval '30 days'),
  accepted_at         timestamptz,
  accepted_profile_id uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);

-- At most one live invite per email address at a time.
create unique index invites_pending_email_idx
  on invites (lower(email)) where status = 'pending';
create index invites_company_idx on invites(company_id);

-- ---------------------------------------------------------------------------
-- club_join_requests
-- ---------------------------------------------------------------------------
-- Public-club applications only. The request_club_join() RPC rejects any club
-- whose kind <> 'public', which is what stops a stranger self-joining a
-- company club.
create table club_join_requests (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references profiles(id) on delete cascade,
  club_id    uuid not null references clubs(id) on delete cascade,
  status     text not null default 'pending'
               check (status in ('pending','approved','rejected')),
  message    text,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index club_join_requests_one_open_idx
  on club_join_requests(member_id) where status = 'pending';
create index club_join_requests_status_idx on club_join_requests(status, created_at);

-- ---------------------------------------------------------------------------
-- app_settings
-- ---------------------------------------------------------------------------
-- Single-row settings table (id is pinned to 1 by a check constraint). The
-- membership fee, term and book discount must be admin-editable rather than
-- hardcoded, and every renewal/order snapshots the value it used.
create table app_settings (
  id                     smallint primary key default 1 check (id = 1),
  membership_fee_lkr     numeric(12,2) not null default 3000.00,
  membership_term_months int           not null default 12 check (membership_term_months > 0),
  renewal_grace_days     int           not null default 0,
  expiring_soon_days     int           not null default 30,
  -- Portal member discount on legacy book prices. Deliberately independent of
  -- the legacy PHP site's own 10% -- never derive one from the other.
  book_discount_percent  numeric(5,2)  not null default 25.00
                           check (book_discount_percent between 0 and 100),
  currency               text not null default 'LKR',
  updated_by             uuid references profiles(id) on delete set null,
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- admin_audit_log
-- ---------------------------------------------------------------------------
-- Append-only. Every privileged RPC and every service-role call site writes
-- here.
create table admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null,          -- 'invite.create', 'activity.update', ...
  entity_type text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  ip          inet,
  created_at  timestamptz not null default now()
);

create index admin_audit_log_created_idx on admin_audit_log(created_at desc);
create index admin_audit_log_entity_idx  on admin_audit_log(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on profiles
  for each row execute function touch_updated_at();
