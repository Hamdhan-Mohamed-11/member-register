-- A copy of the store's catalogue, kept here.
--
-- Buying reads the PaB Store's own catalogue file. That file lives on someone
-- else's hosting, and we have already watched one book catalogue be emptied
-- out from under this portal -- the lending shelf went blank with it. So the
-- shop reads THIS table, and a sync fills it from the store on a schedule.
-- If pickabook.lk goes down, is migrated, or has its data cleared, the shop
-- keeps working with the last catalogue we saw.
--
-- Ids are the store's own, offset by eight million the same way everything
-- else in the portal addresses them, so a cart line or an order item means
-- the same book before and after a sync.

create table if not exists store_books (
  id              bigint primary key,
  store_id        integer not null,
  title           text not null,
  author          text not null default '',
  isbn            text,
  category        text,
  description     text,
  price_lkr       numeric(12,2) not null default 0,
  market_price_lkr numeric(12,2),
  stock           integer not null default 0,
  featured        boolean not null default false,
  /** The store's own cover file, when it has one. */
  image           text,
  /** Resolved at sync time: the store's file, or an Open Library fallback. */
  cover_url       text,
  /**
   * The store's shelf order, worked out once at sync time: featured first,
   * then books with a cover, then non-fiction. Kept as a number so the shop
   * can order by it without recomputing the rule per request.
   */
  sort_rank       integer not null default 0,
  is_active       boolean not null default true,
  first_seen_at   timestamptz not null default now(),
  synced_at       timestamptz not null default now(),
  /** When the store stopped listing it. Never deleted: orders point at it. */
  removed_at      timestamptz
);

create index if not exists store_books_shelf_idx
  on store_books (sort_rank desc, store_id desc) where is_active;
create index if not exists store_books_category_idx
  on store_books (category) where is_active;
create index if not exists store_books_search_idx
  on store_books using gin (to_tsvector('simple', title || ' ' || author || ' ' || coalesce(isbn, '')));

alter table store_books enable row level security;

-- The shop is behind a login, so the catalogue is readable by anyone signed
-- in. Nothing here is a secret -- it is the same list the storefront shows
-- the public -- and deliberately NOT the store's cost or seller payment,
-- which the sync drops on the floor.
drop policy if exists store_books_select on store_books;
create policy store_books_select on store_books for select to authenticated using (true);

/**
 * Writes one batch of the store's catalogue into the mirror.
 *
 * Takes the books as jsonb so a sync is a handful of round trips rather than
 * one per book. Super admin only: this is what the shop shows members.
 *
 * Returns how many rows it wrote.
 */
create or replace function public.sync_store_books(p_books jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  if not is_super_admin() then
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

/**
 * Retires everything the store stopped listing.
 *
 * Called once at the end of a sync, with the cutoff it started at. Rows are
 * marked rather than deleted: a book somebody ordered last month has to keep
 * its title, and a book that comes back is simply seen again.
 */
create or replace function public.retire_unsynced_store_books(p_since timestamptz)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  if not is_super_admin() then
    raise exception 'only a super admin syncs the catalogue';
  end if;

  update store_books
  set is_active = false, removed_at = coalesce(removed_at, now())
  where synced_at < p_since and is_active;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/** What the admin screen shows: how big the catalogue is and how fresh. */
create or replace function public.store_catalogue_status()
returns table (
  total       bigint,
  in_stock    bigint,
  with_cover  bigint,
  retired     bigint,
  last_synced timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    count(*) filter (where is_active),
    count(*) filter (where is_active and stock > 0),
    count(*) filter (where is_active and cover_url is not null),
    count(*) filter (where not is_active),
    max(synced_at)
  from store_books;
$$;

grant execute on function public.sync_store_books(jsonb) to authenticated;
grant execute on function public.retire_unsynced_store_books(timestamptz) to authenticated;
grant execute on function public.store_catalogue_status() to authenticated;
