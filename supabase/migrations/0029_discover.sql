-- ---------------------------------------------------------------------------
-- 0029 — Discover
-- ---------------------------------------------------------------------------
--
-- Photos and video the club takes at its own events, so members can see what
-- happened at sessions they missed. Admins post; members like, save and share.
--
-- No comments, deliberately: the club asked for none, and a comment thread is
-- not a small feature -- it needs moderation, reporting, notification, and
-- somewhere for an argument to happen. Liking and saving need none of that.
--
-- Files live in Supabase Storage, which on this deployment IS the VPS -- the
-- whole stack is self-hosted there, so "store it on the VPS" and "put it in a
-- bucket" are the same instruction here, with policies and signed URLs for
-- free rather than a directory served by nginx.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Who may see a club's content
-- ---------------------------------------------------------------------------
-- The member-to-CLUB counterpart of shares_active_club, which is
-- member-to-member. Same rule underneath: your own club always, and every club
-- under the same type when that type is set to type-wide visibility. So a
-- photo from an Aureate evening reaches the other public clubs, and a company
-- club's does not leave the company.
--
-- A null club means the post is from Pick a Book itself rather than one club,
-- and every active member sees it.
create or replace function public.can_see_club(p_club_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    p_club_id is null
    or public.is_super_admin()
    or exists (
      select 1
      from club_memberships mine
      join clubs mc on mc.id = mine.club_id
      left join club_types mt on mt.id = mc.type_id
      where mine.member_id = (select auth.uid())
        and mine.status = 'active'
        and (
          mine.club_id = p_club_id
          or (
            mt.member_visibility = 'type'
            and mt.is_active
            and exists (
              select 1 from clubs tc
              where tc.id = p_club_id and tc.type_id = mc.type_id
            )
          )
        )
    );
$$;

revoke execute on function public.can_see_club(uuid) from public;
grant execute on function public.can_see_club(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------
create table if not exists discover_posts (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid references clubs(id) on delete cascade,
  session_id   uuid references sessions(id) on delete set null,
  author_id    uuid references profiles(id) on delete set null,
  kind         text not null check (kind in ('photo','video')),
  storage_path text not null,
  -- A still for videos: a feed of black rectangles waiting to buffer is not a
  -- feed. Optional, because a poster is a nicety and a missing one should not
  -- stop a post going up.
  poster_path  text,
  caption      text,
  -- Set by the uploader from the file's own metadata, so the feed can size the
  -- box before the media loads and not jump as each one arrives.
  width        int,
  height       int,
  duration_s   int,
  created_at   timestamptz not null default now()
);

create index if not exists discover_posts_feed_idx
  on discover_posts (created_at desc);
create index if not exists discover_posts_club_idx
  on discover_posts (club_id, created_at desc);

create table if not exists discover_likes (
  post_id   uuid not null references discover_posts(id) on delete cascade,
  member_id uuid not null references profiles(id) on delete cascade,
  liked_at  timestamptz not null default now(),
  primary key (post_id, member_id)
);

create table if not exists discover_saves (
  post_id   uuid not null references discover_posts(id) on delete cascade,
  member_id uuid not null references profiles(id) on delete cascade,
  saved_at  timestamptz not null default now(),
  primary key (post_id, member_id)
);

create index if not exists discover_saves_member_idx
  on discover_saves (member_id, saved_at desc);

alter table discover_posts enable row level security;
alter table discover_likes enable row level security;
alter table discover_saves enable row level security;
revoke all on discover_posts, discover_likes, discover_saves from anon, authenticated;
grant select on discover_posts to authenticated;
grant select, insert, delete on discover_likes, discover_saves to authenticated;

drop policy if exists discover_posts_select on discover_posts;
create policy discover_posts_select on discover_posts
for select to authenticated
using ((select public.current_member_is_active()) and public.can_see_club(club_id));

-- Likes are readable for anything the caller can see, because the count is
-- part of the post. Writable only as yourself.
drop policy if exists discover_likes_select on discover_likes;
create policy discover_likes_select on discover_likes
for select to authenticated
using (exists (select 1 from discover_posts p where p.id = post_id));

drop policy if exists discover_likes_write on discover_likes;
create policy discover_likes_write on discover_likes
for insert to authenticated
with check (
  member_id = (select auth.uid())
  and exists (select 1 from discover_posts p where p.id = post_id)
);

drop policy if exists discover_likes_delete on discover_likes;
create policy discover_likes_delete on discover_likes
for delete to authenticated
using (member_id = (select auth.uid()));

-- Saves are nobody's business but the saver's, so unlike likes they are not
-- readable across members and there is no count anywhere.
drop policy if exists discover_saves_own on discover_saves;
create policy discover_saves_own on discover_saves
for all to authenticated
using (member_id = (select auth.uid()))
with check (
  member_id = (select auth.uid())
  and exists (select 1 from discover_posts p where p.id = post_id)
);

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------
-- PRIVATE, unlike flyers. A flyer exists to be forwarded to strangers; this is
-- footage of members at their own events, and it should not be readable by
-- anyone holding a URL. Reads go through /api/discover/[id]/media, which
-- checks visibility and then signs.
--
-- 200MB, which is a few minutes of phone video. The ceiling is the VPS disk,
-- so it is worth watching rather than raising casually.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('discover', 'discover', false, 209715200,
        array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update
  set public = false,
      file_size_limit = 209715200,
      allowed_mime_types = excluded.allowed_mime_types;

-- Only club staff may upload, and only under a club they administer. The first
-- path segment is the club id.
drop policy if exists discover_insert_staff on storage.objects;
create policy discover_insert_staff on storage.objects
for insert to authenticated
with check (
  bucket_id = 'discover'
  and public.can_admin_club(((storage.foldername(name))[1])::uuid)
);

drop policy if exists discover_delete_staff on storage.objects;
create policy discover_delete_staff on storage.objects
for delete to authenticated
using (
  bucket_id = 'discover'
  and public.can_admin_club(((storage.foldername(name))[1])::uuid)
);

-- No SELECT policy. Nothing reads this bucket with a member's own token: the
-- media route signs with the service role AFTER checking visibility.

-- ---------------------------------------------------------------------------
-- Posting
-- ---------------------------------------------------------------------------
create or replace function public.create_discover_post(
  p_club_id      uuid,
  p_kind         text,
  p_storage_path text,
  p_caption      text default null,
  p_poster_path  text default null,
  p_session_id   uuid default null,
  p_width        int default null,
  p_height       int default null,
  p_duration_s   int default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform public.require_club_admin(p_club_id);

  if p_kind not in ('photo','video') then
    raise exception 'invalid kind';
  end if;

  -- The path is re-checked rather than trusted, as everywhere else a client
  -- hands us a storage key: without this an admin of one club could attach a
  -- file sitting under another club's folder.
  if p_storage_path not like p_club_id::text || '/%' then
    raise exception 'that file does not belong to this club';
  end if;

  if p_session_id is not null and not exists (
    select 1 from sessions s where s.id = p_session_id and s.host_club_id = p_club_id
  ) then
    raise exception 'that session belongs to another club';
  end if;

  insert into discover_posts
    (club_id, session_id, author_id, kind, storage_path, poster_path, caption,
     width, height, duration_s)
  values
    (p_club_id, p_session_id, auth.uid(), p_kind, p_storage_path, p_poster_path,
     nullif(btrim(p_caption), ''), p_width, p_height, p_duration_s)
  returning id into v_id;

  perform public.write_audit('discover.create', 'discover_post', v_id::text, null,
    jsonb_build_object('club', p_club_id, 'kind', p_kind));

  return v_id;
end;
$$;

create or replace function public.delete_discover_post(p_id uuid)
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

  delete from discover_posts where id = p_id;

  perform public.write_audit('discover.delete', 'discover_post', p_id::text, null, null);
end;
$$;

revoke execute on function
  public.create_discover_post(uuid, text, text, text, text, uuid, int, int, int),
  public.delete_discover_post(uuid)
from public;

grant execute on function
  public.create_discover_post(uuid, text, text, text, text, uuid, int, int, int),
  public.delete_discover_post(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- The feed
-- ---------------------------------------------------------------------------
-- Like counts and the caller's own like/save state come back with the posts.
-- Three separate queries would mean the app stitching them together and a like
-- count that can disagree with the row it sits on.
create or replace function public.discover_feed(
  p_limit  int default 24,
  p_before timestamptz default null,
  p_saved  boolean default false
)
returns table (
  id           uuid,
  club_id      uuid,
  club_name    text,
  session_id   uuid,
  kind         text,
  caption      text,
  width        int,
  height       int,
  duration_s   int,
  created_at   timestamptz,
  author_name  text,
  like_count   bigint,
  liked_by_me  boolean,
  saved_by_me  boolean
)
language sql stable security definer set search_path = public as $$
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
  where public.can_see_club(p.club_id)
    and (select public.current_member_is_active())
    and (p_before is null or p.created_at < p_before)
    and (
      not p_saved
      or exists (select 1 from discover_saves s
                 where s.post_id = p.id and s.member_id = (select auth.uid()))
    )
  order by p.created_at desc
  limit greatest(1, least(60, p_limit));
$$;

revoke execute on function public.discover_feed(int, timestamptz, boolean) from public;
grant execute on function public.discover_feed(int, timestamptz, boolean) to authenticated;
