-- ============================================================================
-- hero_covers(): three book covers for the signed-out landing page.
--
-- The hero fans out popular books, but popular_books() only knows what members
-- have ordered, borrowed or wishlisted -- after the demo wipe that is nothing,
-- and half the hero went blank. The fallback is the store's own shelf order.
--
-- shop_books is granted to authenticated only, and the landing page is signed
-- out, so this goes through a definer function rather than a grant to anon:
-- it hands over a title and a cover, never prices, stock or the rest of the
-- catalogue.
-- ============================================================================

create or replace function public.hero_covers(p_limit int default 3)
returns table (id bigint, title text, cover_url text)
language sql stable security definer set search_path = public as $$
  select b.id::bigint, b.title, b.cover_url
  from shop_books b
  where b.is_active
    and b.stock > 0
    and coalesce(b.cover_url, '') <> ''
  order by b.sort_rank desc, b.store_id desc
  limit greatest(1, least(6, p_limit));
$$;

revoke execute on function public.hero_covers(int) from public;
grant execute on function public.hero_covers(int) to anon, authenticated;
