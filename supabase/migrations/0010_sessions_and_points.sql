-- Sessions, attendance and points.
--
-- A session BELONGS TO a host club. Pricing follows from that:
--
--   free  -- nobody pays, any member may attend
--   paid  -- the host club's own members attend free; members of OTHER clubs
--            pay a guest fee, booked in advance
--
-- Sessions are still DISCOVERABLE by every member regardless of club, because
-- a guest cannot decide to pay for something they cannot see.

-- ---------------------------------------------------------------------------
-- points_rules
-- ---------------------------------------------------------------------------
-- Points live in a table, not in code, so re-tuning them is a row update.
--
-- The four codes are INDEPENDENT choices the Secretary makes, not something
-- derived from the session. "Presented at another club" is a button, not an
-- inference -- deriving it would mean trusting the host_club_id of a session
-- that may have been recorded after the fact.
create table points_rules (
  code       text primary key
               check (code in ('attend','present','present_other_club','guest_session')),
  label      text not null,
  points     int  not null check (points >= 0),
  is_active  boolean not null default true,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into points_rules (code, label, points) values
  ('attend',             'Attended a session',        10),
  ('present',            'Presented a book',          20),
  ('present_other_club', 'Presented at another club', 10),
  ('guest_session',      'Guest session',             10)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
create table sessions (
  id                  uuid primary key default gen_random_uuid(),
  host_club_id        uuid not null references clubs(id) on delete restrict,

  title               text not null,
  book_title          text not null default '',
  book_author         text not null default '',
  held_at             timestamptz not null,
  location            text,
  notes               text,

  presenter_member_id uuid references profiles(id) on delete set null,

  pricing_kind        text not null default 'free'
                        check (pricing_kind in ('free','paid')),
  -- Charged to members who are NOT in the host club. Host-club members always
  -- attend their own club's sessions free, whatever this says.
  guest_fee_lkr       numeric(12,2)
                        check (guest_fee_lkr is null or guest_fee_lkr >= 0),

  capacity            int check (capacity is null or capacity > 0),

  status              text not null default 'scheduled'
                        check (status in ('scheduled','completed','cancelled')),

  video_url           text,

  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- A paid session without a fee is a configuration mistake that would let
  -- guests book for nothing; a free session with a fee is a contradiction.
  constraint sessions_paid_needs_fee_ck
    check ((pricing_kind = 'paid') = (guest_fee_lkr is not null and guest_fee_lkr > 0))
);

create index sessions_held_at_idx  on sessions(held_at desc);
create index sessions_club_idx     on sessions(host_club_id, held_at desc);
create index sessions_status_idx   on sessions(status, held_at desc);

create trigger sessions_touch_updated_at
  before update on sessions
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- session_bookings
-- ---------------------------------------------------------------------------
-- Only guests need a booking. Host-club members just turn up and get marked
-- present, which is why there is no booking requirement on the attendance path.
create table session_bookings (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  member_id   uuid not null references profiles(id) on delete cascade,

  status      text not null default 'pending_payment'
                check (status in ('pending_payment','confirmed','cancelled','refunded')),
  -- Snapshot: the session's fee may be edited later, but what this person owed
  -- is fixed at the moment they booked.
  fee_lkr     numeric(12,2) not null default 0 check (fee_lkr >= 0),

  booked_at   timestamptz not null default now(),
  confirmed_at timestamptz,

  unique (session_id, member_id)
);

create index session_bookings_session_idx on session_bookings(session_id, status);
create index session_bookings_member_idx  on session_bookings(member_id, booked_at desc);

-- ---------------------------------------------------------------------------
-- member_activities
-- ---------------------------------------------------------------------------
-- Points STACK by being separate rows: attending (10) a session you also
-- presented at (20) is two rows and thirty points.
create table member_activities (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  member_id      uuid not null references profiles(id) on delete cascade,
  activity_code  text not null references points_rules(code),

  -- SNAPSHOT of points_rules.points when recorded. Re-tuning a rule must not
  -- silently rewrite five years of history; re-applying a new value to past
  -- rows is an explicit admin action, not a side effect.
  points_awarded int not null check (points_awarded >= 0),

  recorded_by    uuid references profiles(id) on delete set null,
  recorded_at    timestamptz not null default now(),
  updated_by     uuid references profiles(id) on delete set null,
  updated_at     timestamptz not null default now(),

  unique (session_id, member_id, activity_code)
);

create index member_activities_member_idx  on member_activities(member_id);
create index member_activities_session_idx on member_activities(session_id);

-- ---------------------------------------------------------------------------
-- Points balance: FULL RECOMPUTE under a row lock
-- ---------------------------------------------------------------------------
-- Deliberately NOT a delta trigger (balance = balance + new - old).
--
-- Deltas are wrong the moment anything is edited out of order, and once a
-- balance has drifted a delta can never bring it back -- every future update
-- carries the error forward. A full recompute is idempotent: it is correct
-- even if it has been wrong before. At ~300 members and a few dozen
-- activities each, the aggregate is microseconds.
--
-- If you are here to "optimise" this into a delta: don't.
create or replace function public.recompute_member_points(p_member_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_total int;
begin
  -- Take the profile row lock BEFORE the aggregate. This ordering is the
  -- entire correctness argument.
  --
  -- Without it, two transactions can each take a READ COMMITTED snapshot that
  -- misses the other's uncommitted activity row, both compute the same sum,
  -- and the second UPDATE silently discards the first insert's points -- the
  -- classic lost update.
  --
  -- With it, the second transaction blocks on the lock until the first
  -- commits. In READ COMMITTED each statement inside plpgsql takes a FRESH
  -- snapshot, so the aggregate below -- which only runs once the lock is
  -- granted -- sees the now-committed row. Recomputes for one member
  -- serialise; recomputes for different members never contend.
  perform 1 from profiles where id = p_member_id for update;

  select coalesce(sum(points_awarded), 0) into v_total
  from member_activities
  where member_id = p_member_id;

  update profiles
  set points_balance = v_total
  where id = p_member_id;

  return v_total;
end;
$$;

create or replace function public.trg_recompute_member_points()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_member_points(old.member_id);
    return old;
  end if;

  -- Re-assigning an activity to a different member has to fix BOTH balances.
  if tg_op = 'UPDATE' and new.member_id is distinct from old.member_id then
    perform public.recompute_member_points(old.member_id);
  end if;

  perform public.recompute_member_points(new.member_id);
  return new;
end;
$$;

create trigger member_activities_recompute
  after insert or update or delete on member_activities
  for each row execute function public.trg_recompute_member_points();

-- Repair, for when a balance has drifted anyway.
create or replace function public.recompute_all_points()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  v_row   record;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  for v_row in select id from profiles order by id loop
    perform public.recompute_member_points(v_row.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.recompute_member_points(uuid) from public;
revoke execute on function public.recompute_all_points() from public;
grant execute on function public.recompute_all_points() to authenticated;
