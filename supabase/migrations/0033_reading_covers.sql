-- ============================================================================
-- 0033 -- a cover for each book on a member's reading list
-- ============================================================================
-- Members type their reading list in by hand, and most of what they read is
-- not in the Pick a Book catalogue, so there is no cover to borrow from the
-- shop. Instead the app looks the book up on Open Library when it is added and
-- keeps the cover's numeric id here.
--
-- An id, not a URL, on purpose. reading_items is writable by its owner straight
-- through PostgREST, so a URL column would let a member point everyone who
-- views their profile at an image host of their choosing -- a tracking pixel
-- with extra steps. An integer can only ever name an Open Library cover, and
-- the app serves it through its own /api/covers route.
-- ============================================================================

alter table public.reading_items
  add column if not exists cover_id integer
    check (cover_id is null or cover_id > 0);
