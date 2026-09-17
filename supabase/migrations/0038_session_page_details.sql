-- ============================================================================
-- 0038 -- what a session page says about itself
-- ============================================================================
-- The session page was a title, a date and a definition list. It now opens
-- with a banner and tells a member why they might come, so a session carries
-- three things the person creating it writes:
--
--   label       a short tag on the banner: "Special event", "Poetry night"
--   tagline     one line under the title
--   highlights  up to three "what to expect" points
--
-- All optional. A session without them still shows its book, presenter and
-- host club; these are what make one worth turning up to.
--
-- Written through their own RPC rather than more parameters on
-- upsert_session, which already takes fifteen -- and whose live body has been
-- rebuilt from an out-of-date migration once before. The action calls both,
-- one after the other, with the same authorisation check.
-- ============================================================================

alter table public.sessions
  add column if not exists label      text,
  add column if not exists tagline    text,
  add column if not exists highlights text[] not null default '{}';

alter table public.sessions drop constraint if exists sessions_label_len;
alter table public.sessions add constraint sessions_label_len
  check (label is null or char_length(label) <= 40);

alter table public.sessions drop constraint if exists sessions_tagline_len;
alter table public.sessions add constraint sessions_tagline_len
  check (tagline is null or char_length(tagline) <= 140);

alter table public.sessions drop constraint if exists sessions_highlights_len;
alter table public.sessions add constraint sessions_highlights_len
  check (cardinality(highlights) <= 3);

create or replace function public.set_session_details(
  p_session_id uuid,
  p_label      text default null,
  p_tagline    text default null,
  p_highlights text[] default '{}'
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
  v_clean text[];
begin
  select host_club_id into v_club from sessions where id = p_session_id;
  if v_club is null then
    raise exception 'session not found';
  end if;

  perform public.require_club_admin(v_club);

  -- Blank points are dropped rather than stored, so a form with two of three
  -- boxes filled saves two points, not two and an empty one.
  select coalesce(array_agg(left(btrim(h), 80)), '{}')
    into v_clean
  from unnest(coalesce(p_highlights, '{}')) as h
  where btrim(coalesce(h, '')) <> '';

  if cardinality(v_clean) > 3 then
    raise exception 'at most three things to expect';
  end if;

  update sessions
     set label      = nullif(left(btrim(coalesce(p_label, '')), 40), ''),
         tagline    = nullif(left(btrim(coalesce(p_tagline, '')), 140), ''),
         highlights = v_clean
   where id = p_session_id;
end;
$$;

revoke execute on function public.set_session_details(uuid, text, text, text[]) from public;
grant execute on function public.set_session_details(uuid, text, text, text[]) to authenticated;
