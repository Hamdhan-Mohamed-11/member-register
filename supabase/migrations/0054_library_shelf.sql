-- The club's own lending shelf.
--
-- Borrowing used to read the old shop's catalogue: the books flagged
-- `library = '1'` in a database somebody else owns. That table was emptied on
-- 21 September and the borrowing page went blank with it, which is the whole
-- argument for this: the books the club lends are the club's own, a few dozen
-- of them, and they should not disappear because a shop was migrated.
--
-- One shared shelf, kept by a super admin. Collection is from the office and
-- only a super admin approves a borrow request, so the shelf belongs at the
-- same desk.

create sequence if not exists library_shelf_id_seq as bigint start with 7000000 increment by 1;

create table if not exists library_shelf (
  id          bigint primary key default nextval('library_shelf_id_seq'),
  title       text not null,
  author      text not null default '',
  isbn        text,
  category    text,
  description text,
  -- In the library-covers bucket. Null shows the same lettered placeholder a
  -- shop book with no cover gets.
  cover_path  text,
  -- How many the club owns. Availability is this minus what is out, which is
  -- counted from borrow_requests rather than kept here: a counter that has to
  -- be decremented by hand is a counter that drifts.
  copies      integer not null default 1 check (copies >= 0),
  shelf_mark  text,
  is_active   boolean not null default true,
  added_by    uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists library_shelf_active_idx on library_shelf (is_active, title);
create index if not exists library_shelf_category_idx on library_shelf (category) where is_active;

comment on table library_shelf is
  'The books the club lends. Ids start at 7,000,000 so they cannot collide with the old shop catalogue (tens of thousands), the store (8,000,000) or the club''s own authors (9,000,000) in borrow_requests.book_id.';

alter table library_shelf enable row level security;

-- Any active member may see the shelf: it is a list of books on a shelf in
-- the office, not a secret. Whether they may BORROW is a different question,
-- answered by the library add-on in request_borrow.
drop policy if exists library_shelf_select on library_shelf;
create policy library_shelf_select on library_shelf for select to authenticated
  using ((select current_member_is_active()) or (select is_admin()) or (select is_super_admin()));

-- Writes go through the functions below.

/**
 * Adds a book to the shelf, or edits one already on it.
 *
 * One function for both because the form is the same form and the checks are
 * the same checks. p_id null means new.
 */
create or replace function public.save_library_book(
  p_id          bigint default null,
  p_title       text default null,
  p_author      text default null,
  p_isbn        text default null,
  p_category    text default null,
  p_description text default null,
  p_cover_path  text default null,
  p_copies      integer default 1,
  p_shelf_mark  text default null,
  p_is_active   boolean default true
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id bigint;
begin
  if not is_super_admin() then
    raise exception 'only a super admin keeps the lending shelf';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'please give the book a title';
  end if;
  if p_copies is null or p_copies < 0 then
    raise exception 'copies cannot be negative';
  end if;

  if p_id is null then
    insert into library_shelf
      (title, author, isbn, category, description, cover_path, copies, shelf_mark, is_active, added_by)
    values
      (btrim(p_title), coalesce(btrim(p_author), ''), nullif(btrim(p_isbn), ''),
       nullif(btrim(p_category), ''), nullif(btrim(p_description), ''),
       nullif(btrim(p_cover_path), ''), p_copies, nullif(btrim(p_shelf_mark), ''),
       coalesce(p_is_active, true), auth.uid())
    returning id into v_id;
  else
    update library_shelf
    set title       = btrim(p_title),
        author      = coalesce(btrim(p_author), ''),
        isbn        = nullif(btrim(p_isbn), ''),
        category    = nullif(btrim(p_category), ''),
        description = nullif(btrim(p_description), ''),
        -- A null cover path leaves the existing cover alone; clearing one is
        -- done by passing an empty string, so editing the title does not lose
        -- the picture.
        cover_path  = case
                        when p_cover_path is null then cover_path
                        else nullif(btrim(p_cover_path), '')
                      end,
        copies      = p_copies,
        shelf_mark  = nullif(btrim(p_shelf_mark), ''),
        is_active   = coalesce(p_is_active, true),
        updated_at  = now()
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'that book is not on the shelf';
    end if;
  end if;

  return v_id;
end;
$$;

/**
 * Takes a book off the shelf.
 *
 * Deleted, not hidden, only when nobody has it out and nobody ever borrowed
 * it -- otherwise it is retired instead, because a borrow request whose book
 * vanished is a row nobody can explain later.
 */
create or replace function public.remove_library_book(p_id bigint)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_used boolean;
begin
  if not is_super_admin() then
    raise exception 'only a super admin keeps the lending shelf';
  end if;

  select exists (select 1 from borrow_requests where book_id = p_id) into v_used;

  if v_used then
    update library_shelf set is_active = false, updated_at = now() where id = p_id;
    return 'retired';
  end if;

  delete from library_shelf where id = p_id;
  return 'deleted';
end;
$$;

/**
 * The shelf as a member sees it: every active book with how many are free.
 *
 * "Out" is a request that has been approved or issued and not yet returned.
 * Counting it here rather than storing it means the number cannot drift away
 * from the requests it is derived from.
 */
create or replace function public.library_shelf_books(
  p_search   text default null,
  p_category text default null,
  p_all      boolean default false
)
returns table (
  id           bigint,
  title        text,
  author       text,
  isbn         text,
  category     text,
  description  text,
  cover_path   text,
  copies       integer,
  shelf_mark   text,
  is_active    boolean,
  out_count    bigint,
  available    integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    b.id, b.title, b.author, b.isbn, b.category, b.description, b.cover_path,
    b.copies, b.shelf_mark, b.is_active,
    coalesce(o.out_count, 0),
    greatest(0, b.copies - coalesce(o.out_count, 0))::integer
  from library_shelf b
  left join lateral (
    select count(*) as out_count
    from borrow_requests r
    where r.book_id = b.id and r.status in ('approved', 'issued')
  ) o on true
  where
    (p_all or b.is_active)
    and (p_category is null or b.category = p_category)
    and (
      p_search is null
      or btrim(p_search) = ''
      or b.title ilike '%' || btrim(p_search) || '%'
      or b.author ilike '%' || btrim(p_search) || '%'
      or coalesce(b.isbn, '') ilike '%' || btrim(p_search) || '%'
    )
  order by b.title;
$$;

grant execute on function public.save_library_book(bigint, text, text, text, text, text, text, integer, text, boolean) to authenticated;
grant execute on function public.remove_library_book(bigint) to authenticated;
grant execute on function public.library_shelf_books(text, text, boolean) to authenticated;

-- Covers for the shelf. Public like the other cover buckets: these show on a
-- page every member can already open, and signing each one would mean URLs
-- that expire while the page is still up.
insert into storage.buckets (id, name, public)
values ('library-covers', 'library-covers', true)
on conflict (id) do update set public = true;

drop policy if exists library_covers_write on storage.objects;
create policy library_covers_write on storage.objects for insert to authenticated
with check (bucket_id = 'library-covers' and is_super_admin());

drop policy if exists library_covers_update on storage.objects;
create policy library_covers_update on storage.objects for update to authenticated
using (bucket_id = 'library-covers' and is_super_admin());

drop policy if exists library_covers_delete on storage.objects;
create policy library_covers_delete on storage.objects for delete to authenticated
using (bucket_id = 'library-covers' and is_super_admin());

-- Asking for a book that is on the shelf now checks the shelf: retired books
-- and books where every copy is already out are refused with a sentence
-- rather than queued for an admin to decline by hand.
do $$
declare
  v_def text := pg_get_functiondef('public.request_borrow(bigint, text, text)'::regprocedure);
  v_anchor text := '  insert into borrow_requests (member_id, book_id, title, author)';
  v_check text := $ins$  -- A book on the club's own shelf has to be there, and free. Ids in the
  -- seven millions are shelf ids; anything else came from a catalogue.
  if p_book_id >= 7000000 and p_book_id < 8000000 then
    if not exists (select 1 from library_shelf where id = p_book_id and is_active) then
      raise exception 'that book is no longer on the shelf';
    end if;
    if (
      select b.copies - count(r.*)
      from library_shelf b
      left join borrow_requests r
        on r.book_id = b.id and r.status in ('approved','issued')
      where b.id = p_book_id
      group by b.copies
    ) <= 0 then
      raise exception 'every copy is out at the moment -- please try again once one comes back';
    end if;
  end if;

$ins$;
begin
  if position(v_anchor in v_def) = 0 then
    raise exception 'request_borrow has changed shape; patch it by hand';
  end if;
  execute replace(v_def, v_anchor, v_check || v_anchor);
end;
$$;
