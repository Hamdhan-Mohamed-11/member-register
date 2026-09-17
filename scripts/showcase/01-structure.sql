-- ============================================================================
-- Showcase prep, part 1: roles, session times, the session calendar.
--
-- One transaction. Run on the VPS:
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < scripts/showcase/01-structure.sql
-- ============================================================================
begin;

-- --- 1. Session times ------------------------------------------------------
-- Every session was stored with its typed time read as UTC (the app parsed
-- datetime-local in the server's zone). Shift them back so each shows the
-- time it was typed with, now that the app reads times as Sri Lanka time.
update sessions set held_at = held_at - interval '5 hours 30 minutes';

-- --- 2. Ishara runs her own club ------------------------------------------
-- Colombo Poetry Circle loses its secretary; Pick a Book Public Club's
-- previous secretary (a test account) goes back to being a member.
update clubs set secretary_id = null
 where id in ('477a7421-fad9-469f-884a-41ef5c3038ae', '15c7eb12-023c-4fcb-ab54-57f6d1e7e7ff');
update profiles set role = 'member'
 where id = '06df8a5b-cdd6-438d-9b3d-38070d37f99b' and role = 'secretary';
update clubs set secretary_id = '0a28a13f-3419-45fb-9971-28d0d77c0605'
 where id = '15c7eb12-023c-4fcb-ab54-57f6d1e7e7ff';
update profiles set role = 'secretary'
 where id = '0a28a13f-3419-45fb-9971-28d0d77c0605';

-- --- 3. Super admins are not members ----------------------------------------
-- Their points recompute to zero through the member_activities trigger.
create temp table admins on commit drop as
  select id from profiles where role = 'super_admin';
delete from session_bookings  where member_id in (select id from admins);
delete from member_activities where member_id in (select id from admins);
delete from reading_items     where member_id in (select id from admins);
delete from book_wishlist     where member_id in (select id from admins);
delete from cart_items        where member_id in (select id from admins);
delete from borrow_requests   where member_id in (select id from admins);
delete from discover_likes    where member_id in (select id from admins);
delete from discover_saves    where member_id in (select id from admins);
delete from member_badges     where member_id in (select id from admins);
delete from club_memberships  where member_id in (select id from admins);
update profiles set points_balance = 0 where id in (select id from admins);

-- --- 4. The calendar: some past, some coming up ------------------------------
-- Readers Summit and Game Night move into the coming weeks.
update sessions set held_at = '2026-09-26 17:30+05:30', status = 'scheduled'
 where id = 'a7ac81c6-e101-4aca-a1b5-4f04c2a4804c';
update sessions set held_at = '2026-09-19 18:00+05:30', status = 'scheduled',
       location = 'The Commons, Park Street Mews, Colombo 2'
 where id = 'b2347f97-7f33-4790-8e19-1dc1105a93bb';

-- Four new sessions: three coming up, and one just past with its attendance
-- still to record (something for the secretary's dashboard).
insert into sessions (id, host_club_id, title, book_title, book_author, held_at, location,
                      presenter_member_id, pricing_kind, guest_fee_lkr, capacity, status,
                      label, tagline, notes, highlights, created_by)
values
  ('6bcbc1c3-2bfc-4a0d-9a7e-6406e2cae6f3', '15c7eb12-023c-4fcb-ab54-57f6d1e7e7ff',
   'An Evening with Maali Almeida', 'The Seven Moons of Maali Almeida', 'Shehan Karunatilaka',
   '2026-10-03 18:30+05:30', 'Barefoot Garden Café, Colombo 3',
   '01da20f9-4d76-4e1a-bcdc-358044d678d5', 'free', null, 40, 'scheduled',
   'Author spotlight',
   'Ghosts, war photographs and the darkest, funniest novel Sri Lanka has produced.',
   E'Nimali leads us through the Booker-winning story of a war photographer who wakes up dead and has seven moons to find out who killed him.\n\nShe will read two short passages, walk through the history the book leans on, and then open the floor. Finished it, halfway through, or never started — come along.',
   array['A close reading of two key chapters', 'The history behind the story', 'Open discussion over tea'],
   '0a28a13f-3419-45fb-9971-28d0d77c0605'),

  ('bcd2f61f-e0b0-471a-9cba-e3058047610e', '15c7eb12-023c-4fcb-ab54-57f6d1e7e7ff',
   'Poetry & Tea: A Reading-Aloud Night', 'Poems we love', 'Chosen by members',
   '2026-10-10 18:00+05:30', 'The Commons, Park Street Mews, Colombo 2',
   'caf36d27-60c3-4456-85bc-816918c116f9', 'free', null, 25, 'scheduled',
   'Members night',
   'Bring one poem you love and read it to the room.',
   E'No homework, no lectures. Everyone brings a poem — in English, Sinhala or Tamil — and reads it aloud. Sanduni opens with a few of her favourites and keeps the evening moving.\n\nTea and short eats on the club.',
   array['Poems in three languages', 'Everyone reads, nobody performs', 'Tea and short eats'],
   '0a28a13f-3419-45fb-9971-28d0d77c0605'),

  ('69871c2a-ccae-4395-8c7e-3a0a59757587', '477a7421-fad9-469f-884a-41ef5c3038ae',
   'Island of a Thousand Mirrors', 'Island of a Thousand Mirrors', 'Nayomi Munaweera',
   '2026-10-01 18:30+05:30', 'Colombo Public Library, Reading Hall',
   'e5b39d8b-b340-452f-a180-fe077043bf49', 'paid', 750, 30, 'scheduled',
   'Book circle',
   'Two families, one island, and the war that runs between them.',
   E'Tharindu presents Nayomi Munaweera''s debut, told by two girls on opposite sides of the conflict. We will talk about memory, migration and who gets to tell the story.\n\nFree for circle members; guests from other clubs are welcome for a small fee.',
   array['Two narrators, two sides', 'Memory and migration', 'Readers from other clubs'],
   'd87f8292-aeb9-4d3a-8038-31d1bd402189'),

  ('6301be7b-4da6-4500-a643-78ca0eff3189', '15c7eb12-023c-4fcb-ab54-57f6d1e7e7ff',
   'September Book Swap', 'Bring a book, take a book', '',
   '2026-09-12 18:30+05:30', 'The club room, Colombo 5',
   'bb747577-dfa9-4510-bc51-004eca6db28a', 'free', null, 50, 'scheduled',
   'Book swap',
   'Bring a book you loved, leave with one someone else did.',
   E'Our quarterly swap night. Bring a book in good condition with a note inside saying why you loved it, and take home something new. Ruwan hosts and keeps the pile moving.',
   array['Forty books on the table', 'A note inside every book', 'Tea and conversation'],
   '0a28a13f-3419-45fb-9971-28d0d77c0605');

-- Bookings. Status confirmed, no fee: everyone booked is a member of the
-- host club.
insert into session_bookings (session_id, member_id, status, fee_lkr, booked_at, confirmed_at)
select s, m, 'confirmed', 0, now() - (random() * interval '10 days'), now() - (random() * interval '9 days')
from (values
  ('6bcbc1c3-2bfc-4a0d-9a7e-6406e2cae6f3'::uuid, '01da20f9-4d76-4e1a-bcdc-358044d678d5'::uuid),
  ('6bcbc1c3-2bfc-4a0d-9a7e-6406e2cae6f3', '0a28a13f-3419-45fb-9971-28d0d77c0605'),
  ('6bcbc1c3-2bfc-4a0d-9a7e-6406e2cae6f3', 'bb747577-dfa9-4510-bc51-004eca6db28a'),
  ('6bcbc1c3-2bfc-4a0d-9a7e-6406e2cae6f3', 'a7fba725-962c-47fd-aeb4-e1ab01654055'),
  ('6bcbc1c3-2bfc-4a0d-9a7e-6406e2cae6f3', 'caf36d27-60c3-4456-85bc-816918c116f9'),
  ('bcd2f61f-e0b0-471a-9cba-e3058047610e', '0a28a13f-3419-45fb-9971-28d0d77c0605'),
  ('bcd2f61f-e0b0-471a-9cba-e3058047610e', 'a7fba725-962c-47fd-aeb4-e1ab01654055'),
  ('bcd2f61f-e0b0-471a-9cba-e3058047610e', 'caf36d27-60c3-4456-85bc-816918c116f9'),
  ('69871c2a-ccae-4395-8c7e-3a0a59757587', '01da20f9-4d76-4e1a-bcdc-358044d678d5'),
  ('69871c2a-ccae-4395-8c7e-3a0a59757587', '3c7406f2-21a9-4510-a395-b2bb41d3e8fe'),
  ('69871c2a-ccae-4395-8c7e-3a0a59757587', '3f52102d-5ebf-4dab-9e00-8729002c4a4c'),
  ('69871c2a-ccae-4395-8c7e-3a0a59757587', '11d61b86-729c-43e0-a7d8-254de2bb5010'),
  ('6301be7b-4da6-4500-a643-78ca0eff3189', '01da20f9-4d76-4e1a-bcdc-358044d678d5'),
  ('6301be7b-4da6-4500-a643-78ca0eff3189', 'bb747577-dfa9-4510-bc51-004eca6db28a'),
  ('6301be7b-4da6-4500-a643-78ca0eff3189', 'a7fba725-962c-47fd-aeb4-e1ab01654055'),
  ('6301be7b-4da6-4500-a643-78ca0eff3189', 'caf36d27-60c3-4456-85bc-816918c116f9'),
  ('6301be7b-4da6-4500-a643-78ca0eff3189', '0a28a13f-3419-45fb-9971-28d0d77c0605'),
  ('b2347f97-7f33-4790-8e19-1dc1105a93bb', 'bb747577-dfa9-4510-bc51-004eca6db28a'),
  ('b2347f97-7f33-4790-8e19-1dc1105a93bb', '0a28a13f-3419-45fb-9971-28d0d77c0605'),
  ('a7ac81c6-e101-4aca-a1b5-4f04c2a4804c', '01da20f9-4d76-4e1a-bcdc-358044d678d5'),
  ('a7ac81c6-e101-4aca-a1b5-4f04c2a4804c', 'e5b39d8b-b340-452f-a180-fe077043bf49'),
  ('a7ac81c6-e101-4aca-a1b5-4f04c2a4804c', '3c7406f2-21a9-4510-a395-b2bb41d3e8fe')
) as b(s, m)
on conflict (session_id, member_id) do nothing;

-- Ishara's own profile.
update profiles
   set bio = 'Secretary of the Pick a Book Public Club. Reads Sri Lankan fiction, poetry, and far too many cookbooks.'
 where id = '0a28a13f-3419-45fb-9971-28d0d77c0605' and coalesce(bio, '') = '';

commit;

select 'secretary', c.name, p.email from clubs c join profiles p on p.id = c.secretary_id;
select 'admin points', email, points_balance from profiles where role = 'super_admin';
select 'upcoming', title, to_char(held_at at time zone 'Asia/Colombo', 'DD Mon HH24:MI')
  from sessions where held_at > now() order by held_at;
