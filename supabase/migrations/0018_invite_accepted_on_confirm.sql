-- Mark an invite accepted when it is USED, not when it is sent.
--
-- Sending an invite calls auth.admin.generateLink({type:'invite'}), and that
-- CREATES the auth user -- which fires on_auth_user_created, which found the
-- pending invite and marked it accepted. So every invite was 'accepted' the
-- instant it was sent, before the recipient had touched anything, and
-- /admin/companies' "N invites still unaccepted" was always zero.
--
-- Not an access hole: generateLink creates the user WITHOUT a password, so
-- nobody could sign in early. But it made the one signal an admin has for
-- chasing people up -- who has actually joined -- useless.
--
-- The fix splits the two things the invite was doing at once:
--
--   * handle_new_user() still reads the invite to decide role and club. That
--     has to happen at user-creation time, because that is when the profile
--     row is written.
--   * Acceptance now happens on confirmation. Following the invite link is
--     what verifies the address, so auth.users.email_confirmed_at going from
--     null to non-null is the moment somebody proved they read the mailbox.
--
-- handle_new_user is otherwise carried over from 0017 unchanged. CAREFUL: this
-- function is redefined in 0002, 0006, 0017 and here -- base any future edit on
-- the LATEST one (or \sf handle_new_user), never on 0002, which still refers to
-- profiles.club_id and would break every signup.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_invite invites%rowtype;
  v_term   int;
  v_first  text;
  v_last   text;
begin
  v_first := left(btrim(coalesce(new.raw_user_meta_data->>'first_name', '')), 80);
  v_last  := left(btrim(coalesce(new.raw_user_meta_data->>'last_name',  '')), 80);

  select * into v_invite
  from invites
  where lower(email) = lower(new.email)
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    -- Invited: active immediately, no approval step. See the security note on
    -- the invites table -- the invite, never raw_user_meta_data, is what
    -- carries role and club.
    insert into profiles (id, email, role, status, first_name, last_name)
    values (new.id, new.email, v_invite.role, 'active', v_first, v_last);

    if v_invite.club_id is not null then
      select coalesce(c.term_months, s.membership_term_months, 12)
        into v_term
      from clubs c cross join app_settings s
      where c.id = v_invite.club_id and s.id = 1;

      insert into club_memberships
        (member_id, club_id, status, is_primary, joined_on, renewal_date)
      values (
        new.id,
        v_invite.club_id,
        'active',
        true,
        current_date,
        (current_date + (coalesce(v_term, 12) || ' months')::interval)::date
      )
      on conflict (member_id, club_id) do nothing;
    end if;

    -- The invite is deliberately NOT marked accepted here. See
    -- handle_user_confirmed() below.
  else
    -- Public self-signup. No club yet: they pick one, an admin approves, and
    -- the membership row is created then.
    insert into profiles (id, email, role, status, first_name, last_name)
    values (new.id, new.email, 'member', 'pending', v_first, v_last);
  end if;

  return new;
end;
$$;

-- Acceptance: the address has been verified, so whoever holds that mailbox
-- acted on the invite.
create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update invites
    set status = 'accepted',
        accepted_at = now(),
        accepted_profile_id = new.id
    where lower(email) = lower(new.email)
      and status = 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();

-- Repair the rows already wrongly marked: any invite recorded as accepted
-- whose person never actually confirmed. Left alone, the admin screen keeps
-- reporting them as joined.
update invites i
set status = 'pending',
    accepted_at = null,
    accepted_profile_id = null
from auth.users u
where lower(u.email) = lower(i.email)
  and i.status = 'accepted'
  and u.email_confirmed_at is null
  and i.expires_at > now();
