-- Leaderboards and badges.
--
-- Both answer the same question -- "how am I doing, next to whom?" -- so both
-- are scoped by the SAME rule that scopes the directory: public.shares_active_club.
-- A Corporate member ranks against colleagues only; a Public Clubs member ranks
-- across every public club. There is deliberately no second visibility model
-- here to drift out of step with the first.

-- ---------------------------------------------------------------------------
-- leaderboard
-- ---------------------------------------------------------------------------
-- Points come from member_activities, never from profiles.points_balance.
--
-- points_balance is a cached lifetime sum and has no time dimension at all, so
-- it cannot answer "this month". Reading the ledger for every period keeps the
-- three tabs internally consistent: the all-time column equals the cached
-- balance because recompute_member_points sums the same rows.
create or replace function public.leaderboard(p_period text default 'month')
returns table (
  place        bigint,
  member_id    uuid,
  first_name   text,
  last_name    text,
  avatar_path  text,
  club_name    text,
  points       bigint,
  is_me        boolean
)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select case p_period
             when 'month' then date_trunc('month', now())
             when 'year'  then date_trunc('year',  now())
             else '-infinity'::timestamptz
           end as since
  ),
  -- Everyone the caller is allowed to see, plus the caller. An inactive member
  -- is excluded: a leaderboard is a picture of who is here now.
  visible as (
    select p.id, p.first_name, p.last_name, p.avatar_path
    from profiles p
    where p.status = 'active'
      and (p.id = (select auth.uid()) or public.shares_active_club(p.id))
  ),
  scored as (
    select v.id,
           v.first_name,
           v.last_name,
           v.avatar_path,
           coalesce(sum(a.points_awarded), 0)::bigint as points
    from visible v
    left join member_activities a
      on a.member_id = v.id
     and a.recorded_at >= (select since from bounds)
    group by v.id, v.first_name, v.last_name, v.avatar_path
  )
  select
    -- rank(), not row_number(): equal scores share a position. Two members on
    -- 40 points are both 3rd, and the next is 5th.
    rank() over (order by s.points desc)             as place,
    s.id                                             as member_id,
    s.first_name,
    s.last_name,
    s.avatar_path,
    -- Primary club only. A dual-club member is one row, not two.
    (select c.name
       from club_memberships cm
       join clubs c on c.id = cm.club_id
      where cm.member_id = s.id and cm.status = 'active'
      order by cm.is_primary desc, cm.joined_on
      limit 1)                                       as club_name,
    s.points,
    s.id = (select auth.uid())                       as is_me
  from scored s
  order by s.points desc, s.first_name, s.last_name;
$$;

