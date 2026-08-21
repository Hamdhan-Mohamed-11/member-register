-- Onboarding RPCs: club applications, approvals, invites, role changes.
--
-- Every one of these is SECURITY DEFINER because it has to read or write rows
-- the caller cannot see, and every one re-checks the caller's role in its own
-- body -- the RLS policies do not apply inside a definer function, so the
-- check has to be explicit. `set search_path = public` on all of them.
--
-- Grants are spelled out with full signatures at the bottom. A function with
-- no grant is unreachable; a function granted to `public` is reachable by anon.

-- ---------------------------------------------------------------------------
-- audit helper
-- ---------------------------------------------------------------------------
create or replace function public.write_audit(
  p_action text, p_entity_type text, p_entity_id text,
  p_before jsonb default null, p_after jsonb default null
)
returns void
language sql security definer set search_path = public as $$
  insert into admin_audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after);
$$;

revoke execute on function public.write_audit(text,text,text,jsonb,jsonb) from public;

-- ---------------------------------------------------------------------------
-- resolve_club_terms -- club override, else the global default
-- ---------------------------------------------------------------------------
create or replace function public.resolve_club_terms(p_club_id uuid)
returns table (fee_lkr numeric, term_months int)
language sql stable security definer set search_path = public as $$
  select
    coalesce(c.membership_fee_lkr, s.membership_fee_lkr),
    coalesce(c.term_months, s.membership_term_months)
  from clubs c cross join app_settings s
  where c.id = p_club_id and s.id = 1;
$$;

