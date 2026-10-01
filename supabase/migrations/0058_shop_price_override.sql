-- The club's own price for a shop book.
--
-- The store's price is right for the store. The club sometimes needs its own
-- -- a book bought in at a different cost, a price the store has not caught
-- up with -- and like the cover, it has to live somewhere the hourly sync
-- will not overwrite.

alter table store_books
  add column if not exists price_override numeric(12,2) check (price_override is null or price_override >= 0);

comment on column store_books.price_override is
  'What the club charges instead of the store''s price. Never written by the sync. Null means the store''s price stands.';

-- Replaced rather than "create or replace": the view gains a column in the
-- middle, and Postgres will not reshuffle an existing one's columns.
drop view if exists public.shop_books;
create view public.shop_books as
  select
    b.id,
    b.store_id,
    coalesce(b.title_override, b.title)             as title,
    coalesce(b.author_override, b.author)           as author,
    b.isbn,
    b.category,
    coalesce(b.description_override, b.description) as description,
    coalesce(b.price_override, b.price_lkr)         as price_lkr,
    b.price_lkr                                     as store_price_lkr,
    b.market_price_lkr,
    b.stock,
    b.featured,
    coalesce(b.cover_override, b.cover_url)         as cover_url,
    case
      when b.cover_override is not null and b.cover_url is null then b.sort_rank + 2
      else b.sort_rank
    end                                             as sort_rank,
    b.is_active,
    b.cover_override is not null                    as cover_is_ours,
    b.price_override is not null                    as price_is_ours,
    b.synced_at,
    b.edited_at
  from store_books b;

alter view public.shop_books set (security_invoker = on);
grant select on public.shop_books to authenticated;

/**
 * The club's own words, picture and price for a shop book.
 *
 * Every argument is a string so that three states fit in one parameter: null
 * leaves the field alone, an empty string clears the override and the store's
 * own value shows again, anything else sets it. A boolean-per-field would be
 * six arguments to keep in step with four.
 */
create or replace function public.set_store_book_overrides(
  p_id          bigint,
  p_cover       text default null,
  p_title       text default null,
  p_author      text default null,
  p_description text default null,
  p_price       text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_price numeric;
begin
  if not is_super_admin() then
    raise exception 'only a super admin edits the shop catalogue';
  end if;

  if p_price is not null and btrim(p_price) <> '' then
    begin
      v_price := btrim(p_price)::numeric;
    exception when others then
      raise exception 'that price is not a number';
    end;
    if v_price < 0 then
      raise exception 'a price cannot be negative';
    end if;
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
      price_override       = case
                               when p_price is null then price_override
                               when btrim(p_price) = '' then null
                               else v_price
                             end,
      edited_at            = now(),
      edited_by            = auth.uid()
  where id = p_id;

  if not found then
    raise exception 'that book is not in the catalogue';
  end if;
end;
$$;

drop function if exists public.set_store_book_overrides(bigint, text, text, text, text);
grant execute on function public.set_store_book_overrides(bigint, text, text, text, text, text) to authenticated;
