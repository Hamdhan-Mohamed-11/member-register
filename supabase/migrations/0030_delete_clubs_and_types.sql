-- ---------------------------------------------------------------------------
-- 0030 — deleting clubs and club types
-- ---------------------------------------------------------------------------
-- Both were creatable and editable but not removable, so a typo became
-- permanent furniture. Deletion is guarded rather than free: a club with
-- members, sessions or payments behind it is a historical record, and removing
-- it would orphan or destroy things nobody meant to touch.
--
-- The rule in both cases is the same: delete only what nothing depends on, and
-- say precisely what is in the way otherwise. Retiring (is_active = false) is
-- the answer for anything that has been used, and the error says so.
-- ---------------------------------------------------------------------------

create or replace function public.delete_club(p_club_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_club     clubs%rowtype;
  v_members  int;
  v_sessions int;
  v_payments int;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  select * into v_club from clubs where id = p_club_id;
  if not found then
    raise exception 'club not found';
  end if;

  select count(*) into v_members  from club_memberships where club_id = p_club_id;
  select count(*) into v_sessions from sessions         where host_club_id = p_club_id;
  select count(*) into v_payments from payments         where club_id = p_club_id;

  if v_members > 0 then
    raise exception 'that club still has % member(s). Remove them first, or switch the club off instead of deleting it.', v_members;
  end if;
  if v_sessions > 0 then
    raise exception 'that club has % session(s) on record. Switch it off instead — deleting would take their attendance with it.', v_sessions;
  end if;
  if v_payments > 0 then
    raise exception 'that club has payments against it, which must be kept. Switch it off instead.';
  end if;

  -- A company club is the company's only club, so deleting one behind the
  -- company's back leaves a company nobody can join.
  if v_club.company_id is not null then
    raise exception 'this is a company club. Remove it from the Companies page instead.';
  end if;

  delete from clubs where id = p_club_id;

  perform public.write_audit('club.delete', 'club', p_club_id::text,
    to_jsonb(v_club), null);
end;
$$;

create or replace function public.delete_club_type(p_type_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_type  club_types%rowtype;
  v_clubs int;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  select * into v_type from club_types where id = p_type_id;
  if not found then
    raise exception 'type not found';
  end if;

  select count(*) into v_clubs from clubs where type_id = p_type_id;
  if v_clubs > 0 then
    raise exception 'that type still has % club(s) filed under it. Move them to another type first.', v_clubs;
  end if;

  delete from club_types where id = p_type_id;

  perform public.write_audit('club_type.delete', 'club_type', p_type_id::text,
    to_jsonb(v_type), null);
end;
$$;

revoke execute on function
  public.delete_club(uuid), public.delete_club_type(uuid) from public;
grant execute on function
  public.delete_club(uuid), public.delete_club_type(uuid) to authenticated;
