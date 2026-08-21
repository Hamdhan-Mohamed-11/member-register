-- Reorder upsert_session so the optional arguments carry SQL defaults.
--
-- The previous signature had p_session_id first with no default, which meant
-- "create a session" had to pass an explicit null. Postgres accepts that, but
-- the generated TypeScript types mark a defaultless parameter as REQUIRED and
-- non-nullable, so every create site needed a cast.
--
-- Casting around generated types defeats the point of having them: the next
-- signature change would go unnoticed. Moving p_session_id to the end with a
-- default null makes "omit it to create" the honest shape, and keeps the
-- genuinely required parameters required in the type.
--
-- Postgres requires that every parameter AFTER a defaulted one also has a
-- default, which is why the optional block is grouped at the end. PostgREST
-- calls by name, so argument order is invisible to callers.

drop function if exists public.upsert_session(
  uuid, uuid, text, text, text, timestamptz, text, text, uuid, text, numeric, int, text, text
);

create or replace function public.upsert_session(
  p_host_club_id uuid,
  p_title        text,
  p_held_at      timestamptz,
  p_book_title   text default '',
  p_book_author  text default '',
  p_location     text default null,
  p_notes        text default null,
  p_presenter    uuid default null,
  p_pricing_kind text default 'free',
  p_guest_fee    numeric default null,
  p_capacity     int default null,
  p_status       text default 'scheduled',
  p_video_url    text default null,
  p_session_id   uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_before jsonb;
  v_fee    numeric;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'session title is required';
  end if;
  if p_pricing_kind not in ('free','paid') then
    raise exception 'invalid pricing kind';
  end if;

  -- Normalise before the check constraint sees it: a free session must carry
  -- no fee, and a paid one must carry a positive one.
  v_fee := case when p_pricing_kind = 'paid' then nullif(coalesce(p_guest_fee, 0), 0) else null end;
  if p_pricing_kind = 'paid' and v_fee is null then
    raise exception 'a paid session needs a guest fee above zero';
  end if;

  if p_session_id is null then
    insert into sessions (
      host_club_id, title, book_title, book_author, held_at, location, notes,
      presenter_member_id, pricing_kind, guest_fee_lkr, capacity, status,
      video_url, created_by
    ) values (
      p_host_club_id, trim(p_title), coalesce(trim(p_book_title), ''),
      coalesce(trim(p_book_author), ''), p_held_at, nullif(trim(p_location), ''),
      nullif(trim(p_notes), ''), p_presenter, p_pricing_kind, v_fee, p_capacity,
      coalesce(p_status, 'scheduled'), nullif(trim(p_video_url), ''), auth.uid()
    )
    returning id into v_id;

    perform public.write_audit('session.create', 'session', v_id::text, null,
      jsonb_build_object('title', trim(p_title), 'club', p_host_club_id));
  else
    select to_jsonb(s) into v_before from sessions s where s.id = p_session_id;
    if v_before is null then
      raise exception 'session not found';
    end if;

    update sessions
    set host_club_id        = p_host_club_id,
        title               = trim(p_title),
        book_title          = coalesce(trim(p_book_title), ''),
        book_author         = coalesce(trim(p_book_author), ''),
        held_at             = p_held_at,
        location            = nullif(trim(p_location), ''),
        notes               = nullif(trim(p_notes), ''),
        presenter_member_id = p_presenter,
        pricing_kind        = p_pricing_kind,
        guest_fee_lkr       = v_fee,
        capacity            = p_capacity,
        status              = coalesce(p_status, status),
        video_url           = nullif(trim(p_video_url), '')
    where id = p_session_id;

    v_id := p_session_id;
    perform public.write_audit('session.update', 'session', v_id::text, v_before,
      (select to_jsonb(s) from sessions s where s.id = v_id));
  end if;

  return v_id;
end;
$$;

revoke execute on function public.upsert_session(
  uuid, text, timestamptz, text, text, text, text, uuid, text, numeric, int, text, text, uuid
) from public;

grant execute on function public.upsert_session(
  uuid, text, timestamptz, text, text, text, text, uuid, text, numeric, int, text, text, uuid
) to authenticated;
