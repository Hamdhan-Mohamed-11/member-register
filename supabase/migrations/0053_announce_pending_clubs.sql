-- Announcing happens in a sweep rather than by id.
--
-- A club becomes announceable at two different moments -- created already
-- open, or opened for applications later -- and create_public_club does not
-- hand its id back. One sweep over "eligible and never announced" covers both
-- and cannot miss a club because a caller forgot to pass one along.
--
-- announce_club is idempotent per club, so the sweep is safe to call after
-- every save.

create or replace function public.announce_pending_clubs()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_club record;
  v_count integer := 0;
begin
  if not is_super_admin() then
    raise exception 'not authorised';
  end if;

  for v_club in
    select id from clubs
    where announced_at is null and is_active and is_open_join and kind = 'public'
  loop
    if announce_club(v_club.id) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.announce_pending_clubs() to authenticated;

-- Everything that already exists has been seen; only clubs from here on are
-- news. Without this the first save after deploying would announce every club
-- the portal has ever had.
update clubs set announced_at = created_at where announced_at is null;
