-- Keep the member's name at signup.
--
-- Names collected by the join form were being lost for every real signup:
--
--   1. JoinForm passes first/last name to auth.signUp() as user metadata.
--   2. With email confirmation ON, signUp returns NO session, so JoinForm
--      returns early -- before the client-side profiles.update() that was the
--      only thing writing the name.
--   3. handle_new_user() never looked at the metadata.
--
-- So the name was written to auth.users.raw_user_meta_data and read by nobody.
-- It only worked in development, where email confirmation was off, a session
-- came back, and the client-side update ran. Enabling confirmation for
-- production silently broke it, leaving real members in the approval queue
-- showing nothing but an email address.
--
-- SECURITY: raw_user_meta_data is user-writable and must never be a source of
-- privilege. That reasoning is unchanged -- role, status and club are still
-- decided here, never taken from metadata. A display name is not a privilege.
--
-- CAREFUL: this function is defined in 0002 and REDEFINED in 0006, which moved
-- club membership out of profiles.club_id into club_memberships. Base any
-- future edit on 0006 (or on the live definition via \sf), NOT on 0002 --
-- rebuilding it from 0002 reintroduces a reference to profiles.club_id, which
-- no longer exists, and every signup then fails with "Database error creating
-- new user".

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_invite invites%rowtype;
  v_term   int;
  v_first  text;
  v_last   text;
begin
  -- Trimmed and length-capped: user-supplied text bound for a column that
  -- every admin screen renders.
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
      -- Club-specific term wins over the global default.
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

    update invites
    set status = 'accepted', accepted_at = now(), accepted_profile_id = new.id
    where id = v_invite.id;
  else
    -- Public self-signup. No club yet: they pick one, an admin approves, and
    -- the membership row is created then.
    insert into profiles (id, email, role, status, first_name, last_name)
    values (new.id, new.email, 'member', 'pending', v_first, v_last);
  end if;

  return new;
end;
$$;

-- Backfill members already affected. Their names are still in
-- auth.users.raw_user_meta_data, unread -- only the copy into profiles was
-- missed, so nothing was lost, just never collected.
update profiles p
set first_name = left(btrim(coalesce(u.raw_user_meta_data->>'first_name', '')), 80),
    last_name  = left(btrim(coalesce(u.raw_user_meta_data->>'last_name',  '')), 80)
from auth.users u
where u.id = p.id
  and p.first_name = ''
  and p.last_name = ''
  and btrim(coalesce(u.raw_user_meta_data->>'first_name', '') ||
            coalesce(u.raw_user_meta_data->>'last_name',  '')) <> '';
