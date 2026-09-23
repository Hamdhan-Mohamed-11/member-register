-- ============================================================================
-- 0044 -- saving one flyer asset must not clear the other
-- ============================================================================
-- set_session_flyer_assets wrote all three columns every time, so uploading a
-- sponsor logo cleared the book cover, and typing a sponsor name cleared both.
--
-- Now: null means "leave this as it is", and an empty string means "clear it".
-- The caller sends only what changed.
-- ============================================================================

create or replace function public.set_session_flyer_assets(
  p_session_id      uuid,
  p_book_image_path text default null,
  p_sponsor_path    text default null,
  p_sponsor_name    text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
begin
  select host_club_id into v_club from sessions where id = p_session_id;
  if v_club is null then
    raise exception 'session not found';
  end if;

  perform public.require_club_admin(v_club);

  if p_book_image_path is not null and p_book_image_path <> ''
     and p_book_image_path not like p_session_id::text || '/%' then
    raise exception 'that book cover does not belong to this session';
  end if;
  if p_sponsor_path is not null and p_sponsor_path <> ''
     and p_sponsor_path not like p_session_id::text || '/%' then
    raise exception 'that sponsor logo does not belong to this session';
  end if;

  update sessions
     set book_image_path = case
           when p_book_image_path is null then book_image_path
           when p_book_image_path = '' then null
           else p_book_image_path end,
         sponsor_path = case
           when p_sponsor_path is null then sponsor_path
           when p_sponsor_path = '' then null
           else p_sponsor_path end,
         sponsor_name = case
           when p_sponsor_name is null then sponsor_name
           when btrim(p_sponsor_name) = '' then null
           else left(btrim(p_sponsor_name), 60) end
   where id = p_session_id;

  perform public.write_audit('session.flyer_assets', 'session', p_session_id::text, null,
    jsonb_build_object('book', p_book_image_path, 'sponsor', p_sponsor_path));
end;
$$;
