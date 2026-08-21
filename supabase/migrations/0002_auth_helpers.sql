-- Identity helpers used by every RLS policy in the next migration, plus the
-- trigger that provisions a `profiles` row when Supabase Auth creates a user.
--
-- WHY SECURITY DEFINER, on every one of these:
--
--   A policy on `profiles` written inline as
--       using (exists (select 1 from profiles where id = auth.uid() and role = ...))
--   INFINITELY RECURSES -- evaluating that subquery re-invokes the very policy
--   being evaluated, and Postgres raises
--       "infinite recursion detected in policy for relation profiles".
--
--   A security definer function executes as its OWNER (postgres, which has
--   BYPASSRLS), so the read inside it is not subject to any policy and there is
--   nothing to recurse into.
--
-- WHY `set search_path = public`, on every one of these:
--
--   Mandatory on any security definer function. Without it a caller can prepend
--   their own schema to search_path and hijack the table names inside the body,
--   which executes with the owner's privileges. This is a privilege-escalation
--   vector, not a style preference.
--
-- WHY `stable`:
--
--   Lets the planner cache the result per statement instead of re-evaluating it
--   once per candidate row. See the call-site note in the RLS migration.

-- ---------------------------------------------------------------------------
-- Session introspection
-- ---------------------------------------------------------------------------

create or replace function public.current_member_role()
returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from profiles where id = auth.uid()) in ('secretary','super_admin'),
    false
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from profiles where id = auth.uid()) = 'super_admin',
    false
  );
$$;

create or replace function public.current_club_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select club_id from profiles where id = auth.uid();
$$;

create or replace function public.current_member_is_active()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select status from profiles where id = auth.uid()) = 'active',
    false
  );
$$;

-- Avoids a nested policy evaluation on `clubs` from inside a `profiles` policy.
create or replace function public.is_public_club(p_club_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from clubs where id = p_club_id and kind = 'public');
$$;

-- ---------------------------------------------------------------------------
-- can_view_member -- the directory visibility rule, reusable
-- ---------------------------------------------------------------------------
-- The rule: you can always see yourself; staff see everyone; otherwise both
-- parties must be active AND the target must be either in a public club (the
-- open directory) or in the SAME club as you (a company colleague).
--
-- Company-club members are therefore invisible to everyone outside their own
-- company, which is the requirement. Every other table's per-member policy
-- delegates here so the rule lives in exactly two places, both in this repo's
-- migration files.
--
-- Note this deliberately does NOT call the helpers above: inlining the reads
-- keeps it a single planner-visible expression and avoids stacking six
-- function calls per row.
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
            exists (select 1 from clubs c where c.id = t.club_id and c.kind = 'public')
            -- null club_id on either side makes this false, so it fails closed.
            or t.club_id = (select club_id from profiles where id = auth.uid())
          )
        )
      )
  );
$$;

-- These run as postgres. Never expose them to anon.
revoke execute on function
  public.current_member_role(),
  public.is_admin(),
  public.is_super_admin(),
  public.current_club_id(),
  public.current_member_is_active(),
  public.is_public_club(uuid),
  public.can_view_member(uuid)
from public;

grant execute on function
  public.current_member_role(),
  public.is_admin(),
  public.is_super_admin(),
  public.current_club_id(),
  public.current_member_is_active(),
  public.is_public_club(uuid),
  public.can_view_member(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- handle_new_user -- provision a profile when Auth creates a user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_invite   invites%rowtype;
  v_term     int;
begin
  select membership_term_months into v_term from app_settings where id = 1;
  v_term := coalesce(v_term, 12);

  -- An invite, if one is live for this address, is AUTHORITATIVE for role and
  -- club. See the security note on the invites table: new.raw_user_meta_data is
  -- user-writable and must never be a source of privilege.
  select * into v_invite
  from invites
  where lower(email) = lower(new.email)
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    insert into profiles (id, email, role, status, club_id, renewal_date)
    values (
      new.id,
      new.email,
      v_invite.role,
      'active',
      v_invite.club_id,
      (current_date + (v_term || ' months')::interval)::date
    );

    update invites
    set status = 'accepted',
        accepted_at = now(),
        accepted_profile_id = new.id
    where id = v_invite.id;
  else
    -- Public self-signup. Lands with no club and no privileges; the applicant
    -- must pick a public club and be approved before they can see anything.
    insert into profiles (id, email, role, status, club_id)
    values (new.id, new.email, 'member', 'pending', null);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the denormalised email in step when a user changes theirs.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();
