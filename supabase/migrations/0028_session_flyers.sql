-- ---------------------------------------------------------------------------
-- 0028 — flyers for sessions
-- ---------------------------------------------------------------------------
--
-- A secretary picks a template, drops in a photo, and the browser draws the
-- flyer on a canvas. Nothing is rendered on the server: the image is built
-- from data the page already has, and shipping a headless browser or an image
-- library to produce a PNG the client could draw itself would be a lot of
-- machinery for one poster.
--
-- They can then download it, share it through the phone's own share sheet, or
-- save it to the session so members see it in the app -- any combination,
-- which is what the club asked for. Saving is the only one that touches this
-- migration; the other two never leave the browser.
-- ---------------------------------------------------------------------------

alter table sessions
  add column if not exists flyer_path text,
  add column if not exists flyer_template text,
  add column if not exists flyer_updated_at timestamptz;

comment on column sessions.flyer_path is
  'Object key in the public `flyers` bucket. Null means no flyer saved.';

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------
-- PUBLIC, unlike avatars, and that is a deliberate difference rather than an
-- oversight. The entire point of a flyer is to be posted into WhatsApp and
-- Instagram by people who are not members, so a link that only works for
-- signed-in members would defeat it.
--
-- What that costs: anyone holding the URL can see it. So the filename is a
-- random uuid rather than the session id -- a public bucket does not permit
-- listing, so an unguessable key is what keeps next month's session from being
-- readable by incrementing a number.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('flyers', 'flyers', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/png','image/jpeg','image/webp'];

-- Writes are restricted to club staff. `can_admin_club` needs a club, and the
-- first path segment is the session id, so the policy resolves the session to
-- its host club and asks the same question every session RPC asks.
drop policy if exists flyers_insert_staff on storage.objects;
create policy flyers_insert_staff on storage.objects
for insert to authenticated
with check (
  bucket_id = 'flyers'
  and exists (
    select 1 from public.sessions s
    where s.id::text = (storage.foldername(name))[1]
      and public.can_admin_club(s.host_club_id)
  )
);

drop policy if exists flyers_update_staff on storage.objects;
create policy flyers_update_staff on storage.objects
for update to authenticated
using (
  bucket_id = 'flyers'
  and exists (
    select 1 from public.sessions s
    where s.id::text = (storage.foldername(name))[1]
      and public.can_admin_club(s.host_club_id)
  )
);

drop policy if exists flyers_delete_staff on storage.objects;
create policy flyers_delete_staff on storage.objects
for delete to authenticated
using (
  bucket_id = 'flyers'
  and exists (
    select 1 from public.sessions s
    where s.id::text = (storage.foldername(name))[1]
      and public.can_admin_club(s.host_club_id)
  )
);

-- No SELECT policy: the bucket is public, so reads are served without one.

-- ---------------------------------------------------------------------------
-- set_session_flyer
-- ---------------------------------------------------------------------------
-- The path is re-checked here rather than trusted, exactly as setAvatarPath
-- re-derives an avatar key. A client posting another session's path would
-- otherwise repoint that session's flyer at an image of their choosing.
create or replace function public.set_session_flyer(
  p_session_id uuid,
  p_path       text,
  p_template   text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
  v_old  text;
begin
  select host_club_id, flyer_path into v_club, v_old
  from sessions where id = p_session_id;
  if v_club is null then
    raise exception 'session not found';
  end if;

  perform public.require_club_admin(v_club);

  -- Clearing is allowed; anything else must live under this session's folder.
  if p_path is not null and p_path not like p_session_id::text || '/%' then
    raise exception 'that file does not belong to this session';
  end if;

  update sessions
  set flyer_path = p_path,
      flyer_template = case when p_path is null then null else p_template end,
      flyer_updated_at = case when p_path is null then null else now() end
  where id = p_session_id;

  perform public.write_audit('session.flyer', 'session', p_session_id::text,
    jsonb_build_object('flyer_path', v_old),
    jsonb_build_object('flyer_path', p_path));
end;
$$;

revoke execute on function public.set_session_flyer(uuid, text, text) from public;
grant execute on function public.set_session_flyer(uuid, text, text) to authenticated;
-- p_path gains a DEFAULT so "clear the flyer" can omit it.
--
-- A default is not part of a function's signature, so this replaces the
-- existing function rather than creating an overload -- unlike ADDING a
-- parameter, which does and has to be dropped first.
--
-- It matters beyond tidiness: the generated TypeScript marks a defaultless
-- parameter as a required non-nullable string, so clearing a flyer could not
-- be expressed through the typed client at all.
create or replace function public.set_session_flyer(
  p_session_id uuid,
  p_path       text default null,
  p_template   text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
  v_old  text;
begin
  select host_club_id, flyer_path into v_club, v_old
  from sessions where id = p_session_id;
  if v_club is null then
    raise exception 'session not found';
  end if;

  perform public.require_club_admin(v_club);

  if p_path is not null and p_path not like p_session_id::text || '/%' then
    raise exception 'that file does not belong to this session';
  end if;

  update sessions
  set flyer_path = p_path,
      flyer_template = case when p_path is null then null else p_template end,
      flyer_updated_at = case when p_path is null then null else now() end
  where id = p_session_id;

  perform public.write_audit('session.flyer', 'session', p_session_id::text,
    jsonb_build_object('flyer_path', v_old),
    jsonb_build_object('flyer_path', p_path));
end;
$$;
