-- Club and company administration. Super-admin only, all of it.

-- ---------------------------------------------------------------------------
-- slugify
-- ---------------------------------------------------------------------------
-- Slugs are user-visible in URLs and unique-constrained, so they are derived
-- once server-side rather than trusted from a form field.
create or replace function public.slugify(p_text text)
returns text
language sql immutable set search_path = public as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'
    )
  );
$$;

-- Appends -2, -3 ... until the slug is free.
create or replace function public.unique_club_slug(p_base text)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_base text := nullif(public.slugify(p_base), '');
  v_try  text;
  v_n    int := 1;
begin
  v_base := coalesce(v_base, 'club');
  v_try  := v_base;
  while exists (select 1 from clubs where slug = v_try) loop
    v_n := v_n + 1;
    v_try := v_base || '-' || v_n;
  end loop;
  return v_try;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_company_with_club
-- ---------------------------------------------------------------------------
-- A company and its club are created together, never separately. The schema
-- enforces one club per company and that a company club must name its company;
-- doing this in two calls would leave a company with no club if the second
-- failed, and there is no UI for repairing that.
create or replace function public.create_company_with_club(
  p_name          text,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_club_name     text default null,
  p_fee_lkr       numeric default null,
  p_term_months   int default null
)
returns table (company_id uuid, club_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_club    uuid;
  v_slug    text;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'company name is required';
  end if;

  v_slug := public.unique_club_slug(p_name);

  insert into companies (name, slug, contact_email, contact_phone)
  values (trim(p_name), v_slug, nullif(trim(p_contact_email), ''), nullif(trim(p_contact_phone), ''))
  returning id into v_company;

  insert into clubs (name, slug, kind, company_id, membership_fee_lkr, term_months, description)
  values (
    coalesce(nullif(trim(p_club_name), ''), trim(p_name) || ' Book Club'),
    public.unique_club_slug(coalesce(nullif(trim(p_club_name), ''), p_name || ' book club')),
    'company',
    v_company,
    p_fee_lkr,
    p_term_months,
    'Private club for ' || trim(p_name) || ' employees.'
  )
  returning id into v_club;

  perform public.write_audit('company.create', 'company', v_company::text, null,
    jsonb_build_object('name', trim(p_name), 'club_id', v_club));

  return query select v_company, v_club;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_public_club / update_club
-- ---------------------------------------------------------------------------
create or replace function public.create_public_club(
  p_name        text,
  p_description text default null,
  p_fee_lkr     numeric default null,
  p_term_months int default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'club name is required';
  end if;

  insert into clubs (name, slug, kind, description, membership_fee_lkr, term_months)
  values (trim(p_name), public.unique_club_slug(p_name), 'public',
          nullif(trim(p_description), ''), p_fee_lkr, p_term_months)
  returning id into v_id;

  perform public.write_audit('club.create', 'club', v_id::text, null,
    jsonb_build_object('name', trim(p_name), 'kind', 'public'));

  return v_id;
end;
$$;

create or replace function public.update_club(
  p_club_id     uuid,
  p_name        text default null,
  p_description text default null,
  p_fee_lkr     numeric default null,
  p_term_months int default null,
  p_is_active   boolean default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  select to_jsonb(c) into v_before from clubs c where c.id = p_club_id;
  if v_before is null then
    raise exception 'club not found';
  end if;

  -- Null means "leave alone" for name/active. Fee and term are different:
  -- null there is a MEANINGFUL value (fall back to app_settings), so they are
  -- always written rather than coalesced away.
  update clubs
  set name        = coalesce(nullif(trim(p_name), ''), name),
      description = coalesce(nullif(trim(p_description), ''), description),
      membership_fee_lkr = p_fee_lkr,
      term_months        = p_term_months,
      is_active   = coalesce(p_is_active, is_active)
  where id = p_club_id;

  perform public.write_audit('club.update', 'club', p_club_id::text, v_before,
    (select to_jsonb(c) from clubs c where c.id = p_club_id));
end;
$$;

revoke execute on function
  public.unique_club_slug(text),
  public.create_company_with_club(text, text, text, text, numeric, int),
  public.create_public_club(text, text, numeric, int),
  public.update_club(uuid, text, text, numeric, int, boolean)
from public;

grant execute on function
  public.create_company_with_club(text, text, text, text, numeric, int),
  public.create_public_club(text, text, numeric, int),
  public.update_club(uuid, text, text, numeric, int, boolean)
to authenticated;
