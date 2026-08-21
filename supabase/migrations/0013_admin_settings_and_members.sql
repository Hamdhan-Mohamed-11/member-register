-- Admin control over settings, points rules and member records.

-- ---------------------------------------------------------------------------
-- update_app_settings
-- ---------------------------------------------------------------------------
-- Every argument defaults to null meaning "leave alone", so the form can send
-- only what changed. There is no field here where null is a meaningful value,
-- unlike clubs.membership_fee_lkr -- these are the global fallbacks, so they
-- always have a number.
create or replace function public.update_app_settings(
  p_membership_fee     numeric default null,
  p_term_months        int     default null,
  p_grace_days         int     default null,
  p_expiring_soon_days int     default null,
  p_book_discount      numeric default null
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
  set membership_fee_lkr     = coalesce(p_membership_fee, membership_fee_lkr),
      membership_term_months = coalesce(p_term_months, membership_term_months),
      renewal_grace_days     = coalesce(p_grace_days, renewal_grace_days),
      expiring_soon_days     = coalesce(p_expiring_soon_days, expiring_soon_days),
      book_discount_percent  = coalesce(p_book_discount, book_discount_percent),
      updated_by             = auth.uid(),
      updated_at             = now()
  where id = 1;

  perform public.write_audit('settings.update', 'app_settings', '1', v_before,
    (select to_jsonb(s) from app_settings s where s.id = 1));
end;
$$;

-- ---------------------------------------------------------------------------
-- update_points_rule
-- ---------------------------------------------------------------------------
-- Changing a rule affects FUTURE activities only. Existing member_activities
-- rows keep their snapshotted points_awarded, so a balance never silently
-- moves because someone re-tuned the scoring. Re-pricing history would need a
-- separate, deliberate action.
create or replace function public.update_points_rule(p_code text, p_points int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before int;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;
  if p_points < 0 then
    raise exception 'points cannot be negative';
  end if;

  select points into v_before from points_rules where code = p_code;
  if v_before is null then
    raise exception 'unknown activity code';
  end if;

  update points_rules
  set points = p_points, updated_by = auth.uid(), updated_at = now()
  where code = p_code;

  perform public.write_audit('points_rule.update', 'points_rule', p_code,
    jsonb_build_object('points', v_before), jsonb_build_object('points', p_points));
end;
$$;

-- ---------------------------------------------------------------------------
-- Membership administration
-- ---------------------------------------------------------------------------
-- Adds a member to a club, or reactivates a lapsed membership. This is the
-- admin path -- it bypasses both the public-club approval flow and payment,
-- which is exactly why it is super-admin only and audited.
create or replace function public.admin_add_club_membership(
  p_member_id uuid,
  p_club_id   uuid,
  p_months    int default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_term  int;
  v_first boolean;
  v_id    uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  if p_months is null then
    select term_months into v_term from public.resolve_club_terms(p_club_id);
  else
    v_term := p_months;
  end if;
  v_term := coalesce(v_term, 12);

  v_first := not exists (
    select 1 from club_memberships where member_id = p_member_id and is_primary
  );

  insert into club_memberships
    (member_id, club_id, status, is_primary, joined_on, renewal_date)
  values (
    p_member_id, p_club_id, 'active', v_first, current_date,
    (current_date + (v_term || ' months')::interval)::date
  )
  on conflict (member_id, club_id) do update
    set status = 'active',
        joined_on = coalesce(club_memberships.joined_on, current_date),
        -- Extend from whichever is later, so reactivating early does not throw
        -- away time the member already paid for.
        renewal_date = (
          greatest(coalesce(club_memberships.renewal_date, current_date), current_date)
          + (v_term || ' months')::interval
        )::date
  returning id into v_id;

  perform public.write_audit('membership.add', 'club_membership', v_id::text, null,
    jsonb_build_object('member', p_member_id, 'club', p_club_id, 'months', v_term));

  return v_id;
end;
$$;

create or replace function public.admin_set_membership(
  p_membership_id uuid,
  p_status        text default null,
  p_renewal_date  date default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'not authorised';
  end if;

  select to_jsonb(m) into v_before from club_memberships m where m.id = p_membership_id;
  if v_before is null then
    raise exception 'membership not found';
  end if;

  if p_status is not null
     and p_status not in ('pending','active','expired','cancelled','rejected') then
    raise exception 'invalid membership status';
  end if;

  update club_memberships
  set status       = coalesce(p_status, status),
      renewal_date = coalesce(p_renewal_date, renewal_date)
  where id = p_membership_id;

  perform public.write_audit('membership.update', 'club_membership',
    p_membership_id::text, v_before,
    (select to_jsonb(m) from club_memberships m where m.id = p_membership_id));
end;
$$;

revoke execute on function
  public.update_app_settings(numeric, int, int, int, numeric),
  public.update_points_rule(text, int),
  public.admin_add_club_membership(uuid, uuid, int),
  public.admin_set_membership(uuid, text, date)
from public;

grant execute on function
  public.update_app_settings(numeric, int, int, int, numeric),
  public.update_points_rule(text, int),
  public.admin_add_club_membership(uuid, uuid, int),
  public.admin_set_membership(uuid, text, date)
to authenticated;

-- ---------------------------------------------------------------------------
-- admin_members -- one row per member for the admin list
-- ---------------------------------------------------------------------------
-- A view rather than a client-side join: the admin list needs the email, the
-- role, the club count and the soonest renewal together, and assembling that
-- from three round trips is both slower and easy to get subtly wrong.
--
-- security_invoker = on is ESSENTIAL. Without it the view runs as its owner
-- (which bypasses RLS) and would hand every member's row to any caller who can
-- select from it. With it, the underlying profiles policy still applies, so a
-- non-admin sees only what they could see anyway.
create or replace view admin_members
with (security_invoker = on) as
select
  p.id,
  p.email,
  p.first_name,
  p.last_name,
  p.role,
  p.status,
  p.points_balance,
  p.joined_on,
  count(m.id) filter (where m.status = 'active')            as active_clubs,
  min(m.renewal_date) filter (where m.status = 'active')    as next_renewal
from profiles p
left join club_memberships m on m.member_id = p.id
group by p.id;

revoke all on admin_members from anon, authenticated;
grant select on admin_members to authenticated;
