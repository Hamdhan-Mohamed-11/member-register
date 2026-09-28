-- Two things members see: who a Discover post is for, and a new club arriving.

-- --- 1. who a Discover post is for ----------------------------------------
--
-- No rows for a post means everyone, which is what every existing post is and
-- what the uploader still does by default. Rows narrow it to those clubs.
-- A join table rather than a column because a post can be meant for two clubs
-- and neither of them the club it was filmed at.

create table if not exists discover_post_clubs (
  post_id uuid not null references discover_posts(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  primary key (post_id, club_id)
);

create index if not exists discover_post_clubs_club_idx on discover_post_clubs (club_id);

alter table discover_post_clubs enable row level security;

-- Readable by any active member: knowing a post is aimed at a club is not a
-- secret, and the page needs it to say so. Writes go through the RPC.
drop policy if exists discover_post_clubs_select on discover_post_clubs;
create policy discover_post_clubs_select on discover_post_clubs for select to authenticated
  using ((select current_member_is_active()) or (select is_super_admin()));

/**
 * May the signed-in member see this post?
 *
 * Kept as a function so the feed, the media route and any policy all ask the
 * same question. An untargeted post is for everyone; a targeted one is for
 * the clubs named, plus whoever posted it and a super admin -- otherwise the
 * person who made it could not check their own work.
 */
create or replace function public.can_see_discover_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    not exists (select 1 from discover_post_clubs t where t.post_id = p_post_id)
    or is_super_admin()
    or exists (
      select 1 from discover_posts p
      where p.id = p_post_id and p.author_id = auth.uid()
    )
    or exists (
      select 1
      from discover_post_clubs t
      join club_memberships m on m.club_id = t.club_id
      where t.post_id = p_post_id
        and m.member_id = auth.uid()
        and m.status = 'active'
    );
$$;

-- The feed honours it.
create or replace function public.discover_feed(
  p_limit  integer default 24,
  p_before timestamptz default null,
  p_saved  boolean default false
)
returns table (
  id uuid, club_id uuid, club_name text, session_id uuid, kind text, caption text,
  width integer, height integer, duration_s integer, created_at timestamptz,
  author_name text, like_count bigint, liked_by_me boolean, saved_by_me boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    p.id, p.club_id, c.name, p.session_id, p.kind, p.caption,
    p.width, p.height, p.duration_s, p.created_at,
    nullif(btrim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')), ''),
    (select count(*) from discover_likes l where l.post_id = p.id),
    exists (select 1 from discover_likes l
            where l.post_id = p.id and l.member_id = (select auth.uid())),
    exists (select 1 from discover_saves s
            where s.post_id = p.id and s.member_id = (select auth.uid()))
  from discover_posts p
  left join clubs c on c.id = p.club_id
  left join profiles a on a.id = p.author_id
  where (select public.current_member_is_active())
    and public.can_see_discover_post(p.id)
    and (p_before is null or p.created_at < p_before)
    and (
      not p_saved
      or exists (select 1 from discover_saves s
                 where s.post_id = p.id and s.member_id = (select auth.uid()))
    )
  order by p.created_at desc
  limit greatest(1, least(60, p_limit));
$$;

/**
 * Sets the clubs a post is for. An empty or null list means everyone.
 *
 * Staff only, and re-checked here rather than trusted from the page: this
 * decides who sees a photograph of people in a room.
 */
create or replace function public.set_discover_post_clubs(
  p_post_id  uuid,
  p_club_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (is_admin() or is_super_admin()) then
    raise exception 'not authorised';
  end if;
  if not exists (select 1 from discover_posts where id = p_post_id) then
    raise exception 'post not found';
  end if;

  delete from discover_post_clubs where post_id = p_post_id;

  if p_club_ids is not null and array_length(p_club_ids, 1) > 0 then
    insert into discover_post_clubs (post_id, club_id)
    select p_post_id, unnest(p_club_ids)
    on conflict do nothing;
  end if;
end;
$$;

grant execute on function public.can_see_discover_post(uuid) to authenticated;
grant execute on function public.set_discover_post_clubs(uuid, uuid[]) to authenticated;

-- --- 2. a new club, announced ---------------------------------------------
--
-- Members are told when a club they can actually join appears. Private and
-- company clubs are not announced: an announcement for a club nobody can
-- apply to is an invitation that goes nowhere.

alter table clubs
  add column if not exists announced_at timestamptz;

comment on column clubs.announced_at is
  'When this club was announced to members. Null means it never was -- every club that existed before announcements.';

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (
  kind in (
    'video.approved','video.rejected','join.approved','join.rejected',
    'payment.received','points.awarded','membership.added','membership.changed',
    'role.changed','account.status','badge.earned','borrow.updated','borrow.rejected',
    'library.activated','order.placed','order.quoted','order.agreed','order.message',
    'order.paid',
    'creator.registered','creator.book_submitted','creator.decision',
    'club.requested','club.approved','club.rejected','club.new'
  )
);

/**
 * Announces a club to every active member.
 *
 * Idempotent through announced_at: called again for the same club it does
 * nothing, so an admin editing a club a second time does not notify the
 * whole membership a second time.
 *
 * Only clubs anyone can apply to. A club that is private today and opened
 * next week is announced then -- which is the moment it is true.
 */
create or replace function public.announce_club(p_club_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_club clubs%rowtype;
begin
  select * into v_club from clubs where id = p_club_id;
  if v_club is null then
    raise exception 'club not found';
  end if;
  if v_club.announced_at is not null then
    return false;
  end if;
  if not (v_club.is_active and v_club.is_open_join and v_club.kind = 'public') then
    return false;
  end if;

  update clubs set announced_at = now() where id = p_club_id;

  insert into notifications (member_id, kind, title, body, href, dedupe_key)
  select
    p.id,
    'club.new',
    'A new club: ' || v_club.name,
    coalesce(nullif(btrim(v_club.description), ''), 'Open for applications now.'),
    '/renew',
    'club.new:' || p_club_id::text
  from profiles p
  where p.status = 'active' and p.role in ('member', 'secretary')
  on conflict do nothing;

  return true;
end;
$$;

grant execute on function public.announce_club(uuid) to authenticated;

/**
 * The clubs worth putting on the feed as an announcement: opened recently,
 * and open to the member reading it -- somebody already in a club does not
 * need to be told they can apply to it.
 */
create or replace function public.new_clubs_for_me(p_days integer default 30)
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  announced_at timestamptz,
  membership_fee_lkr numeric,
  type_name text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id, c.name, c.slug, c.description, c.announced_at, c.membership_fee_lkr, t.name
  from clubs c
  left join club_types t on t.id = c.type_id
  where c.announced_at is not null
    and c.announced_at > now() - make_interval(days => greatest(1, least(365, p_days)))
    and c.is_active
    and c.is_open_join
    and c.kind = 'public'
    and not exists (
      select 1 from club_memberships m
      where m.club_id = c.id
        and m.member_id = auth.uid()
        and m.status in ('active', 'pending')
    )
  order by c.announced_at desc;
$$;

grant execute on function public.new_clubs_for_me(integer) to authenticated;
