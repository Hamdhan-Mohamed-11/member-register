-- ============================================================================
-- 0039 -- a secretary can see who is asking to join their club
-- ============================================================================
-- profiles_select_visible let a secretary read the profiles of ACTIVE members
-- of the club they run. Someone applying to join is not yet a member, so the
-- join-requests page's profile embed came back null and every application
-- read "Unknown applicant" -- a secretary approving strangers by their
-- message alone. Super admins never saw it; they can read every profile.
--
-- The added clause: the caller runs a club this person has a join request
-- for. Checked in a SECURITY DEFINER function, so the profiles policy does not
-- query club_join_requests under its own RLS (whose policies can read
-- profiles, which would recurse).
-- ============================================================================

create or replace function public.runs_club_applied_to(p_member_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from club_join_requests jr
    join clubs c on c.id = jr.club_id
    where jr.member_id = p_member_id
      and c.secretary_id = (select auth.uid())
  );
$$;

revoke execute on function public.runs_club_applied_to(uuid) from public;
grant execute on function public.runs_club_applied_to(uuid) to authenticated;

drop policy if exists profiles_select_visible on profiles;
create policy profiles_select_visible on profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (select public.is_super_admin())
  or exists (
    select 1
    from club_memberships cm
    join clubs c on c.id = cm.club_id
    where cm.member_id = profiles.id
      and cm.status = 'active'
      and c.secretary_id = (select auth.uid())
  )
  or public.runs_club_applied_to(profiles.id)
  or (
    status = 'active'
    and (select public.current_member_is_active())
    and public.shares_active_club(id)
  )
);
