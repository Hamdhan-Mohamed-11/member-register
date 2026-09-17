-- Fills in label, tagline, description and "what to expect" for sessions that
-- have none yet, so the session page can be seen with real-looking content.
--
-- Only touches blank fields: anything a secretary has written is left alone.
-- The choice of wording is taken from a hash of the session id, so it varies
-- between sessions but is the same every time this is run.
--
-- Run on the VPS:
--   docker exec -i supabase-db psql -U postgres -d postgres < scripts/seed-session-details.sql

with picked as (
  select
    s.id,
    abs(hashtext(s.id::text)) as h,
    nullif(s.book_title, '') as book,
    nullif(s.book_author, '') as author
  from sessions s
)
update sessions s
set
  label = coalesce(
    s.label,
    (array['Book evening', 'Special event', 'Author spotlight', 'Discussion circle', 'Members night'])
      [1 + p.h % 5]
  ),
  tagline = coalesce(
    s.tagline,
    (array[
      'Ideas, stories and meaningful conversations.',
      'One book, many readings, and an evening to share them.',
      'Come for the book, stay for the conversation.',
      'A slow evening with a good book and good company.'
    ])[1 + (p.h / 5) % 4]
  ),
  notes = case
    when coalesce(btrim(s.notes), '') <> '' then s.notes
    when p.book is not null then
      format(
        'An evening on %s%s. The presenter walks us through what stayed with them, reads a passage or two, and opens it up to the room. Whether you have finished the book, are halfway through, or have not started, you are welcome.',
        p.book,
        coalesce(' by ' || p.author, '')
      )
    else
      'A relaxed evening with fellow readers: a short talk, an open discussion, and time to meet the people behind the reading lists.'
  end,
  highlights = case
    when cardinality(s.highlights) > 0 then s.highlights
    when (p.h / 7) % 4 = 0 then array['Thoughtful discussion', 'Fresh perspectives', 'A community of readers']
    when (p.h / 7) % 4 = 1 then array['A reading from the book', 'Questions for the presenter', 'Tea and conversation']
    when (p.h / 7) % 4 = 2 then array['A short talk on the author', 'Open floor for your take', 'Book swap after']
    else array['Themes that stay with you', 'Readers from other clubs', 'Recommendations to take home']
  end
from picked p
where p.id = s.id
  and (
    s.label is null
    or s.tagline is null
    or coalesce(btrim(s.notes), '') = ''
    or cardinality(s.highlights) = 0
  );
