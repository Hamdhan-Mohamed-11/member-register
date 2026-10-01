-- Two gaps the club ran into straight away.
--
-- 1. A shop book whose cover nobody has: the store has no file and Open
--    Library has never heard of the ISBN, so it shows a lettered placeholder
--    forever. The club wants to supply one -- but the sync overwrites every
--    column it manages, so an edit has to live somewhere the sync will not
--    touch. Hence the override columns.
--
-- 2. Putting a shelf of books in one at a time. A club with eighty books and
--    a spreadsheet should be able to hand over the spreadsheet.

-- --- 1. what an admin may override on a shop book -------------------------

alter table store_books
  add column if not exists cover_override       text,
  add column if not exists description_override text,
  add column if not exists title_override       text,
  add column if not exists author_override      text,
  add column if not exists edited_at            timestamptz,
  add column if not exists edited_by            uuid references profiles(id) on delete set null;

comment on column store_books.cover_override is
  'A cover the club supplied. Never written by the sync, so it survives every refresh of the catalogue.';

/**
 * The club's own words and picture for a shop book.
 *
 * Null leaves a field alone; an empty string clears it and the store''s own
 * value shows again. Only a super admin: this is what members see in the shop.
 */
create or replace function public.set_store_book_overrides(
  p_id          bigint,
  p_cover       text default null,
  p_title       text default null,
  p_author      text default null,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_super_admin() then
    raise exception 'only a super admin edits the shop catalogue';
  end if;

  update store_books
  set cover_override       = case when p_cover is null then cover_override
                                  else nullif(btrim(p_cover), '') end,
      title_override       = case when p_title is null then title_override
                                  else nullif(btrim(p_title), '') end,
      author_override      = case when p_author is null then author_override
                                  else nullif(btrim(p_author), '') end,
      description_override = case when p_description is null then description_override
                                  else nullif(btrim(p_description), '') end,
      edited_at            = now(),
      edited_by            = auth.uid()
  where id = p_id;

  if not found then
    raise exception 'that book is not in the catalogue';
  end if;
end;
$$;

grant execute on function public.set_store_book_overrides(bigint, text, text, text, text) to authenticated;

-- Covers the club supplies for shop books. Public, like every other cover
-- bucket: they show on a page any member can already open.
insert into storage.buckets (id, name, public)
values ('shop-covers', 'shop-covers', true)
on conflict (id) do update set public = true;

drop policy if exists shop_covers_write on storage.objects;
create policy shop_covers_write on storage.objects for insert to authenticated
with check (bucket_id = 'shop-covers' and is_super_admin());

drop policy if exists shop_covers_update on storage.objects;
create policy shop_covers_update on storage.objects for update to authenticated
using (bucket_id = 'shop-covers' and is_super_admin());

drop policy if exists shop_covers_delete on storage.objects;
create policy shop_covers_delete on storage.objects for delete to authenticated
using (bucket_id = 'shop-covers' and is_super_admin());

/**
 * The shop catalogue as the shop should show it: the club's words where they
 * wrote any, the store's where they did not.
 *
 * A view rather than coalesce() repeated in four queries, so "which cover
 * wins" is answered in exactly one place.
 */
create or replace view public.shop_books as
  select
    b.id,
    b.store_id,
    coalesce(b.title_override, b.title)             as title,
    coalesce(b.author_override, b.author)           as author,
    b.isbn,
    b.category,
    coalesce(b.description_override, b.description) as description,
    b.price_lkr,
    b.market_price_lkr,
    b.stock,
    b.featured,
    coalesce(b.cover_override, b.cover_url)         as cover_url,
    -- A club-supplied cover lifts the book up the shelf the same way the
    -- store's own does: sort_rank counts "has a cover" for two.
    case
      when b.cover_override is not null and b.cover_url is null then b.sort_rank + 2
      else b.sort_rank
    end                                             as sort_rank,
    b.is_active,
    b.cover_override is not null                    as cover_is_ours,
    b.synced_at,
    b.edited_at
  from store_books b;

alter view public.shop_books set (security_invoker = on);
grant select on public.shop_books to authenticated;

-- --- 2. a shelf from a spreadsheet ----------------------------------------

/**
 * Adds many books to the lending shelf at once.
 *
 * Matched on title + author so re-importing a corrected spreadsheet updates
 * what is there rather than doubling it -- the commonest way a bulk import
 * goes wrong is the second attempt.
 *
 * Returns how many were added and how many were already there.
 */
create or replace function public.bulk_add_library_books(p_books jsonb)
returns table (added integer, updated integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row     jsonb;
  v_title   text;
  v_author  text;
  v_id      bigint;
  v_added   integer := 0;
  v_updated integer := 0;
begin
  if not is_super_admin() then
    raise exception 'only a super admin keeps the lending shelf';
  end if;
  if jsonb_typeof(p_books) <> 'array' then
    raise exception 'expected a list of books';
  end if;
  if jsonb_array_length(p_books) > 500 then
    raise exception 'please import at most 500 books at a time';
  end if;

  for v_row in select * from jsonb_array_elements(p_books)
  loop
    v_title := btrim(coalesce(v_row->>'title', ''));
    continue when v_title = '';
    v_author := btrim(coalesce(v_row->>'author', ''));

    select id into v_id
    from library_shelf
    where lower(title) = lower(v_title) and lower(author) = lower(v_author)
    limit 1;

    if v_id is null then
      insert into library_shelf
        (title, author, isbn, category, description, copies, shelf_mark, is_active, added_by)
      values (
        v_title,
        v_author,
        nullif(btrim(coalesce(v_row->>'isbn', '')), ''),
        nullif(btrim(coalesce(v_row->>'category', '')), ''),
        nullif(btrim(coalesce(v_row->>'description', '')), ''),
        greatest(0, coalesce((v_row->>'copies')::integer, 1)),
        nullif(btrim(coalesce(v_row->>'shelf_mark', '')), ''),
        true,
        auth.uid()
      );
      v_added := v_added + 1;
    else
      -- Everything but the cover, which the spreadsheet does not carry.
      update library_shelf
      set isbn        = coalesce(nullif(btrim(coalesce(v_row->>'isbn', '')), ''), isbn),
          category    = coalesce(nullif(btrim(coalesce(v_row->>'category', '')), ''), category),
          description = coalesce(nullif(btrim(coalesce(v_row->>'description', '')), ''), description),
          copies      = greatest(0, coalesce((v_row->>'copies')::integer, copies)),
          shelf_mark  = coalesce(nullif(btrim(coalesce(v_row->>'shelf_mark', '')), ''), shelf_mark),
          is_active   = true,
          updated_at  = now()
      where id = v_id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return query select v_added, v_updated;
end;
$$;

grant execute on function public.bulk_add_library_books(jsonb) to authenticated;
