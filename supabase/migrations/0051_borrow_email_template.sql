-- The borrow approval email, in the club's own words.
--
-- The wording was in the code, which meant every change to it was a deploy.
-- It now lives beside the collection place it already quotes, with
-- placeholders the app fills in. An empty value falls back to the built-in
-- text rather than sending an empty email.

alter table app_settings
  add column if not exists borrow_email_subject text,
  add column if not exists borrow_email_body    text;

update app_settings
set borrow_email_subject = coalesce(nullif(btrim(borrow_email_subject), ''),
                                    '{book} is ready to collect'),
    borrow_email_body = coalesce(nullif(btrim(borrow_email_body), ''), trim(both from
$b$Hello {name},

Your borrow request for {book} has been approved.

Come to {place} to pick it up, and bring your member details.

{due_line}

If you no longer need it, cancel from your borrowing page so someone else can take it.$b$))
where id = 1;

/**
 * The written settings: the collection place, the join guidelines, and the
 * words of the borrow approval email.
 *
 * Replaces the two-argument version. The subject and body are optional: null
 * or blank leaves the app's own wording in place, which is what stops a
 * cleared box from sending members an empty message.
 */
create or replace function public.update_app_texts(
  p_library_collect_at   text,
  p_join_guidelines      text,
  p_borrow_email_subject text default null,
  p_borrow_email_body    text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_super_admin() then
    raise exception 'only a super admin can change this';
  end if;

  update app_settings
  set library_collect_at   = nullif(btrim(p_library_collect_at), ''),
      join_guidelines      = nullif(btrim(p_join_guidelines), ''),
      borrow_email_subject = nullif(btrim(p_borrow_email_subject), ''),
      borrow_email_body    = nullif(btrim(p_borrow_email_body), '')
  where id = 1;
end;
$$;

drop function if exists public.update_app_texts(text, text);

grant execute on function public.update_app_texts(text, text, text, text) to authenticated;
