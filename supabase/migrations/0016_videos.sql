-- Videos: session recordings, and member submissions with a moderation queue.
--
-- The rule from the brief: a member's own upload is visible to THEM first, and
-- only becomes visible to everyone once an admin approves it. So `pending` is
-- not a hidden state -- the submitter can see their own pending video, and
-- nobody else can.
--
-- Embeds are by LINK only. No file uploads: storage, transcoding and bandwidth
-- for video is wildly disproportionate for a 300-member club, and YouTube and
-- Vimeo already solve it.

create table videos (
  id               uuid primary key default gen_random_uuid(),

  -- null submitter = embedded by an admin against a session, which is already
  -- approved by definition.
  submitted_by     uuid references profiles(id) on delete set null,
  session_id       uuid references sessions(id) on delete set null,

  provider         text not null check (provider in ('youtube','vimeo')),

  -- Parsed SERVER-SIDE from the pasted URL. The iframe src is constructed from
  -- provider + external_id and never from source_url, because rendering a
  -- user-supplied string into <iframe src> accepts javascript: and data: URLs.
  -- source_url is kept only so the original is auditable.
  external_id      text not null,
  source_url       text not null,

  title            text not null,
  description      text,

  status           text not null default 'pending'
                     check (status in ('pending','approved','rejected')),

  reviewed_by      uuid references profiles(id) on delete set null,
  reviewed_at      timestamptz,
  review_note      text,

  created_at       timestamptz not null default now(),

  -- The same video cannot be submitted twice. Without this, a rejected video
  -- can simply be re-pasted until a different admin approves it.
  unique (provider, external_id)
);

create index videos_status_idx    on videos(status, created_at desc);
create index videos_submitter_idx on videos(submitted_by);
create index videos_session_idx   on videos(session_id);

-- ---------------------------------------------------------------------------
-- submit_video
-- ---------------------------------------------------------------------------
-- Provider and id are parsed in the server action (which has the URL parser)
-- and passed in already validated; this function is what decides the STATUS,
-- so a member cannot submit something pre-approved.
create or replace function public.submit_video(
  p_provider    text,
  p_external_id text,
  p_source_url  text,
  p_title       text,
  p_description text default null,
  p_session_id  uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_admin  boolean := public.is_admin();
  v_status text;
  v_id     uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from profiles where id = v_me and status = 'active') then
    raise exception 'your account is not active';
  end if;
  if p_provider not in ('youtube','vimeo') then
    raise exception 'only YouTube and Vimeo links can be added';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'please give the video a title';
  end if;

  -- An admin embedding a session recording is approving it by doing it. A
  -- member's submission always starts pending, whatever they send.
  v_status := case when v_admin then 'approved' else 'pending' end;

  insert into videos (
    submitted_by, session_id, provider, external_id, source_url,
    title, description, status, reviewed_by, reviewed_at
  )
  values (
    v_me, p_session_id, p_provider, p_external_id, p_source_url,
    trim(p_title), nullif(trim(p_description), ''), v_status,
    case when v_admin then v_me end,
    case when v_admin then now() end
  )
  on conflict (provider, external_id) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'that video has already been added';
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- moderate_video
-- ---------------------------------------------------------------------------
create or replace function public.moderate_video(
  p_video_id uuid,
  p_status   text,
  p_note     text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;
  if p_status not in ('approved','rejected','pending') then
    raise exception 'invalid moderation status';
  end if;

  select to_jsonb(v) into v_before from videos v where v.id = p_video_id;
  if v_before is null then
    raise exception 'video not found';
  end if;

  update videos
  set status      = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(trim(p_note), '')
  where id = p_video_id;

  perform public.write_audit('video.moderate', 'video', p_video_id::text, v_before,
    jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.delete_video(p_video_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_video videos%rowtype;
begin
  select * into v_video from videos where id = p_video_id;
  if not found then
    raise exception 'video not found';
  end if;

  -- A member may withdraw their own submission while it is still pending.
  -- Once approved it is club content, and removing it is an admin decision.
  if not public.is_admin() then
    if v_video.submitted_by <> auth.uid() or v_video.status <> 'pending' then
      raise exception 'not authorised';
    end if;
  end if;

  delete from videos where id = p_video_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table videos enable row level security;
revoke all on videos from anon, authenticated;
grant select on videos to authenticated;

-- Approved videos are club content. A pending one is visible to its submitter
-- and to admins, and to nobody else -- that IS the "visible to them first"
-- rule, expressed once, here.
create policy videos_select on videos
for select to authenticated
using (
  (status = 'approved' and (select public.current_member_is_active()))
  or submitted_by = (select auth.uid())
  or (select public.is_admin())
);

-- No INSERT/UPDATE policy: submission goes through submit_video(), which is
-- what forces a member's video to start pending. A member writing their own
-- row could set status = 'approved'.

revoke execute on function
  public.submit_video(text, text, text, text, text, uuid),
  public.moderate_video(uuid, text, text),
  public.delete_video(uuid)
from public;

grant execute on function
  public.submit_video(text, text, text, text, text, uuid),
  public.moderate_video(uuid, text, text),
  public.delete_video(uuid)
to authenticated;
