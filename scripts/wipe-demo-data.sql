-- Clearing the portal of everything that was there to demonstrate it.
--
-- Run once, before handing the portal over. A backup is taken first:
--   docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc -f /tmp/x.dump
--
-- What survives, deliberately:
--   * the ten clubs the club chose to keep, and every club type
--   * the lending shelf -- the club's own 20 books
--   * the shop catalogue mirrored from the store (1,336 books)
--   * settings, points rules, the join guidelines, the borrow email
--   * one account: kimivibecode@gmail.com
--
-- Accounts are NOT deleted here. They go through the Auth admin API in
-- scripts/wipe-demo-accounts.mjs, which cleans up sessions and identities
-- too; profiles cascade from auth.users, taking memberships, wishlists,
-- borrow requests and the rest with them.

begin;

-- --- 1. content ------------------------------------------------------------
-- Deleted outright rather than left to cascade from accounts: some of it
-- belongs to the admin who stays, and all of it is demonstration.

delete from discover_post_clubs;
delete from discover_likes;
delete from discover_saves;
delete from discover_posts;

delete from videos;

delete from book_order_messages;
delete from book_order_items;
delete from book_orders;

delete from payment_events;
delete from payments;

delete from borrow_requests;
delete from cart_items;
delete from book_wishlist;
delete from reading_items;

delete from session_feedback;
delete from session_bookings;
delete from member_activities;
delete from member_badges;

delete from notifications;

-- Authors, publishers and their books, including the one submitted from a
-- real address while testing.
delete from author_books;
delete from authors;
delete from publishers;

delete from club_requests;

-- --- 2. sessions -----------------------------------------------------------
-- All of them. sessions.host_club_id is RESTRICT, so this has to happen
-- before any club is removed.

delete from sessions;

-- --- 3. clubs --------------------------------------------------------------
-- The ten the club asked to keep, by name. Named rather than listed by id so
-- this file says what it does without a lookup.

delete from invites
where club_id in (
  select id from clubs
  where name not in (
    'Acorn Book Club', 'Akbar Brothers Book Club', 'Arcane', 'Aureate',
    'Entrepreneurs Reading Club', 'Ilakkiya Perarasu', 'Kids Club',
    'Subhavi', 'Teen Club', 'The Conclave CEO Club'
  )
);

delete from clubs
where name not in (
  'Acorn Book Club', 'Akbar Brothers Book Club', 'Arcane', 'Aureate',
  'Entrepreneurs Reading Club', 'Ilakkiya Perarasu', 'Kids Club',
  'Subhavi', 'Teen Club', 'The Conclave CEO Club'
);

-- --- 4. companies ----------------------------------------------------------
-- Acorn and Akbar Brothers stay; they are real and their clubs are kept.

delete from companies where name in ('Test Corp', 'Acme Lmtd');

-- --- 5. the shelf ----------------------------------------------------------
-- The twenty imported from the old database stay. This one is from testing
-- the CSV importer.

delete from library_shelf where title = 'Bulk Import Three, Revised';

-- --- 6. the audit log ------------------------------------------------------
-- It is a record of the demonstration, pointing at rows that no longer exist.

delete from admin_audit_log;

commit;

-- --- what is left ----------------------------------------------------------

\echo ''
\echo '=== clubs kept ==='
select c.name, t.name as type, c.kind from clubs c
left join club_types t on t.id = c.type_id order by c.name;

\echo ''
\echo '=== counts ==='
select 'clubs' as thing, count(*) from clubs
union all select 'club types', count(*) from club_types
union all select 'companies', count(*) from companies
union all select 'sessions', count(*) from sessions
union all select 'lending shelf', count(*) from library_shelf
union all select 'shop catalogue', count(*) from store_books
union all select 'discover posts', count(*) from discover_posts
union all select 'videos', count(*) from videos
union all select 'book orders', count(*) from book_orders
union all select 'payments', count(*) from payments
union all select 'authors', count(*) from authors
union all select 'publishers', count(*) from publishers
union all select 'notifications', count(*) from notifications
union all select 'profiles (before accounts are removed)', count(*) from profiles
order by 1;
