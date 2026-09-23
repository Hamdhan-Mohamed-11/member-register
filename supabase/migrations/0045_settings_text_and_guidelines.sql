-- Two pieces of writing the club owns, kept in settings rather than in code:
-- where a borrowed book is collected (it goes in the approval email), and the
-- guidelines someone must tick before applying to join a club.
--
-- Both live on app_settings' single row so the settings screen edits them the
-- same way it edits the fees, and neither needs a deploy to change.

alter table app_settings
  add column if not exists library_collect_at text,
  add column if not exists join_guidelines    text;

-- The first draft. Written here, not in the app, so an admin editing it in
-- Settings is editing the real thing and not being overruled by a fallback.
update app_settings
set join_guidelines = trim(both from $g$I will read the book for the session and come ready to talk about it.
I will treat everyone in the club with respect, and keep what is said in the room in the room.
I will come to the sessions I say I am coming to, and tell the club early when I cannot.
Any book I borrow is my responsibility: I will return it by its due date and in the state I got it.
I will not use the club, its sessions or its member list to sell or promote anything without asking first.
I understand my membership can be ended if I do not keep to these guidelines.$g$)
where id = 1 and (join_guidelines is null or btrim(join_guidelines) = '');

update app_settings
set library_collect_at = 'the Pick a Book office'
where id = 1 and (library_collect_at is null or btrim(library_collect_at) = '');

-- Whether -- and when -- the applicant ticked them. Nullable, because the
-- applications already in the queue were made before the guidelines existed
-- and refusing to show them would be worse than an honest blank.
alter table club_join_requests
  add column if not exists guidelines_accepted_at timestamptz;

comment on column club_join_requests.guidelines_accepted_at is
  'When the applicant ticked every registration guideline. Null for applications made before guidelines existed.';

-- Applying now means agreeing. The check is here rather than only in the form
-- because the form is a suggestion and this is the rule.
create or replace function public.request_club_join(
  p_club_id  uuid,
  p_message  text default null,
  p_accepted boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me   uuid := auth.uid();
  v_club record;
  v_id   uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select kind, is_open_join into v_club
  from clubs where id = p_club_id and is_active;
  if v_club is null then
    raise exception 'club not found';
  end if;

  -- Company clubs are invite-only, always. No exceptions, no admin override
  -- through this path -- an admin adds employees by creating invites.
  if v_club.kind <> 'public' then
    raise exception 'this club is invite only';
  end if;

  if not v_club.is_open_join then
    raise exception 'this club is not open for applications';
  end if;

  if not coalesce(p_accepted, false) then
    raise exception 'please agree to the club guidelines before applying';
  end if;

  if exists (
    select 1 from club_memberships
    where member_id = v_me and club_id = p_club_id and status in ('active','pending')
  ) then
    raise exception 'you are already in this club';
  end if;

  if exists (select 1 from club_join_requests where member_id = v_me and status = 'pending') then
    raise exception 'you already have an application waiting';
  end if;

  insert into club_join_requests (member_id, club_id, message, guidelines_accepted_at)
  values (v_me, p_club_id, p_message, now())
  returning id into v_id;

  return v_id;
end;
$function$;

-- The old two-argument shape would still resolve (the third has a default) and
-- would then be a way to apply without agreeing. Drop it.
drop function if exists public.request_club_join(uuid, text);

grant execute on function public.request_club_join(uuid, text, boolean) to authenticated;

/**
 * The written settings, edited by a super admin.
 *
 * Separate from update_app_settings because that one is all numbers and dates
 * and is posted by a different form; folding text into it would mean every
 * fee change re-posts the guidelines and vice versa.
 */
create or replace function public.update_app_texts(
  p_library_collect_at text,
  p_join_guidelines    text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_super_admin() then
    raise exception 'only a super admin can change this';
  end if;

  update app_settings
  set library_collect_at = nullif(btrim(p_library_collect_at), ''),
      join_guidelines    = nullif(btrim(p_join_guidelines), '')
  where id = 1;
end;
$$;

grant execute on function public.update_app_texts(text, text) to authenticated;
