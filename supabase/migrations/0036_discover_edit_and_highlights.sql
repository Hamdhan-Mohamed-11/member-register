-- ============================================================================
-- 0036 -- editing Discover posts; what the home pages show
-- ============================================================================
-- 1. Discover posts can be edited after posting: caption, the session they
--    came from, and whether they appear on the PUBLIC homepage.
--
--    show_on_home is off by default and set per post, on purpose. Discover is
--    footage of members at their own events, kept in a private bucket and
--    shown only to signed-in members (0029). The signed-out landing page
--    wanting a few event highlights is not a reason to open all of it to the
--    internet, so an admin picks which posts go public -- the same decision
--    they would make before putting a photo on the club's Instagram.
--
-- 2. public_discover_highlights(): the posts marked for the homepage. The
--    only Discover read open to anon, and it returns nothing else.
--
-- 3. popular_books(): the catalogue books the most members have ordered,
--    borrowed or wishlisted. Counts of distinct members per book, never who.
--
-- 4. public_stats(): the landing page's headline numbers.
-- ============================================================================

alter table public.discover_posts
  add column if not exists show_on_home boolean not null default false;

create index if not exists discover_posts_home_idx
  on public.discover_posts (created_at desc) where show_on_home;

-- 1 --------------------------------------------------------------------------
create or replace function public.update_discover_post(
  p_id           uuid,
  p_caption      text,
  p_session_id   uuid,
  p_show_on_home boolean
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
begin
  select club_id into v_club from discover_posts where id = p_id;
  if not found then
    raise exception 'post not found';
  end if;

  perform public.require_club_admin(v_club);

  if p_session_id is not null and not exists (
    select 1 from sessions s where s.id = p_session_id and s.host_club_id = v_club
  ) then
    raise exception 'that session belongs to another club';
  end if;

  update discover_posts
     set caption      = nullif(btrim(coalesce(p_caption, '')), ''),
         session_id   = p_session_id,
         show_on_home = coalesce(p_show_on_home, false)
   where id = p_id;

  perform public.write_audit('discover.update', 'discover_post', p_id::text, null,
    jsonb_build_object('show_on_home', p_show_on_home));
end;
$$;

revoke execute on function public.update_discover_post(uuid, text, uuid, boolean) from public;
grant execute on function public.update_discover_post(uuid, text, uuid, boolean) to authenticated;

-- 2 --------------------------------------------------------------------------
create or replace function public.public_discover_highlights(p_limit int default 6)
returns table (
  id         uuid,
  kind       text,
  caption    text,
  club_name  text,
  width      int,
  height     int,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.kind, p.caption, c.name, p.width, p.height, p.created_at
  from discover_posts p
  left join clubs c on c.id = p.club_id
  where p.show_on_home
  order by p.created_at desc
  limit greatest(1, least(12, p_limit));
$$;

revoke execute on function public.public_discover_highlights(int) from public;
grant execute on function public.public_discover_highlights(int) to anon, authenticated;

-- 3 --------------------------------------------------------------------------
create or replace function public.popular_books(p_limit int default 8)
returns table (book_id bigint, title text, author text, members bigint)
language sql stable security definer set search_path = public as $$
  with activity as (
    select o.member_id, i.book_id::bigint as book_id, i.title, i.author
    from book_order_items i
    join book_orders o on o.id = i.order_id
    where o.status not in ('cancelled', 'declined')
    union all
    select member_id, book_id::bigint, title, author from borrow_requests
    where status not in ('cancelled', 'rejected')
    union all
    select member_id, book_id::bigint, title, author from book_wishlist
  )
  select book_id,
         max(title)  as title,
         max(author) as author,
         count(distinct member_id) as members
  from activity
  where book_id is not null
  group by book_id
  order by members desc, max(title)
  limit greatest(1, least(24, p_limit));
$$;

revoke execute on function public.popular_books(int) from public;
grant execute on function public.popular_books(int) to anon, authenticated;

-- 4 --------------------------------------------------------------------------
create or replace function public.public_stats()
returns table (members bigint, clubs bigint, sessions_held bigint, books_funded int)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from profiles where status = 'active'),
    (select count(*) from clubs where is_active),
    (select count(*) from sessions where status <> 'cancelled' and held_at < now()),
    floor(
      coalesce((select sum(readrise_lkr) from book_orders where status in ('paid','fulfilled')), 0)
      / nullif((select readrise_book_cost_lkr from app_settings where id = 1), 0)
    )::int;
$$;

revoke execute on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