revoke execute on function public.resolve_club_terms(uuid) from public;
grant execute on function public.resolve_club_terms(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- request_club_join
-- ---------------------------------------------------------------------------
-- The ONLY way a member can ask to join a club. The kind check here is what
-- stops a stranger walking into a company club -- it cannot be expressed as a
-- row policy, which is why club_join_requests has no INSERT policy at all.
create or replace function public.request_club_join(p_club_id uuid, p_message text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_kind text;
  v_id   uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select kind into v_kind from clubs where id = p_club_id and is_active;
  if v_kind is null then
    raise exception 'club not found';
  end if;

  -- Company clubs are invite-only, always. No exceptions, no admin override
  -- through this path -- an admin adds employees by creating invites.
  if v_kind <> 'public' then
    raise exception 'this club is invite only';
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
-- approve_join_request / reject_join_request
-- ---------------------------------------------------------------------------
-- Approval activates the account AND creates the club membership in ONE
-- transaction. A half-applied approval leaves someone active with no club,
-- which under the shared-club visibility rule means they can see nobody and
-- cannot tell why.
create or replace function public.approve_join_request(p_request_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_req   club_join_requests%rowtype;
  v_term  int;
  v_first boolean;
  v_mid   uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  select * into v_req from club_join_requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request already decided';
  end if;

  select term_months into v_term from public.resolve_club_terms(v_req.club_id);
  v_term := coalesce(v_term, 12);

  -- Their first club is the primary one -- covered by the signup fee.
  v_first := not exists (
    select 1 from club_memberships where member_id = v_req.member_id and is_primary
  );

  insert into club_memberships
    (member_id, club_id, status, is_primary, joined_on, renewal_date)
  values (
    v_req.member_id, v_req.club_id, 'active', v_first, current_date,
    (current_date + (v_term || ' months')::interval)::date
  )
  on conflict (member_id, club_id) do update
    set status = 'active',
        joined_on = coalesce(club_memberships.joined_on, current_date),
        renewal_date = excluded.renewal_date
  returning id into v_mid;

  update profiles
  set status = 'active'
  where id = v_req.member_id and status = 'pending';

  update club_join_requests
  set status = 'approved', decided_by = auth.uid(), decided_at = now()
  where id = p_request_id;

  perform public.write_audit(
    'join_request.approve', 'club_join_request', p_request_id::text,
    to_jsonb(v_req), jsonb_build_object('membership_id', v_mid)
  );

  return v_mid;
end;
$$;

create or replace function public.reject_join_request(p_request_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req club_join_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  select * into v_req from club_join_requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request already decided';
  end if;

  update club_join_requests
  set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
      message = coalesce(p_reason, message)
  where id = p_request_id;

  -- Only mark the ACCOUNT rejected if this was their way in. Someone already
  -- in a club who is refused a second club keeps their existing membership.
  update profiles p
  set status = 'rejected'
  where p.id = v_req.member_id
    and p.status = 'pending'
    and not exists (
      select 1 from club_memberships m
      where m.member_id = p.id and m.status = 'active'
    );

  perform public.write_audit(
    'join_request.reject', 'club_join_request', p_request_id::text,
    to_jsonb(v_req), null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- create_invite
-- ---------------------------------------------------------------------------
-- Writes the invite row only. Sending the Auth email is a service-role call
-- from the server action, because auth.admin.inviteUserByEmail has no SQL
-- equivalent. Splitting it this way keeps the authorisation check in SQL where
-- the rest of the rules live.
create or replace function public.create_invite(
  p_email text, p_club_id uuid, p_role text default 'member'
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_id      uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  if p_role not in ('member','secretary','super_admin') then
    raise exception 'invalid role';
  end if;

  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'invalid email';
  end if;

  if exists (select 1 from profiles where lower(email) = lower(p_email)) then
    raise exception 'that email already has an account';
  end if;

  select company_id into v_company from clubs where id = p_club_id;

  -- Supersede any outstanding invite rather than colliding with the partial
  -- unique index on pending emails.
  update invites
  set status = 'revoked'
  where lower(email) = lower(p_email) and status = 'pending';

  insert into invites (email, club_id, company_id, role, invited_by)
  values (lower(p_email), p_club_id, v_company, p_role, auth.uid())
  returning id into v_id;

  perform public.write_audit('invite.create', 'invite', v_id::text, null,
    jsonb_build_object('email', lower(p_email), 'club_id', p_club_id, 'role', p_role));

  return v_id;
end;
$$;

create or replace function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  update invites set status = 'revoked'
  where id = p_invite_id and status = 'pending';

  perform public.write_audit('invite.revoke', 'invite', p_invite_id::text, null, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_member_role / set_member_status
-- ---------------------------------------------------------------------------
create or replace function public.set_member_role(p_member_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old text;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;
  if p_role not in ('member','secretary','super_admin') then
    raise exception 'invalid role';
  end if;

  -- Refuse to remove the last super admin. Without this the club can lock
  -- itself out of its own admin area with one careless demotion.
  select role into v_old from profiles where id = p_member_id;
  if v_old = 'super_admin' and p_role <> 'super_admin' then
    if (select count(*) from profiles where role = 'super_admin' and status = 'active') <= 1 then
      raise exception 'cannot remove the last super admin';
    end if;
  end if;

  update profiles set role = p_role where id = p_member_id;

  perform public.write_audit('member.set_role', 'profile', p_member_id::text,
    jsonb_build_object('role', v_old), jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.set_member_status(p_member_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old text;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;
  if p_status not in ('pending','active','suspended','rejected') then
    raise exception 'invalid status';
  end if;

  select status into v_old from profiles where id = p_member_id;
  update profiles set status = p_status where id = p_member_id;

  perform public.write_audit('member.set_status', 'profile', p_member_id::text,
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Signatures spelled out in full so a later overload cannot silently
-- inherit them.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.request_club_join(uuid, text),
  public.approve_join_request(uuid),
  public.reject_join_request(uuid, text),
  public.create_invite(text, uuid, text),
  public.revoke_invite(uuid),
  public.set_member_role(uuid, text),
  public.set_member_status(uuid, text)
from public;

grant execute on function
  public.request_club_join(uuid, text),
  public.approve_join_request(uuid),
  public.reject_join_request(uuid, text),
  public.create_invite(text, uuid, text),
  public.revoke_invite(uuid),
  public.set_member_role(uuid, text),
  public.set_member_status(uuid, text)
to authenticated;
