-- ---------------------------------------------------------------------------
-- 0032 -- a borrow request tells the admins
-- ---------------------------------------------------------------------------
-- Taken from pg_get_functiondef() against the live database and patched, as
-- in 0027, rather than rebuilt from a migration file.

CREATE OR REPLACE FUNCTION public.request_borrow(p_book_id bigint, p_title text DEFAULT ''::text, p_author text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  -- THE paywall. The catalogue page also hides itself from members without the
  -- add-on, but that is presentation; this is the rule.
  if not public.has_library_access(v_me) then
    raise exception 'borrowing needs the library add-on';
  end if;

  if exists (
    select 1 from borrow_requests
    where member_id = v_me and book_id = p_book_id
      and status in ('requested','approved','issued')
  ) then
    raise exception 'you have already asked for this book';
  end if;

  -- A cap on how many books are out at once, so one member cannot empty the
  -- shelf. Three is a guess; it is a single number to change if it is wrong.
  if (
    select count(*) from borrow_requests
    where member_id = v_me and status in ('approved','issued')
  ) >= 3 then
    raise exception 'you already have three books out; please return one first';
  end if;

  insert into borrow_requests (member_id, book_id, title, author)
  values (v_me, p_book_id, coalesce(trim(p_title), ''), coalesce(trim(p_author), ''))
  returning id into v_id;

  -- Taking a book off the borrow wishlist once it is actually requested keeps
  -- the two lists from disagreeing about what the member is still waiting for.
  delete from book_wishlist
  where member_id = v_me and book_id = p_book_id and kind = 'borrow';

  -- Tell the people who hand books over. Without this a request sat in the
  -- table with nobody told -- which is exactly how one went unnoticed: the
  -- request existed, the admin simply had no reason to look. Book orders have
  -- always notified admins; borrowing never did.
  perform public.notify_member(
    p.id,
    'borrow.updated',
    coalesce((select first_name from profiles where id = v_me), 'A member')
      || ' wants to borrow a book',
    coalesce(nullif(btrim(p_title), ''), 'A library book'),
    '/admin/library',
    'borrow-req:' || v_id::text
  )
  from profiles p
  where p.role = 'super_admin' and p.status = 'active';

  return v_id;
end;
$function$
;
