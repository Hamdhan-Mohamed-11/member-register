-- ============================================================================
-- 0035 -- Discover is for every member; thumbnails; numbers for admins
-- ============================================================================
-- 1. Every active member sees every Discover post.
--    0029 scoped posts like the directory: your own club, plus the clubs under
--    the same type when that type is type-wide. So a post filed under a
--    company club (Acme) never left the company. The club asked for the
--    opposite -- Discover is Pick a Book's shop window of its events, and the
--    club a post is filed under says who it is from, not who may see it.
--    Likes and saves already follow the post, so they need no change.
--
-- 2. A video's thumbnail can be set or replaced after posting
--    (set_discover_poster). create_discover_post also now checks the poster
--    key sits under the post's club folder, as it always did for the media:
--    without it, an admin of one club could attach a file from another's.
--
-- 3. discover_post_stats(): like and save counts per post, for the posts the
--    caller administers. Saves stay private to each member -- who saved what is
--    still nobody's business -- but a count per post tells the club which
--    posts landed, which is what the admin page is for.
-- ============================================================================

-- 1 --------------------------------------------------------------------------
drop policy if exists discover_posts_select on discover_posts;
create policy discover_posts_select on discover_posts
for select to authenticated
using ((select public.current_member_is_active()));

-- Patched from the live body rather than restated, so nothing else in it can
-- drift back to an older version. Raises if the text is not where expected.
do $$
declare
  v_def text := pg_get_functiondef('public.discover_feed(int, timestamptz, boolean)'::regprocedure);
  v_old text := 'where public.can_see_club(p.club_id)
    and (select public.current_member_is_active())';
begin
  if strpos(v_def, v_old) = 0 then
    raise exception 'discover_feed: visibility clause not found; already patched?';
  end if;
  execute replace(v_def, v_old, 'where (select public.current_member_is_active())');
end;
$$;

-- 2 --------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef(
    'public.create_discover_post(uuid, text, text, text, text, uuid, int, int, int)'::regprocedure);
  v_anchor text := 'raise exception ''that file does not belong to this club'';
  end if;';
begin
  if strpos(v_def, v_anchor) = 0 then
    raise exception 'create_discover_post: storage path check not found';
  end if;
  execute replace(v_def, v_anchor, v_anchor || '

  if p_poster_path is not null and p_poster_path not like p_club_id::text || ''/%'' then
    raise exception ''that thumbnail does not belong to this club'';
  end if;');
end;
$$;

create or replace function public.set_discover_poster(p_id uuid, p_poster_path text)
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

  if p_poster_path is null or p_poster_path not like v_club::text || '/%' then
    raise exception 'that thumbnail does not belong to this club';
  end if;

  update discover_posts set poster_path = p_poster_path where id = p_id;

  perform public.write_audit('discover.poster', 'discover_post', p_id::text, null, null);
end;
$$;

revoke execute on function public.set_discover_poster(uuid, text) from public;
grant execute on function public.set_discover_poster(uuid, text) to authenticated;

-- 3 --------------------------------------------------------------------------
create or replace function public.discover_post_stats()
returns table (post_id uuid, like_count bigint, save_count bigint)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    (select count(*) from discover_likes l where l.post_id = p.id),
    (select count(*) from discover_saves s where s.post_id = p.id)
  from discover_posts p
  where public.is_super_admin() or public.can_admin_club(p.club_id);
$$;

revoke execute on function public.discover_post_stats() from public;
grant execute on function public.discover_post_stats() to authenticated;
