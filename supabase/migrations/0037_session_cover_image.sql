-- ============================================================================
-- 0037 -- a cover image on a session
-- ============================================================================
-- Session cards were a date block and three lines of text, and a list of them
-- reads as a spreadsheet. The person creating the session now uploads a
-- picture, which the card shows across its top.
--
-- The file goes in the existing `flyers` bucket, under the session's own id.
-- That bucket is already public, already limited to images under 5MB, and its
-- policies already resolve the first path segment to a session and ask
-- can_admin_club() -- so a cover needs no new bucket and no new storage
-- policy. Public is right for both: a flyer and a session picture are made to
-- be forwarded to people who have no account.
-- ============================================================================

alter table public.sessions
  add column if not exists image_path text;

comment on column public.sessions.image_path is
  'Cover image for the session card, in the public flyers bucket.';

create or replace function public.set_session_image(
  p_session_id uuid,
  p_path       text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
  v_old  text;
begin
  select host_club_id, image_path into v_club, v_old
  from sessions where id = p_session_id;
  if v_club is null then
    raise exception 'session not found';
  end if;

  perform public.require_club_admin(v_club);

  -- Re-checked rather than trusted, as everywhere else a client hands us a
  -- storage key: without this, an admin of one club could attach a file
  -- sitting under another club's session.
  if p_path is not null and p_path not like p_session_id::text || '/%' then
    raise exception 'that file does not belong to this session';
  end if;

  update sessions set image_path = p_path where id = p_session_id;

  perform public.write_audit('session.image', 'session', p_session_id::text,
    jsonb_build_object('image_path', v_old),
    jsonb_build_object('image_path', p_path));
end;
$$;

revoke execute on function public.set_session_image(uuid, text) from public;
grant execute on function public.set_session_image(uuid, text) to authenticated;
