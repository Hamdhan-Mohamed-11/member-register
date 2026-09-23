-- The guidelines have to be readable by someone who has no account yet: /join
-- is the page where they agree to them, and it is signed out. app_settings is
-- readable only by authenticated, and it holds more than this (fees, the Read
-- and Rise target), so rather than open the whole row to anon this hands out
-- the one column.

create or replace function public.public_join_guidelines()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select join_guidelines from app_settings where id = 1;
$$;

grant execute on function public.public_join_guidelines() to anon, authenticated;
