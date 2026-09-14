-- ---------------------------------------------------------------------------
-- 0031 — Read and Rise, split three ways
-- ---------------------------------------------------------------------------
-- The card showed one number: what the whole club movement has given. That is
-- the least motivating of the three available, because nothing in it is the
-- member's own doing.
--
-- So the same bar now carries three nested figures — everyone, then the
-- member's own club, then the member. They NEST rather than add up: a member's
-- giving is part of their club's, which is part of the whole. The card relies
-- on that, drawing them as three segments of one bar rather than three bars.
--
-- "My club" is the primary club, falling back to any active membership. A
-- member in two clubs has to be counted somewhere, and the primary one is the
-- one the rest of the product already treats as theirs.
-- ---------------------------------------------------------------------------

drop function if exists public.readrise_totals();

create or replace function public.readrise_totals()
returns table (
  books_funded   int,
  donated_lkr    numeric,
  target_books   int,
  target_on      date,
  my_books       int,
  my_donated     numeric,
  club_id        uuid,
  club_name      text,
  club_books     int,
  club_donated   numeric
)
language sql stable security definer set search_path = public as $$
  with me as (
    select (select auth.uid()) as id
  ),
  my_club as (
    select cm.club_id
    from club_memberships cm, me
    where cm.member_id = me.id and cm.status = 'active'
    order by cm.is_primary desc, cm.joined_on
    limit 1
  ),
  settings as (
    select readrise_book_cost_lkr as cost, readrise_target_books as target,
           readrise_target_on as target_on
    from app_settings where id = 1
  ),
  everyone as (
    select coalesce(sum(o.readrise_lkr), 0) as total
    from book_orders o
    where o.status in ('paid','fulfilled')
  ),
  club as (
    select coalesce(sum(o.readrise_lkr), 0) as total
    from book_orders o
    join club_memberships cm
      on cm.member_id = o.member_id and cm.status = 'active'
    where o.status in ('paid','fulfilled')
      and cm.club_id = (select club_id from my_club)
  ),
  mine as (
    select coalesce(sum(o.readrise_lkr), 0) as total
    from book_orders o, me
    where o.status in ('paid','fulfilled') and o.member_id = me.id
  )
  select
    floor(everyone.total / nullif(settings.cost, 0))::int,
    everyone.total,
    settings.target,
    settings.target_on,
    floor(mine.total / nullif(settings.cost, 0))::int,
    mine.total,
    (select club_id from my_club),
    (select c.name from clubs c where c.id = (select club_id from my_club)),
    floor(club.total / nullif(settings.cost, 0))::int,
    club.total
  from settings, everyone, club, mine;
$$;

revoke execute on function public.readrise_totals() from public;
grant execute on function public.readrise_totals() to authenticated;
