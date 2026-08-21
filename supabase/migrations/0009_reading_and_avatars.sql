-- Reading lists and profile photos.

-- ---------------------------------------------------------------------------
-- reading_items
-- ---------------------------------------------------------------------------
-- Books are FREE TEXT here on purpose -- members type a title and author. This
-- is unrelated to the legacy shop catalogue (which arrives in a later phase as
-- a read-only MySQL feed); someone reading a book they own should not have to
-- find it in a shop first.
create table reading_items (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references profiles(id) on delete cascade,
  title      text not null,
  author     text not null default '',
  status     text not null default 'reading'
               check (status in ('want_to_read','reading','read')),
  date_read  date,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The member marks their own book read, and date_read is what "read" MEANS.
  -- Keeping the two in lockstep stops a reading history full of undated
  -- entries that cannot be ordered.
  constraint reading_items_read_date_ck
    check ((status = 'read') = (date_read is not null))
);

create index reading_items_member_status_idx on reading_items(member_id, status);
create index reading_items_history_idx
  on reading_items(member_id, date_read desc) where status = 'read';

create trigger reading_items_touch_updated_at
  before update on reading_items
  for each row execute function touch_updated_at();

alter table reading_items enable row level security;
revoke all on reading_items from anon, authenticated;
grant select, insert, update, delete on reading_items to authenticated;

-- Reading lists are visible to anyone who can see the member -- that is the
-- whole point of a member profile. can_view_member() carries the shared-club
-- rule so it lives in one place.
create policy reading_items_select on reading_items
for select to authenticated
using (
  member_id = (select auth.uid())
  or public.can_view_member(member_id)
);

-- with check on INSERT and BOTH clauses on UPDATE: `using` decides which rows
-- you may target, `with check` decides what they may look like afterwards.
-- Without the check clause a member could reassign their own row to someone
-- else by updating member_id.
create policy reading_items_insert_own on reading_items
for insert to authenticated
with check (member_id = (select auth.uid()));

create policy reading_items_update_own on reading_items
for update to authenticated
using (member_id = (select auth.uid()))
with check (member_id = (select auth.uid()));

create policy reading_items_delete_own on reading_items
for delete to authenticated
using (member_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- avatars bucket
-- ---------------------------------------------------------------------------
-- PRIVATE, deliberately. A public bucket would make every member's photo
-- fetchable by anyone who can guess a uuid, which quietly defeats the whole
-- directory visibility rule -- a company employee's face should not be
-- reachable by a stranger just because the path is unguessable-ish.
--
-- Reads go through /api/avatars/[profileId], which checks visibility and then
-- redirects to a short-lived signed URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', false,
  2 * 1024 * 1024,                       -- 2MB; the client re-encodes to ~512px
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects are stored as `<member uuid>/<filename>`, so the first path segment
-- IS the owner. This is only possible because profiles.id = auth.users.id --
-- with a separate user_id column these policies would need a lookup.
create policy avatars_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy avatars_update_own on storage.objects
for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy avatars_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Direct SELECT is granted only for your OWN folder. Everyone else's photo is
-- reached through the signed-URL route, never by listing the bucket.
create policy avatars_select_own on storage.objects
for select to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
