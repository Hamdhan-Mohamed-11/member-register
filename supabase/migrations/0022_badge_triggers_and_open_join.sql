-- ---------------------------------------------------------------------------
-- 0022 — badges earn themselves, and self-join respects the club type
-- ---------------------------------------------------------------------------
--
-- 0021 defined the badges and the function that awards them, but nothing
-- called it. The obvious move was to call it from the server actions that
-- award points -- attendance saving, video approval, marking a book read,
-- payment settlement. That is five call sites today and an unknown number
-- later, every one of which is a chance to forget, and it would need
-- recompute_member_badges granted to `authenticated` (0021 deliberately does
-- not, because a client that can call it for any member id can probe other
-- people's progress through the notifications it writes).
--
-- So the triggers live here instead, on the tables the badge rules actually
-- read. Any path that writes those rows earns the badge, including psql, a
-- backfill script, and whatever awards points next year.
--
-- recompute_member_badges swallows its own exceptions, so none of these can
-- fail the write that fired them: a member still gets their attendance
-- recorded even if the badge pass breaks.
-- ---------------------------------------------------------------------------

create or replace function public.badges_after_member_row()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_member_badges(new.member_id);
  return null;  -- AFTER trigger; the return value is ignored
end;
$$;

create or replace function public.badges_after_profile_row()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_member_badges(new.id);
  return null;
end;
$$;

create or replace function public.badges_after_video_row()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_member_badges(new.submitted_by);
  return null;
end;
$$;

-- Points and presentations and the attendance streak all read this table.
drop trigger if exists member_activities_badges on member_activities;
create trigger member_activities_badges
  after insert on member_activities
  for each row execute function public.badges_after_member_row();

-- books_read counts rows at status 'read', which a row can reach either way.
drop trigger if exists reading_items_badges on reading_items;
create trigger reading_items_badges
  after insert or update of status on reading_items
  for each row when (new.status = 'read')
  execute function public.badges_after_member_row();

-- first_booking. Confirmation can arrive on insert (a free session) or on a
-- later update (payment settling), so both fire.
drop trigger if exists session_bookings_badges on session_bookings;
create trigger session_bookings_badges
  after insert or update of status on session_bookings
  for each row when (new.status = 'confirmed')
  execute function public.badges_after_member_row();

-- club_founder depends on membership, and the points badges depend on
-- points_balance, which recompute_member_points writes to profiles.
drop trigger if exists club_memberships_badges on club_memberships;
create trigger club_memberships_badges
  after insert or update of status on club_memberships
  for each row when (new.status = 'active')
  execute function public.badges_after_member_row();

-- profile_done (photo + bio), and the points families whenever the cached
-- balance moves. Guarded so an unrelated column edit does not re-run the whole
-- pass on every profile save.
drop trigger if exists profiles_badges on profiles;
create trigger profiles_badges
  after update of avatar_path, bio, points_balance on profiles
  for each row
  when (
    new.avatar_path is distinct from old.avatar_path
    or new.bio is distinct from old.bio
    or new.points_balance is distinct from old.points_balance
  )
  execute function public.badges_after_profile_row();

drop trigger if exists videos_badges on videos;
create trigger videos_badges
  after update of status on videos
  for each row when (new.status = 'approved' and new.submitted_by is not null)
  execute function public.badges_after_video_row();

revoke execute on function
  public.badges_after_member_row(),
  public.badges_after_profile_row(),
  public.badges_after_video_row()
from public;

-- ---------------------------------------------------------------------------
-- badge_progress — what the caller has, against what the next badge needs
-- ---------------------------------------------------------------------------
-- /me/badges shows the highest badge in each family plus how far off the next
-- one is, and the raw counts behind that are spread over four tables. Rather
-- than four queries from the app (each of which would have to re-derive the
-- streak island logic), one function returns the five numbers the page needs.
--
-- Deliberately no member-id parameter: it reports on auth.uid() only. Another
-- member's badges are visible through member_badges under the directory rule,
-- but how CLOSE they are to the next one is not something the directory shares.
create or replace function public.badge_progress()
returns table (family text, value int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    return;
  end if;

  return query
  select 'books_read'::text,
         (select count(*)::int from reading_items
          where member_id = v_me and status = 'read');

  return query
  select 'presented'::text,
         (select count(*)::int from member_activities
          where member_id = v_me
            and activity_code in ('present','present_other_club'));

  return query
  select 'points'::text,
         (select coalesce(points_balance, 0) from profiles where id = v_me);

  -- Same gaps-and-islands run as recompute_member_badges. If one changes the
  -- other must too, or the page will promise a badge the recompute won't award.
  return query
  select 'attend_streak'::text, coalesce(max(run), 0)::int
  from (
    select count(*) as run
    from (
      select m, (m - (row_number() over (order by m) * interval '1 month'))::date as island
      from (
        select distinct date_trunc('month', recorded_at)::date as m
        from member_activities
        where member_id = v_me and activity_code = 'attend'
      ) months
    ) islands
    group by island
  ) runs;

  -- The bookshop is not built yet, so this is honestly zero rather than absent
  -- -- the page can render the family and its "not yet" state either way.
  if to_regclass('public.book_orders') is null then
    return query select 'readrise'::text, 0;
  else
    return query execute $q$
      select 'readrise'::text, coalesce(sum(o.quantity), 0)::int
      from book_orders o
      join payments p on p.order_id = o.id
      where o.member_id = $1 and p.status in ('success','manual')
    $q$ using v_me;
  end if;
end;
$$;

revoke execute on function public.badge_progress() from public;
grant execute on function public.badge_progress() to authenticated;

-- ---------------------------------------------------------------------------
-- request_club_join — open-join clubs only
-- ---------------------------------------------------------------------------
-- Before club types there were two kinds of club and the rule could be stated
-- as "public means anyone may apply". Now Kids, Teen and Special clubs are all
-- kind = 'public' as far as the schema is concerned -- they are not a company's
-- private club -- but the user's rule is that only clubs under Public Clubs are
-- offered for self-signup. Kids needs a guardian, Teen and Special are placed
-- by an admin.
--
-- clubs.is_open_join is what says so, and it is per club rather than per type
-- on purpose: a single Public club can be closed to applications while it is
-- full without moving it out of its type and changing who its members can see.
--
-- The kind check stays as well. It is the one that keeps a stranger out of a
-- company club, and is_open_join defaults to false, so a company club would be
-- refused twice.
create or replace function public.request_club_join(p_club_id uuid, p_message text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
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

  if exists (
    select 1 from club_memberships
    where member_id = v_me and club_id = p_club_id and status in ('active','pending')
  ) then
    raise exception 'you are already in this club';
  end if;

  if exists (select 1 from club_join_requests where member_id = v_me and status = 'pending') then
    raise exception 'you already have an application waiting';
  end if;

  insert into club_join_requests (member_id, club_id, message)
  values (v_me, p_club_id, p_message)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_club_membership_payment — the same gate on the paid path
-- ---------------------------------------------------------------------------
-- Paying is the other way into a club, and it bypassed request_club_join
-- entirely. Without the same check a member could buy their way into the Teen
-- club by posting its id at the checkout, which is exactly the hole the kind
-- check was written to close for company clubs.
--
-- The gate applies to NEW joins only. A member already in a club must always be
-- able to renew, even if the club has since been closed to applications --
-- otherwise closing a full club to newcomers silently expires everyone in it.
create or replace function public.start_club_membership_payment(p_club_id uuid)
returns table (
  payment_id uuid,
  order_ref  text,
  amount     numeric,
  club_name  text,
  is_renewal boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := auth.uid();
  v_fee      numeric;
  v_term     int;
  v_club     clubs%rowtype;
  v_existing club_memberships%rowtype;
  v_ref      text;
  v_id       uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from profiles where id = v_me and status = 'active') then
    raise exception 'your account is not active';
  end if;

  select * into v_club from clubs where id = p_club_id and is_active;
  if not found then
    raise exception 'club not found';
  end if;

  -- Company clubs are invite-only. Letting someone buy their way in would
  -- route straight around that, so the check lives here too, not just in
  -- request_club_join.
  select * into v_existing
  from club_memberships
  where member_id = v_me and club_id = p_club_id;

  if v_club.kind <> 'public' and not found then
    raise exception 'this club is invite only';
  end if;

  -- NEW in 0022. `found` still refers to the membership lookup above: a member
  -- already in this club is renewing and must always be allowed through, or
  -- closing a full club to newcomers would quietly expire everyone in it.
  if not found and not v_club.is_open_join then
    raise exception 'this club is not open for applications';
  end if;

  select fee_lkr, term_months into v_fee, v_term
  from public.resolve_club_terms(p_club_id);

  if coalesce(v_fee, 0) <= 0 then
    raise exception 'this club has no fee set; ask an admin to add you';
  end if;

  v_ref := public.new_payment_ref('MB');

  insert into payments (purpose, member_id, club_id, provider_order_ref, amount_lkr, term_months)
  values ('club_membership', v_me, p_club_id, v_ref, v_fee, coalesce(v_term, 12))
  returning id into v_id;

  return query
  select v_id, v_ref, v_fee, v_club.name, (v_existing.id is not null);
end;
$$;

revoke execute on function public.start_club_membership_payment(uuid) from public;
grant execute on function public.start_club_membership_payment(uuid) to authenticated;