-- ---------------------------------------------------------------------------
-- badges
-- ---------------------------------------------------------------------------
create table badges (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text not null,

  -- Icon KEY, not markup or a URL. The app maps it to an inline SVG, so a
  -- badge can never inject anything into a page.
  icon        text not null default 'star',

  -- Badges in a family are the same achievement at rising thresholds, and the
  -- app shows only the highest one earned plus progress toward the next. Without
  -- this, a member with 100 books read displays four near-identical book badges.
  family      text,
  threshold   int,

  tier        int not null default 1 check (tier between 1 and 4),
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table member_badges (
  id        uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles(id) on delete cascade,
  badge_id  uuid not null references badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (member_id, badge_id)
);

create index member_badges_member_idx on member_badges(member_id, earned_at desc);

insert into badges (code, name, description, icon, family, threshold, tier, sort_order) values
  ('books_5',        'Getting Started',    'Finished 5 books.',                         'book',    'books_read',    5,   1, 10),
  ('books_25',       'Well Read',          'Finished 25 books.',                        'book',    'books_read',    25,  2, 11),
  ('books_50',       'Bibliophile',        'Finished 50 books.',                        'book',    'books_read',    50,  3, 12),
  ('books_100',      'Century',            'Finished 100 books.',                       'book',    'books_read',    100, 4, 13),

  ('present_1',      'First Presentation', 'Presented a book to your club.',            'mic',     'presented',     1,   1, 20),
  ('present_5',      'Regular Voice',      'Presented five times.',                     'mic',     'presented',     5,   2, 21),
  ('present_10',     'Club Speaker',       'Presented ten times.',                      'mic',     'presented',     10,  3, 22),

  ('streak_3',       'Three in a Row',     'Attended a session three months running.',  'flame',   'attend_streak', 3,   1, 30),
  ('streak_6',       'Half a Year',        'Attended six months running.',              'flame',   'attend_streak', 6,   2, 31),
  ('streak_12',      'Never Missed',       'Attended twelve months running.',           'flame',   'attend_streak', 12,  3, 32),

  ('points_100',     'Hundred Club',       'Earned 100 points.',                        'star',    'points',        100, 1, 40),
  ('points_500',     'Five Hundred',       'Earned 500 points.',                        'star',    'points',        500, 2, 41),
  ('points_1000',    'Thousand',           'Earned 1,000 points.',                      'star',    'points',        1000,3, 42),

  ('first_video',    'On the Record',      'Had a video published to the club.',        'video',   null,            null,1, 50),
  ('first_booking',  'Guest Seat',         'Booked a session at another club.',         'ticket',  null,            null,1, 51),
  ('guest_bringer',  'Brought a Friend',   'Brought a guest to a session.',             'users',   null,            null,1, 52),
  ('profile_done',   'Fully Introduced',   'Added a photo and a bio.',                  'id',      null,            null,1, 53),
  ('club_founder',   'Founding Member',    'One of the first ten members of a club.',   'flag',    null,            null,2, 54),

  ('readrise_1',     'Read and Rise',      'Funded books for a school with a purchase.','heart',   'readrise',      1,   1, 60),
  ('readrise_10',    'Ten Books Given',    'Funded ten books through Read and Rise.',   'heart',   'readrise',      10,  2, 61)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- recompute_member_badges
-- ---------------------------------------------------------------------------
-- Idempotent by construction: it computes what a member HAS earned and inserts
-- whatever is missing. Nothing is ever revoked, and calling it twice awards
-- nothing twice, so it is safe to call from anywhere without tracking whether
-- it already ran.
--
-- Never raises. It hangs off attendance saves and payment settlement, and a
-- badge is a garnish -- it must not be able to roll back the thing that earned it.
create or replace function public.recompute_member_badges(p_member_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_books   int := 0;
  v_present int := 0;
  v_streak  int := 0;
  v_points  int := 0;
  v_readrise int := 0;
  v_new     int := 0;
  v_earned  boolean;
  v_badge   record;
begin
  if p_member_id is null then
    return 0;
  end if;

  select count(*) into v_books
  from reading_items where member_id = p_member_id and status = 'read';

  select count(*) into v_present
  from member_activities
  where member_id = p_member_id and activity_code in ('present','present_other_club');

  select coalesce(points_balance, 0) into v_points from profiles where id = p_member_id;

  -- Longest run of CONSECUTIVE months containing an attendance.
  --
  -- Classic gaps-and-islands: subtracting the row number (in months) from each
  -- month collapses every consecutive run to a single constant, so grouping on
  -- that constant and counting gives the run lengths. Anything simpler counts
  -- distinct months and calls a member who showed up in January and December a
  -- two-month streak.
  select coalesce(max(run), 0) into v_streak
  from (
    select count(*) as run
    from (
      select m, (m - (row_number() over (order by m) * interval '1 month'))::date as island
      from (
        select distinct date_trunc('month', recorded_at)::date as m
        from member_activities
        where member_id = p_member_id and activity_code = 'attend'
      ) months
    ) islands
    group by island
  ) runs;

  -- Read and Rise: books funded by settled book orders. The orders table
  -- arrives with the bookshop, so until then this is legitimately zero and the
  -- two readrise badges simply never award.
  if to_regclass('public.book_orders') is not null then
    execute $q$
      select coalesce(sum(quantity), 0)
      from book_orders o
      join payments p on p.order_id = o.id
      where o.member_id = $1 and p.status in ('success','manual')
    $q$ into v_readrise using p_member_id;
  end if;

  for v_badge in select * from badges where is_active loop
    -- Assigned to a variable rather than written inline as `if case ... then`.
    -- plpgsql ends an IF condition at the first THEN it sees, and inside a CASE
    -- expression that is the first WHEN branch -- the condition gets cut in half
    -- and the whole function fails to parse with "syntax error at end of input".
    v_earned := case v_badge.family
         when 'books_read'    then v_books   >= v_badge.threshold
         when 'presented'     then v_present >= v_badge.threshold
         when 'attend_streak' then v_streak  >= v_badge.threshold
         when 'points'        then v_points  >= v_badge.threshold
         when 'readrise'      then v_readrise >= v_badge.threshold
         else case v_badge.code
                when 'first_video' then exists (
                  select 1 from videos
                  where submitted_by = p_member_id and status = 'approved')
                when 'first_booking' then exists (
                  select 1 from session_bookings
                  where member_id = p_member_id and status = 'confirmed')
                when 'guest_bringer' then exists (
                  select 1 from member_activities
                  where member_id = p_member_id and activity_code = 'guest_session')
                when 'profile_done' then exists (
                  select 1 from profiles
                  where id = p_member_id
                    and avatar_path is not null
                    and coalesce(btrim(bio), '') <> '')
                when 'club_founder' then exists (
                  select 1
                  from club_memberships cm
                  where cm.member_id = p_member_id
                    and cm.status = 'active'
                    and (
                      select count(*)
                      from club_memberships earlier
                      where earlier.club_id = cm.club_id
                        and (earlier.joined_on, earlier.id) < (cm.joined_on, cm.id)
                    ) < 10)
                else false
              end
       end;

    if v_earned then
      insert into member_badges (member_id, badge_id)
      values (p_member_id, v_badge.id)
      on conflict (member_id, badge_id) do nothing;

      if found then
        v_new := v_new + 1;
        perform public.notify_member(
          p_member_id,
          'badge.earned',
          format('You earned "%s"', v_badge.name),
          v_badge.description,
          '/me/badges',
          'badge:' || v_badge.code
        );
      end if;
    end if;
  end loop;

  return v_new;
exception when others then
  -- A badge must never fail the transaction that earned it.
  return 0;
end;
$$;

-- notifications.kind is a closed check constraint, so the new kind has to be
-- added to it before notify_member above can write one.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'video.approved','video.rejected','join.approved','join.rejected',
    'payment.received','points.awarded','membership.added','membership.changed',
    'role.changed','account.status','badge.earned'
  ));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table badges enable row level security;
alter table member_badges enable row level security;
revoke all on badges, member_badges from anon, authenticated;
grant select on badges to authenticated;
grant select on member_badges to authenticated;

-- The catalogue of badges is not secret; seeing what can be earned is the
-- point of having them.
create policy badges_select on badges
for select to authenticated using (is_active);

-- Who earned what follows the directory rule: your own always, other people's
-- only if you can see them at all.
create policy member_badges_select on member_badges
for select to authenticated
using (
  member_id = (select auth.uid())
  or public.shares_active_club(member_id)
  or (select public.is_admin())
);

-- No INSERT policy anywhere. Badges are written only by
-- recompute_member_badges(), which runs as owner. A member who could insert
-- their own rows could award themselves anything.

revoke execute on function
  public.leaderboard(text),
  public.recompute_member_badges(uuid)
from public;

grant execute on function public.leaderboard(text) to authenticated;

-- recompute_member_badges is NOT granted to authenticated. Every caller is a
-- security-definer function that already runs as owner; nothing needs it from
-- the client, and a client that could call it for an arbitrary member id would
-- be able to probe other people's progress through the notifications it writes.
