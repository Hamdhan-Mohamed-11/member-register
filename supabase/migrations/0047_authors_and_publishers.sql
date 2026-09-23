-- Authors and publishers.
--
-- An author writes books and wants them in front of the club's members; a
-- publisher does the same on behalf of the authors on its list. Neither is a
-- club member -- they do not attend sessions, earn points or borrow -- so they
-- get their own role on profiles and their own area of the portal, and the
-- member pages stay closed to them the way the admin's are.
--
-- Their books are sold the way every other book is: the member adds it to the
-- cart, the club quotes and fulfils the order. So an author book needs a
-- book_id that cannot collide with the shop's, which is what the sequence
-- below is for -- the legacy catalogue's ids are in the tens of thousands and
-- these start at nine million.

-- --- the roles -------------------------------------------------------------

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('member','secretary','club_admin','super_admin','author','publisher'));

-- The notification kinds these functions raise. The check constraint is an
-- allow-list, so a kind that is not in it makes the insert -- and the whole
-- registration or decision -- fail.

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (
  kind in (
    'video.approved','video.rejected','join.approved','join.rejected',
    'payment.received','points.awarded','membership.added','membership.changed',
    'role.changed','account.status','badge.earned','borrow.updated','borrow.rejected',
    'library.activated','order.placed','order.quoted','order.agreed','order.message',
    'order.paid',
    'creator.registered','creator.book_submitted','creator.decision'
  )
);

-- --- publishers ------------------------------------------------------------

create table if not exists publishers (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles(id) on delete cascade,
  name         text not null,
  about        text,
  website      text,
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  decline_reason text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references profiles(id) on delete set null
);

create unique index if not exists publishers_owner_idx on publishers (owner_id);

-- --- authors ---------------------------------------------------------------
--
-- owner_id is the author's own login, and is null for an author a publisher
-- listed but who does not sign in. publisher_id is the house they are under,
-- and is null for an author who registered alone. One of the two has to be
-- there: a row with neither belongs to nobody.

create table if not exists authors (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references profiles(id) on delete cascade,
  publisher_id uuid references publishers(id) on delete cascade,
  name         text not null,
  bio          text,
  photo_path   text,
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  decline_reason text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references profiles(id) on delete set null,
  constraint authors_has_an_owner check (owner_id is not null or publisher_id is not null)
);

create unique index if not exists authors_owner_idx on authors (owner_id) where owner_id is not null;
create index if not exists authors_publisher_idx on authors (publisher_id);

-- --- the books -------------------------------------------------------------

create sequence if not exists author_books_id_seq as bigint start with 9000000 increment by 1;

create table if not exists author_books (
  id            bigint primary key default nextval('author_books_id_seq'),
  author_id     uuid not null references authors(id) on delete cascade,
  publisher_id  uuid references publishers(id) on delete set null,
  submitted_by  uuid references profiles(id) on delete set null,
  title         text not null,
  blurb         text,
  isbn          text,
  price_lkr     numeric(12,2) not null check (price_lkr >= 0),
  cover_path    text,
  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected','withdrawn')),
  decline_reason text,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references profiles(id) on delete set null
);

create index if not exists author_books_author_idx on author_books (author_id, created_at desc);
create index if not exists author_books_status_idx on author_books (status, created_at desc);

-- --- who is who ------------------------------------------------------------

create or replace function public.my_author_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from authors where owner_id = auth.uid();
$$;

create or replace function public.my_publisher_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from publishers where owner_id = auth.uid();
$$;

-- --- row level security ----------------------------------------------------

alter table publishers   enable row level security;
alter table authors      enable row level security;
alter table author_books enable row level security;

drop policy if exists publishers_select on publishers;
create policy publishers_select on publishers for select to authenticated
  using (owner_id = (select auth.uid()) or (select is_super_admin()));

drop policy if exists authors_select on authors;
create policy authors_select on authors for select to authenticated
  using (
    owner_id = (select auth.uid())
    or publisher_id = (select my_publisher_id())
    or (select is_super_admin())
    -- An approved author is a public name: their books carry it in the shop.
    or status = 'approved'
  );

-- Members need to see an approved book to buy it; its author and publisher
-- need to see their own whatever its state; nobody else sees a rejected one.
drop policy if exists author_books_select on author_books;
create policy author_books_select on author_books for select to authenticated
  using (
    status = 'approved'
    or (select is_super_admin())
    or author_id = (select my_author_id())
    or publisher_id = (select my_publisher_id())
  );

