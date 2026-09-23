-- ============================================================================
-- 0041 -- appointing a club's admin
-- ============================================================================
-- The twin of appoint_club_secretary, one level up, and a super admin's call
-- alone: a club admin runs a club's members, its secretary and its money, so
-- handing that out is not something a club admin should be able to do for
-- another club -- or for their own successor.
--
-- Role and appointment are set together, as with the secretary: a club
-- pointing at someone whose role is still 'member' would be a club whose admin
-- cannot reach the admin area, and the two drifting apart is the sort of thing
-- nobody notices until a join request needs approving.
-- ============================================================================

create or replace function public.appoint_club_admin(
  p_club_id   uuid,
  p_member_id uuid default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_previous uuid;
  v_club     text;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  select admin_id, name into v_previous, v_club from clubs where id = p_club_id;
  if v_club is null then
    raise exception 'club not found';
  end if;

  if p_member_id is not null then
    if not exists (select 1 from profiles where id = p_member_id and status = 'active') then
      raise exception 'that member is not active';
    end if;

    if exists (select 1 from clubs where admin_id = p_member_id and id <> p_club_id) then
      raise exception 'that member already runs another club';
    end if;

    -- Running a club as its admin and being its secretary at the same time
    -- would leave the club with no second pair of hands.
    if exists (select 1 from clubs where secretary_id = p_member_id) then
      raise exception 'that member is already a secretary; step them down first';
    end if;
  end if;

  update clubs set admin_id = p_member_id where id = p_club_id;

  if v_previous is not null and v_previous is distinct from p_member_id then
    update profiles set role = 'member' where id = v_previous and role = 'club_admin';
    perform public.notify_member(v_previous, 'role.changed',
      'You no longer run ' || v_club, null, '/me',
      'club_admin:' || p_club_id::text || ':off');
  end if;

  if p_member_id is not null then
    update profiles set role = 'club_admin'
     where id = p_member_id and role in ('member', 'secretary');

    perform public.notify_member(p_member_id, 'role.changed',
      'You are now the admin of ' || v_club,
      'You can run its sessions, members, join requests and payments.',
      '/admin', 'club_admin:' || p_club_id::text || ':on');
  end if;

  perform public.write_audit('club.admin', 'club', p_club_id::text,
    jsonb_build_object('admin_id', v_previous),
    jsonb_build_object('admin_id', p_member_id));
end;
$$;

revoke execute on function public.appoint_club_admin(uuid, uuid) from public;
grant execute on function public.appoint_club_admin(uuid, uuid) to authenticated;
