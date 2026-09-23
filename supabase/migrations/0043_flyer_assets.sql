-- ============================================================================
-- 0043 -- a book cover and a sponsor on the flyer
-- ============================================================================
-- Every flyer template now carries a picture of the book. Where the session's
-- book is in the shop catalogue, the flyer maker uses that cover with nothing
-- to fill in; otherwise someone uploads one, and it is kept here so the next
-- flyer for the same session does not ask again.
--
-- A sponsor is optional and per session: a logo and the name to print beside
-- it. Both files live in the existing public `flyers` bucket under the
-- session's own id, so they need no new bucket and no new storage policy.
-- ============================================================================

alter table public.sessions
  add column if not exists book_image_path text,
  add column if not exists sponsor_path     text,
  add column if not exists sponsor_name     text;

alter table public.sessions drop constraint if exists sessions_sponsor_name_len;
alter table public.sessions add constraint sessions_sponsor_name_len
  check (sponsor_name is null or char_length(sponsor_name) <= 60);

comment on column public.sessions.book_image_path is
  'An uploaded cover for the session''s book, when the shop catalogue has none.';

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

  -- Re-checked rather than trusted, as everywhere a client hands us a storage
  -- key: without this, an admin of one club could attach another club's file.
  if p_book_image_path is not null and p_book_image_path not like p_session_id::text || '/%' then
    raise exception 'that book cover does not belong to this session';
  end if;
  if p_sponsor_path is not null and p_sponsor_path not like p_session_id::text || '/%' then
    raise exception 'that sponsor logo does not belong to this session';
  end if;

  update sessions
     set book_image_path = p_book_image_path,
         sponsor_path    = p_sponsor_path,
         sponsor_name    = nullif(left(btrim(coalesce(p_sponsor_name, '')), 60), '')
   where id = p_session_id;

  perform public.write_audit('session.flyer_assets', 'session', p_session_id::text, null,
    jsonb_build_object('book', p_book_image_path, 'sponsor', p_sponsor_path));
end;
$$;

revoke execute on function public.set_session_flyer_assets(uuid, text, text, text) from public;
grant execute on function public.set_session_flyer_assets(uuid, text, text, text) to authenticated;
