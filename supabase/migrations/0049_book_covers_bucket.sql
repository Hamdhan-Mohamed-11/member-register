-- Covers for the books authors and publishers submit.
--
-- Public, like the flyers bucket: a cover is shown on the shop page to any
-- member, and signing every one of them would mean a URL that expires while
-- the page is still open. Each creator writes only inside their own folder,
-- which is what keeps one author from replacing another's cover.

insert into storage.buckets (id, name, public)
values ('book-covers', 'book-covers', true)
on conflict (id) do update set public = true;

drop policy if exists book_covers_insert_creator on storage.objects;
create policy book_covers_insert_creator on storage.objects for insert to authenticated
with check (
  bucket_id = 'book-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists book_covers_update_creator on storage.objects;
create policy book_covers_update_creator on storage.objects for update to authenticated
using (
  bucket_id = 'book-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists book_covers_delete_creator on storage.objects;
create policy book_covers_delete_creator on storage.objects for delete to authenticated
using (
  bucket_id = 'book-covers'
  and ((storage.foldername(name))[1] = auth.uid()::text or is_super_admin())
);
