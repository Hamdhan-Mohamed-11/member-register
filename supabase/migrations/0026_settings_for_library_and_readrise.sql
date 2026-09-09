-- ---------------------------------------------------------------------------
-- 0026 — the new settings become editable
-- ---------------------------------------------------------------------------
-- 0024 and 0025 added columns to app_settings but left update_app_settings
-- untouched, so the borrowing fee and the Read and Rise figures could only be
-- changed with psql. Both were deliberately made settings rather than
-- constants so that the club could change them; that is not true until the
-- form can write them.
--
-- The old signature has to be DROPPED. Adding defaulted parameters creates a
-- second overload rather than replacing the first, and PostgREST then cannot
-- tell which one a call means.
drop function if exists public.update_app_settings(numeric, int, int, int, numeric);

create or replace function public.update_app_settings(
  p_membership_fee      numeric default null,
  p_term_months         int     default null,
  p_grace_days          int     default null,
  p_expiring_soon_days  int     default null,
  p_book_discount       numeric default null,
  p_library_fee         numeric default null,
  p_library_term_months int     default null,
  p_readrise_percent    numeric default null,
  p_readrise_book_cost  numeric default null,
  p_readrise_target     int     default null,
  p_readrise_target_on  date    default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  select to_jsonb(s) into v_before from app_settings s where s.id = 1;

  update app_settings
  set membership_fee_lkr        = coalesce(p_membership_fee, membership_fee_lkr),
      membership_term_months    = coalesce(p_term_months, membership_term_months),
      renewal_grace_days        = coalesce(p_grace_days, renewal_grace_days),
      expiring_soon_days        = coalesce(p_expiring_soon_days, expiring_soon_days),
      book_discount_percent     = coalesce(p_book_discount, book_discount_percent),
      library_addon_fee_lkr     = coalesce(p_library_fee, library_addon_fee_lkr),
      library_addon_term_months = coalesce(p_library_term_months, library_addon_term_months),
      readrise_percent          = coalesce(p_readrise_percent, readrise_percent),
      readrise_book_cost_lkr    = coalesce(p_readrise_book_cost, readrise_book_cost_lkr),
      readrise_target_books     = coalesce(p_readrise_target, readrise_target_books),
      readrise_target_on        = coalesce(p_readrise_target_on, readrise_target_on),
      updated_by                = auth.uid(),
      updated_at                = now()
  where id = 1;

  perform public.write_audit('settings.update', 'app_settings', '1', v_before,
    (select to_jsonb(s) from app_settings s where s.id = 1));
end;
$$;

revoke execute on function public.update_app_settings(
  numeric, int, int, int, numeric, numeric, int, numeric, numeric, int, date
) from public;

grant execute on function public.update_app_settings(
  numeric, int, int, int, numeric, numeric, int, numeric, numeric, int, date
) to authenticated;

-- Changing readrise_percent must not rewrite history: book_orders.readrise_lkr
-- is frozen when the price is agreed, and nothing here touches it. Stated
-- explicitly because "recalculate the old ones too" is a tempting bug.
comment on column app_settings.readrise_percent is
  'Share of a book order donated to Read and Rise. Applies to orders priced from now on; book_orders.readrise_lkr is frozen at agreement time.';
