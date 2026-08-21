-- Correction to the directory visibility rule.
--
-- 0002/0003 allowed a company-club member to see public-club members, because
-- the "target is in a public club" clause stood on its own. The requirement is
-- narrower: a company club is a CLOSED group. Its members see their colleagues
-- and nobody else, and are seen by nobody else.
--
-- The corrected rule, for two non-admin active members:
--
--   visible if  same club (either kind)
--           or  BOTH sides are in public clubs   <- the open directory
--
-- Consequences, all intended:
--   public  -> public  (different public clubs)  visible
--   public  -> company                           hidden
--   company -> company (same company)            visible
--   company -> company (different company)       hidden
--   company -> public                            hidden

drop policy if exists profiles_select_visible on profiles;

create policy profiles_select_visible on profiles
for select to authenticated
using (
  -- 1. always see yourself
  id = (select auth.uid())

  -- 2. staff see everyone
  or (select public.is_admin())

  -- 3. otherwise both parties must be active...
  or (
    status = 'active'
    and (select public.current_member_is_active())
    and (
      -- 3a. ...and either you share a club (this is the ONLY way a company
      --     member ever becomes visible)...
      profiles.club_id = (select public.current_club_id())
      -- 3b. ...or you are both in public clubs, which form the open directory.
      or (
        (select public.is_public_club(profiles.club_id))
        and (select public.is_public_club((select public.current_club_id())))
      )
    )
  )
);

-- Same correction for the reusable helper that every other table's per-member
-- policy delegates to.
create or replace function public.can_view_member(p_member_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles t
    where t.id = p_member_id
      and (
        t.id = auth.uid()
        or coalesce(
             (select role from profiles where id = auth.uid())
               in ('secretary','super_admin'),
             false)
        or (
          t.status = 'active'
          and coalesce((select status from profiles where id = auth.uid()) = 'active', false)
          and (
            -- same club (null club_id on either side makes this false, so it
            -- fails closed for unassigned applicants)
            t.club_id = (select club_id from profiles where id = auth.uid())
            or (
              exists (select 1 from clubs c where c.id = t.club_id and c.kind = 'public')
              and exists (
                select 1 from clubs c
                where c.id = (select club_id from profiles where id = auth.uid())
                  and c.kind = 'public'
              )
            )
          )
        )
      )
  );
$$;
