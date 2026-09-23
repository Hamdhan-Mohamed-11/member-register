-- A creator's account is live the moment they register.
--
-- profiles.status is about being a club MEMBER -- pending means "an admin has
-- not admitted you yet", and everything member-shaped checks it. An author is
-- never admitted to a club, so leaving them pending would park them on the
-- holding page forever. What waits for a super admin is their listing in the
-- shop, which is the status on authors/publishers, not this one.

create or replace function public.register_creator(
  p_kind    text,
  p_name    text,
  p_about   text default null,
  p_website text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if p_kind not in ('author','publisher') then
    raise exception 'unknown kind';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'please give a name';
  end if;

  -- Staff do not become creators. Someone who runs a club approving their own
  -- books is exactly the conflict the approval step exists to prevent.
  if (select role from profiles where id = v_me) in ('secretary','club_admin','super_admin') then
    raise exception 'an admin account cannot register as an author or publisher';
  end if;

  -- Nor does a club member turn into one: the account would keep its
  -- memberships and its points while losing the member role that the member
  -- pages check for.
  if exists (
    select 1 from club_memberships
    where member_id = v_me and status in ('active','pending')
  ) then
    raise exception 'this account is a club member -- please register as an author from a separate account';
  end if;

  if exists (select 1 from authors where owner_id = v_me)
     or exists (select 1 from publishers where owner_id = v_me) then
    raise exception 'this account is already registered';
  end if;

  if p_kind = 'publisher' then
    insert into publishers (owner_id, name, about, website)
    values (v_me, btrim(p_name), nullif(btrim(p_about), ''), nullif(btrim(p_website), ''))
    returning id into v_id;
    update profiles set role = 'publisher', status = 'active' where id = v_me;
  else
    insert into authors (owner_id, name, bio)
    values (v_me, btrim(p_name), nullif(btrim(p_about), ''))
    returning id into v_id;
    update profiles set role = 'author', status = 'active' where id = v_me;
  end if;

  insert into notifications (member_id, kind, title, body, href)
  select p.id, 'creator.registered',
         btrim(p_name) || ' registered as ' || (case when p_kind = 'publisher' then 'a publisher' else 'an author' end),
         'Waiting for approval.',
         '/admin/creators'
  from profiles p where p.role = 'super_admin';

  return v_id;
end;
$$;

grant execute on function public.register_creator(text, text, text, text) to authenticated;