-- Every write goes through the functions below, which is why there is no
-- insert or update policy: a creator cannot set their own status.

/**
 * Registers the signed-in account as an author or a publisher.
 *
 * The account exists already -- they signed up like anyone else -- and this
 * turns it into a creator account waiting for approval. The role changes
 * immediately so the portal shows them the right thing; what waits for a
 * super admin is the listing, not the login.
 */
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

  if exists (select 1 from authors where owner_id = v_me)
     or exists (select 1 from publishers where owner_id = v_me) then
    raise exception 'this account is already registered';
  end if;

  if p_kind = 'publisher' then
    insert into publishers (owner_id, name, about, website)
    values (v_me, btrim(p_name), nullif(btrim(p_about), ''), nullif(btrim(p_website), ''))
    returning id into v_id;
    update profiles set role = 'publisher' where id = v_me;
  else
    insert into authors (owner_id, name, bio)
    values (v_me, btrim(p_name), nullif(btrim(p_about), ''))
    returning id into v_id;
    update profiles set role = 'author' where id = v_me;
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

/**
 * A publisher adds an author to its list.
 *
 * The author has no login: the publisher submits their books. An author who
 * wants their own dashboard registers themselves instead.
 */
create or replace function public.publisher_add_author(
  p_name text,
  p_bio  text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pub uuid := my_publisher_id();
  v_id  uuid;
begin
  if v_pub is null then
    raise exception 'not a publisher';
  end if;
  if (select status from publishers where id = v_pub) <> 'approved' then
    raise exception 'your publisher account is still being reviewed';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'please give the author a name';
  end if;

  -- An author a publisher adds is approved with the publisher's standing: the
  -- house was vetted, and asking a super admin to vet every name on its list
  -- would make a publisher account no better than a stack of author accounts.
  insert into authors (publisher_id, name, bio, status, decided_at)
  values (v_pub, btrim(p_name), nullif(btrim(p_bio), ''), 'approved', now())
  returning id into v_id;

  return v_id;
end;
$$;

/**
 * Submits a book for the shop. Always starts pending: a super admin decides
 * what the club sells, as they do for everything else in the catalogue.
 */
create or replace function public.submit_author_book(
  p_author_id  uuid,
  p_title      text,
  p_price_lkr  numeric,
  p_blurb      text default null,
  p_isbn       text default null,
  p_cover_path text default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me     uuid := auth.uid();
  v_author record;
  v_pub    uuid := my_publisher_id();
  v_id     bigint;
begin
  select * into v_author from authors where id = p_author_id;
  if v_author is null then
    raise exception 'unknown author';
  end if;

  -- Either it is your own name, or it is a name on your list.
  if not (v_author.owner_id = v_me or (v_pub is not null and v_author.publisher_id = v_pub)) then
    raise exception 'not your author';
  end if;
  if v_author.status <> 'approved' then
    raise exception 'this author is still being reviewed';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'please give the book a title';
  end if;
  if p_price_lkr is null or p_price_lkr < 0 then
    raise exception 'please give a price';
  end if;

  insert into author_books
    (author_id, publisher_id, submitted_by, title, blurb, isbn, price_lkr, cover_path)
  values
    (p_author_id, v_author.publisher_id, v_me, btrim(p_title), nullif(btrim(p_blurb), ''),
     nullif(btrim(p_isbn), ''), p_price_lkr, nullif(btrim(p_cover_path), ''))
  returning id into v_id;

  insert into notifications (member_id, kind, title, body, href)
  select p.id, 'creator.book_submitted',
         btrim(p_title) || ' was submitted for the shop',
         v_author.name || ' is waiting for a decision.',
         '/admin/creators'
  from profiles p where p.role = 'super_admin';

  return v_id;
end;
$$;

/** A creator withdraws their own book from the shop. */
create or replace function public.withdraw_author_book(p_book_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_book record;
begin
  select * into v_book from author_books where id = p_book_id;
  if v_book is null then
    raise exception 'unknown book';
  end if;
  if not (
    v_book.author_id = my_author_id()
    or (my_publisher_id() is not null and v_book.publisher_id = my_publisher_id())
  ) then
    raise exception 'not your book';
  end if;

  update author_books set status = 'withdrawn' where id = p_book_id;
end;
$$;

/**
 * A super admin's decision on an author, a publisher or a book.
 *
 * One function for the three because the decision is the same shape and the
 * audit row should be too; splitting it into three would mean three places to
 * forget to notify the person waiting.
 */
create or replace function public.decide_creator(
  p_kind    text,
  p_id      text,
  p_approve boolean,
  p_reason  text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status text := case when p_approve then 'approved' else 'rejected' end;
  v_owner  uuid;
  v_name   text;
  v_href   text := '/creator';
begin
  if not is_super_admin() then
    raise exception 'only a super admin can decide this';
  end if;
  if not p_approve and coalesce(btrim(p_reason), '') = '' then
    raise exception 'please say why';
  end if;

  if p_kind = 'publisher' then
    update publishers
    set status = v_status, decline_reason = nullif(btrim(p_reason), ''),
        decided_at = now(), decided_by = auth.uid()
    where id = p_id::uuid
    returning owner_id, name into v_owner, v_name;

  elsif p_kind = 'author' then
    update authors
    set status = v_status, decline_reason = nullif(btrim(p_reason), ''),
        decided_at = now(), decided_by = auth.uid()
    where id = p_id::uuid
    returning owner_id, name into v_owner, v_name;

  elsif p_kind = 'book' then
    update author_books b
    set status = v_status, decline_reason = nullif(btrim(p_reason), ''),
        decided_at = now(), decided_by = auth.uid()
    where b.id = p_id::bigint
    returning coalesce(b.submitted_by, (select a.owner_id from authors a where a.id = b.author_id)),
              b.title
    into v_owner, v_name;
    v_href := '/creator/books';

  else
    raise exception 'unknown kind';
  end if;

  if v_name is null then
    raise exception 'not found';
  end if;

  if v_owner is not null then
    insert into notifications (member_id, kind, title, body, href)
    values (
      v_owner,
      'creator.decision',
      v_name || (case when p_approve then ' was approved' else ' was not approved' end),
      coalesce(nullif(btrim(p_reason), ''),
               case when p_approve then 'It is live for members now.' else 'No reason was given.' end),
      v_href
    );
  end if;
end;
$$;

/**
 * What a creator's books have sold.
 *
 * Counted from the orders the club actually filled, not from carts: a book in
 * a cart is not a sale, and an order that was declined is not one either.
 * Returned as a function rather than a view so the author_books row can be
 * checked against the caller without a policy that would also have to be
 * written on book_order_items -- which members must never see for each other.
 */
create or replace function public.author_book_sales(p_author_id uuid default null)
returns table (
  book_id      bigint,
  title        text,
  author_name  text,
  status       text,
  price_lkr    numeric,
  copies_sold  bigint,
  revenue_lkr  numeric,
  last_sold_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    b.id,
    b.title,
    a.name,
    b.status,
    b.price_lkr,
    coalesce(sum(i.quantity), 0)::bigint,
    coalesce(sum(i.quantity * coalesce(i.agreed_unit_price_lkr, i.asking_unit_price_lkr)), 0)::numeric,
    max(o.fulfilled_at)
  from author_books b
  join authors a on a.id = b.author_id
  left join book_order_items i on i.book_id = b.id
  left join book_orders o on o.id = i.order_id and o.status in ('paid','fulfilled')
  where
    (p_author_id is null or b.author_id = p_author_id)
    and (
      is_super_admin()
      or b.author_id = my_author_id()
      or (my_publisher_id() is not null and b.publisher_id = my_publisher_id())
    )
  group by b.id, b.title, a.name, b.status, b.price_lkr
  order by b.created_at desc;
$$;

grant execute on function public.my_author_id() to authenticated;
grant execute on function public.my_publisher_id() to authenticated;
grant execute on function public.register_creator(text, text, text, text) to authenticated;
grant execute on function public.publisher_add_author(text, text) to authenticated;
grant execute on function public.submit_author_book(uuid, text, numeric, text, text, text) to authenticated;
grant execute on function public.withdraw_author_book(bigint) to authenticated;
grant execute on function public.decide_creator(text, text, boolean, text) to authenticated;
grant execute on function public.author_book_sales(uuid) to authenticated;
