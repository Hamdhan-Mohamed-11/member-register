-- ============================================================================
-- 0034 -- badges stopped being awarded once the bookshop arrived
-- ============================================================================
-- 0021 wrote recompute_member_badges() before the bookshop existed, guessing
-- at its shape: `sum(quantity) from book_orders join payments on order_id`.
-- It guarded the query with to_regclass('public.book_orders'), so it did
-- nothing until 0025 created that table -- with a different shape (no
-- quantity column; Read and Rise is counted in rupees on the order). From
-- then on the query raised on EVERY call, and the function's own
-- `exception when others then return 0` swallowed it. Net effect: no badge of
-- any kind has been awarded to anyone since 0025, silently.
--
-- badge_progress() was already moved onto readrise_books_funded() in 0025,
-- which is why the Achievements page showed progress past a threshold on a
-- badge that stayed locked.
--
-- The fix patches the LIVE function body (pg_get_functiondef), swapping only
-- the dynamic query for the same helper badge_progress uses, so the two can
-- no longer disagree. It raises if the text it expects is not there, rather
-- than quietly doing nothing. Then it re-awards everyone, and adds the one
-- trigger that was missing: an order becoming paid.
-- ============================================================================

do $$
declare
  v_def text := pg_get_functiondef('public.recompute_member_badges(uuid)'::regprocedure);
  v_start int := strpos(v_def, 'if to_regclass(''public.book_orders'') is not null then');
  v_end int;
  v_new text;
begin
  if v_start = 0 then
    raise exception 'recompute_member_badges: readrise block not found; already patched?';
  end if;
  v_end := strpos(substr(v_def, v_start), 'end if;');
  if v_end = 0 then
    raise exception 'recompute_member_badges: end of readrise block not found';
  end if;

  v_new := substr(v_def, 1, v_start - 1)
    || 'v_readrise := coalesce(public.readrise_books_funded(p_member_id), 0);'
    || substr(v_def, v_start + v_end - 1 + length('end if;'));
  execute v_new;
end;
$$;

-- An order turning paid (or fulfilled) is when a Read and Rise badge is earned.
create or replace function public.book_orders_badges_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.member_id is not null and new.status in ('paid', 'fulfilled') then
    perform public.recompute_member_badges(new.member_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.book_orders_badges_trg() from public;

drop trigger if exists book_orders_badges on public.book_orders;
create trigger book_orders_badges
  after insert or update of status on public.book_orders
  for each row execute function public.book_orders_badges_trg();

-- Award everything that should have been awarded since 0025.
select public.recompute_member_badges(id) from public.profiles;
