-- The hourly sync runs with no user behind it.
--
-- is_super_admin() reads auth.uid(), which is null for the service role, so
-- the scheduled run was refused by the check meant to keep members out. The
-- service role is the server itself -- the key lives in .env.local on the VPS
-- and nowhere a browser can reach -- so it is named explicitly rather than
-- the check being loosened for everybody.

create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

comment on function public.is_service_role() is
  'True when the caller is the service key: a scheduled job on the server, never a browser.';

create or replace function public.sync_store_books(p_books jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  if not (is_super_admin() or is_service_role()) then
    raise exception 'only a super admin syncs the catalogue';
  end if;
  if jsonb_typeof(p_books) <> 'array' then
    raise exception 'expected an array of books';
  end if;

  insert into store_books as b (
    id, store_id, title, author, isbn, category, description,
    price_lkr, market_price_lkr, stock, featured, image, cover_url,
    sort_rank, is_active, synced_at, removed_at
  )
  select
    8000000 + (x->>'id')::integer,
    (x->>'id')::integer,
    coalesce(nullif(btrim(x->>'title'), ''), 'Untitled'),
    coalesce(x->>'author', ''),
    nullif(btrim(x->>'isbn'), ''),
    nullif(btrim(x->>'category'), ''),
    nullif(btrim(x->>'description'), ''),
    coalesce((x->>'price')::numeric, 0),
    nullif(x->>'market_price', '')::numeric,
    coalesce((x->>'stock')::integer, 0),
    coalesce((x->>'featured')::boolean, false),
    nullif(btrim(x->>'image'), ''),
    nullif(btrim(x->>'cover_url'), ''),
    coalesce((x->>'sort_rank')::integer, 0),
    true,
    now(),
    null
  from jsonb_array_elements(p_books) as x
  on conflict (id) do update set
    title            = excluded.title,
    author           = excluded.author,
    isbn             = excluded.isbn,
    category         = excluded.category,
    description      = excluded.description,
    price_lkr        = excluded.price_lkr,
    market_price_lkr = excluded.market_price_lkr,
    stock            = excluded.stock,
    featured         = excluded.featured,
    image            = excluded.image,
    cover_url        = excluded.cover_url,
    sort_rank        = excluded.sort_rank,
    is_active        = true,
    synced_at        = now(),
    removed_at       = null
  where b.id = excluded.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.retire_unsynced_store_books(p_since timestamptz)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  if not (is_super_admin() or is_service_role()) then
    raise exception 'only a super admin syncs the catalogue';
  end if;

  update store_books
  set is_active = false, removed_at = coalesce(removed_at, now())
  where synced_at < p_since and is_active;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
