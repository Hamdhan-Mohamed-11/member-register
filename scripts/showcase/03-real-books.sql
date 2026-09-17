-- ============================================================================
-- Showcase prep, part 3: point demo orders, carts, wishlists and borrows at
-- books that really exist in the shop catalogue under those ids.
--
-- Earlier demo data guessed ids (1000-1011, 1042, 2001-2003) and gave them
-- titles like "Norwegian Wood" -- but in the catalogue 1000 is a Famous Five
-- graphic novel, so every page showing a cover showed the wrong one, and the
-- cart (which reads the live catalogue title) showed the wrong book.
--
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < scripts/showcase/03-real-books.sql
-- ============================================================================
begin;

create temp table remap (old_id bigint, new_id bigint, title text, author text) on commit drop;
insert into remap values
  (1000, 5908,  'Pride and Prejudice',      'Jane Austen'),
  (1001, 8869,  'Thinking, Fast and Slow',  'Daniel Kahneman'),
  (1002, 13847, 'Sapiens',                  'Yuval Noah Harari'),
  (1003, 4258,  'Educated',                 'Tara Westover'),
  (1004, 5964,  'The Kite Runner',          'Khaled Hosseini'),
  (1005, 6152,  'Little Women',             'Louisa May Alcott'),
  (1006, 10248, 'Man''s Search for Meaning', 'Viktor E. Frankl'),
  (1007, 5951,  'The Alchemist',            'Paulo Coelho'),
  (1008, 6715,  'Becoming',                 'Michelle Obama'),
  (1009, 6186,  'The Little Prince',        'Antoine de Saint-Exupéry'),
  (1010, 11913, 'Deep Work',                'Cal Newport'),
  (1011, 9737,  'The Da Vinci Code',        'Dan Brown'),
  (1042, 10304, 'The Psychology of Money',  'Morgan Housel'),
  (2001, 3489,  'Atomic Habits',            'James Clear'),
  (2002, 145,   'Ikigai',                   'Hector Garcia & Francesc Miralles'),
  (2003, 10260, 'Rich Dad Poor Dad',        'Robert T. Kiyosaki');

update book_order_items i set book_id = r.new_id, title = r.title, author = r.author
  from remap r where i.book_id = r.old_id;
update cart_items c set book_id = r.new_id, title = r.title, author = r.author
  from remap r where c.book_id = r.old_id;
update book_wishlist w set book_id = r.new_id, title = r.title, author = r.author
  from remap r where w.book_id = r.old_id;
update borrow_requests b set book_id = r.new_id, title = r.title, author = r.author
  from remap r where b.book_id = r.old_id;

-- Words that named the old titles.
update book_order_messages
   set body = replace(replace(body, 'Half of a Yellow Sun', 'Becoming'), 'hardcover for Becoming', 'hardcover of Becoming')
 where body like '%Half of a Yellow Sun%';
update book_orders set note = replace(note, 'Half of a Yellow Sun', 'Becoming')
 where note like '%Half of a Yellow Sun%';
update notifications set body = replace(body, 'Half of a Yellow Sun', 'Becoming')
 where body like '%Half of a Yellow Sun%';

-- Placeholder text typed into Readers Summit while testing.
update sessions
   set book_title = 'Readers'' choice',
       book_author = 'Members from every club',
       location = 'Colombo Public Library, Reading Hall'
 where id = 'a7ac81c6-e101-4aca-a1b5-4f04c2a4804c'
   and book_title = 'sadasd';

update sessions
   set notes = 'A whole afternoon for readers from every Pick a Book club: short talks, a panel on what we read this year, and plenty of time to meet people from other clubs.'
 where id = 'a7ac81c6-e101-4aca-a1b5-4f04c2a4804c'
   and notes like 'An evening on sadasd%';

commit;

select 'cart', m.email, c.title from cart_items c join profiles m on m.id = c.member_id
 where m.email in ('member@test.pickabook.lk', 'secretary@test.pickabook.lk');
select 'summit', book_title, location from sessions where id = 'a7ac81c6-e101-4aca-a1b5-4f04c2a4804c';
