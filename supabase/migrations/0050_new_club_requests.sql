-- Someone outside asks to bring their club in.
--
-- A reading group that already meets somewhere wants what the portal gives
-- them: sessions, points, a member list, the shop. They apply here, a super
-- admin decides, and on approval the club is created PRIVATE -- closed to
-- self-signup -- with the applicant as its club admin. Private is the safe
-- default: an approved club appearing in the public join picker the same
-- minute would start taking strangers before its own people were in it.

create table if not exists club_requests (
  id            uuid primary key default gen_random_uuid(),
  applicant_id  uuid not null references profiles(id) on delete cascade,
  club_name     text not null,
  description   text,
  city          text,
  meets         text,
  member_count  integer check (member_count is null or member_count >= 0),
  message       text,
  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected')),
  decline_reason text,
  club_id       uuid references clubs(id) on delete set null,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references profiles(id) on delete set null
);

create index if not exists club_requests_status_idx on club_requests (status, created_at);
-- One live application per person. They can apply again once it is decided.
create unique index if not exists club_requests_one_open_idx
  on club_requests (applicant_id) where status = 'pending';

alter table club_requests enable row level security;

drop policy if exists club_requests_select on club_requests;
create policy club_requests_select on club_requests for select to authenticated
  using (applicant_id = (select auth.uid()) or (select is_super_admin()));

-- Writes go through the functions below: an applicant must not be able to set
-- their own status, and creating the club is a super admin's act.

/**
 * Applies to bring a club in.
 *
 * The applicant needs an account -- they are about to run a club, and the
 * club needs an admin who can sign in -- but no membership: they are not
 * joining anything, they are bringing their own.
 */
create or replace function public.request_new_club(
  p_club_name    text,
  p_description  text default null,
  p_city         text default null,
  p_meets        text default null,
  p_member_count integer default null,
  p_message      text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(btrim(p_club_name), '') = '' then
    raise exception 'please give the club a name';
  end if;
  if exists (select 1 from club_requests where applicant_id = v_me and status = 'pending') then
    raise exception 'you already have a club application waiting';
  end if;
  if exists (select 1 from clubs where admin_id = v_me) then
    raise exception 'you already run a club';
  end if;

  insert into club_requests
    (applicant_id, club_name, description, city, meets, member_count, message)
  values
    (v_me, btrim(p_club_name), nullif(btrim(p_description), ''), nullif(btrim(p_city), ''),
     nullif(btrim(p_meets), ''), p_member_count, nullif(btrim(p_message), ''))
  returning id into v_id;

  insert into notifications (member_id, kind, title, body, href)
  select p.id, 'club.requested',
         btrim(p_club_name) || ' applied to join Pick a Book',
         coalesce(nullif(btrim(p_city), '') || ' · ', '') || 'Waiting for a decision.',
         '/admin/club-requests'
  from profiles p where p.role = 'super_admin';

  return v_id;
end;
$$;

/**
 * A super admin's decision on a club application.
 *
 * Approving CREATES the club: private (is_open_join false), active, with the
 * applicant as its admin and their role raised to match. Everything that
 * follows -- inviting their people, running sessions, taking payments -- is
 * then the club admin's own work, which is the point of the role.
 */
create or replace function public.decide_club_request(
  p_request_id uuid,
  p_approve    boolean,
  p_reason     text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_req     record;
  v_club_id uuid;
  v_slug    text;
  v_n       integer := 1;
begin
  if not is_super_admin() then
    raise exception 'only a super admin can decide this';
  end if;

  select * into v_req from club_requests where id = p_request_id;
  if v_req is null then
    raise exception 'request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'this application has already been decided';
  end if;

  if not p_approve then
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'please say why';
    end if;
    update club_requests
    set status = 'rejected', decline_reason = btrim(p_reason),
        decided_at = now(), decided_by = auth.uid()
    where id = p_request_id;

    insert into notifications (member_id, kind, title, body, href)
    values (v_req.applicant_id, 'club.rejected',
            v_req.club_name || ' was not approved', btrim(p_reason), '/pending');
    return null;
  end if;

  -- The applicant cannot already run one: clubs.admin_id is unique, and a
  -- failure here would be a constraint error rather than a sentence.
  if exists (select 1 from clubs where admin_id = v_req.applicant_id) then
    raise exception 'this applicant already runs a club';
  end if;

  -- A readable slug, made unique by counting up rather than by appending a
  -- uuid: these appear in URLs people are given.
  v_slug := regexp_replace(lower(btrim(v_req.club_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  if v_slug = '' then v_slug := 'club'; end if;
  while exists (select 1 from clubs where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := regexp_replace(lower(btrim(v_req.club_name)), '[^a-z0-9]+', '-', 'g') || '-' || v_n;
  end loop;

  insert into clubs (name, slug, kind, description, is_active, is_open_join, admin_id)
  values (v_req.club_name, v_slug, 'public', v_req.description, true, false, v_req.applicant_id)
  returning id into v_club_id;

  update profiles set role = 'club_admin', status = 'active' where id = v_req.applicant_id;

  update club_requests
  set status = 'approved', club_id = v_club_id,
      decided_at = now(), decided_by = auth.uid()
  where id = p_request_id;

  insert into notifications (member_id, kind, title, body, href)
  values (v_req.applicant_id, 'club.approved',
          v_req.club_name || ' is on Pick a Book',
          'You are its club admin. It is private for now -- open it for applications when you are ready.',
          '/admin');

  return v_club_id;
end;
$$;

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (
  kind in (
    'video.approved','video.rejected','join.approved','join.rejected',
    'payment.received','points.awarded','membership.added','membership.changed',
    'role.changed','account.status','badge.earned','borrow.updated','borrow.rejected',
    'library.activated','order.placed','order.quoted','order.agreed','order.message',
    'order.paid',
    'creator.registered','creator.book_submitted','creator.decision',
    'club.requested','club.approved','club.rejected'
  )
);

grant execute on function public.request_new_club(text, text, text, text, integer, text) to authenticated;
grant execute on function public.decide_club_request(uuid, boolean, text) to authenticated;
