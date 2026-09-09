-- ---------------------------------------------------------------------------
-- 0025 — buying books, with the price agreed before any money moves
-- ---------------------------------------------------------------------------
--
-- THE SECURITY CONSTRAINT that shapes everything here:
--
-- Book prices live in a MySQL database on another host. Postgres cannot reach
-- it, so the prices on an order arrive from the member's own session -- and a
-- member can call PostgREST directly with whatever numbers they like.
--
-- So a member-submitted price is treated as a REQUEST, never as a price. It is
-- stored as `asking_unit_price_lkr` and is used for exactly one thing: showing
-- the admin what the member thinks they are paying. Payment is gated on
-- `agreed_total_lkr`, which only set_book_order_price() can write and which
-- only an admin may call. Submitting a Rs. 1 order therefore achieves nothing
-- except showing an admin a Rs. 1 order.
--
-- That also happens to be exactly the flow the club asked for: every order is
-- reviewed, the admin either accepts the price or says what it really is, and
-- the member then accepts or declines without penalty.
-- ---------------------------------------------------------------------------

-- Read and Rise: a share of every purchase funds books for schools. Settings
-- rather than constants, so the club can change the share, what a donated book
-- costs, and the campaign target without a deployment.
alter table app_settings
  add column if not exists readrise_percent numeric(5,2) not null default 10.00,
  add column if not exists readrise_book_cost_lkr numeric(12,2) not null default 500.00,
  add column if not exists readrise_target_books int not null default 100000,
  add column if not exists readrise_target_on date not null default date '2027-12-31';

alter table app_settings drop constraint if exists app_settings_readrise_check;
alter table app_settings add constraint app_settings_readrise_check
  check (readrise_percent >= 0 and readrise_percent <= 100
         and readrise_book_cost_lkr > 0
         and readrise_target_books > 0);

-- ---------------------------------------------------------------------------
-- The cart
-- ---------------------------------------------------------------------------
-- Server-side rather than in localStorage: a member adds on their phone and
-- checks out on a laptop, and a cart that silently differs between the two is
-- worse than no cart. Title and author are snapshots for the same reason the
-- wishlist snapshots them -- the catalogue host is not always up.
create table if not exists cart_items (
  member_id  uuid not null references profiles(id) on delete cascade,
  book_id    bigint not null,
  title      text not null default '',
  author     text not null default '',
  quantity   int not null default 1 check (quantity > 0 and quantity <= 20),
  added_at   timestamptz not null default now(),
  primary key (member_id, book_id)
);

alter table cart_items enable row level security;
revoke all on cart_items from anon, authenticated;
grant select, insert, update, delete on cart_items to authenticated;

drop policy if exists cart_items_own on cart_items;
create policy cart_items_own on cart_items
for all to authenticated
using (member_id = (select auth.uid()))
with check (member_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table if not exists book_orders (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid references profiles(id) on delete set null,
  status      text not null default 'review'
              check (status in ('review','quoted','agreed','paid','declined','cancelled','fulfilled')),

  -- What the member believed they were ordering. Never used to charge anyone.
  asking_total_lkr numeric(12,2) not null default 0,

  -- What an admin says it actually costs. Null until reviewed; this is the
  -- only figure a payment may be built from.
  agreed_total_lkr numeric(12,2),

  -- Frozen at the moment the price is agreed, so a later change to the
  -- settings cannot rewrite what a member was told they had donated.
  readrise_lkr numeric(12,2) not null default 0,

  -- Snapshots, like payments: an order must still say who placed it after the
  -- member row is gone.
  member_email text,
  member_name  text,

  note         text,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references profiles(id) on delete set null,
  decided_at   timestamptz,
  fulfilled_at timestamptz
);

create index if not exists book_orders_member_idx on book_orders (member_id, created_at desc);
create index if not exists book_orders_status_idx on book_orders (status, created_at desc);

create table if not exists book_order_items (
  id       uuid primary key default gen_random_uuid(),
  order_id uuid not null references book_orders(id) on delete cascade,
  book_id  bigint not null,
  title    text not null default '',
  author   text not null default '',
  quantity int not null default 1 check (quantity > 0),
  asking_unit_price_lkr numeric(12,2) not null default 0,
  agreed_unit_price_lkr numeric(12,2)
);

create index if not exists book_order_items_order_idx on book_order_items (order_id);

-- The "mode of communication" the club asked for: a thread per order, so the
-- price conversation is attached to the thing it is about rather than
-- happening over the phone and being forgotten.
create table if not exists book_order_messages (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references book_orders(id) on delete cascade,
  sender_id  uuid references profiles(id) on delete set null,
  from_admin boolean not null default false,
  body       text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now()
);

create index if not exists book_order_messages_order_idx
  on book_order_messages (order_id, created_at);

alter table book_orders enable row level security;
alter table book_order_items enable row level security;
alter table book_order_messages enable row level security;
revoke all on book_orders, book_order_items, book_order_messages from anon, authenticated;
grant select on book_orders, book_order_items, book_order_messages to authenticated;

drop policy if exists book_orders_select on book_orders;
create policy book_orders_select on book_orders
for select to authenticated
using (member_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists book_order_items_select on book_order_items;
create policy book_order_items_select on book_order_items
for select to authenticated
using (exists (
  select 1 from book_orders o
  where o.id = order_id
    and (o.member_id = (select auth.uid()) or (select public.is_admin()))
));

drop policy if exists book_order_messages_select on book_order_messages;
create policy book_order_messages_select on book_order_messages
for select to authenticated
using (exists (
  select 1 from book_orders o
  where o.id = order_id
    and (o.member_id = (select auth.uid()) or (select public.is_admin()))
));

-- No INSERT or UPDATE policies anywhere. Every write goes through an RPC,
-- because every one of them carries a rule a row policy cannot express --
-- above all "a member may not set the price they are charged".

-- ---------------------------------------------------------------------------
-- place_book_order — turns the cart into an order awaiting review
-- ---------------------------------------------------------------------------
-- p_items is [{ "book_id": 1, "title": "", "author": "", "quantity": 1,
--               "unit_price": 1234.00 }, ...], built by the server action from
-- LIVE catalogue prices. Those prices are recorded as `asking` only -- see the
-- header. Nothing here can result in a charge.
create or replace function public.place_book_order(
  p_items jsonb,
  p_note  text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := auth.uid();
  v_profile profiles%rowtype;
  v_id      uuid;
  v_item    jsonb;
  v_total   numeric(12,2) := 0;
  v_qty     int;
  v_price   numeric(12,2);
  v_count   int;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select * into v_profile from profiles where id = v_me;
  if not found or v_profile.status <> 'active' then
    raise exception 'your account is not active';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'your basket is empty';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'please order at most 50 titles at a time';
  end if;

  -- One order under review at a time. Otherwise a member can queue up a dozen
  -- and an admin has to work out which supersedes which.
  select count(*) into v_count
  from book_orders
  where member_id = v_me and status in ('review','quoted');
  if v_count > 0 then
    raise exception 'you already have an order waiting; the club will come back to you on it';
  end if;

  insert into book_orders (member_id, note, member_email, member_name)
  values (
    v_me,
    nullif(btrim(p_note), ''),
    v_profile.email,
    nullif(btrim(v_profile.first_name || ' ' || v_profile.last_name), '')
  )
  returning id into v_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty   := greatest(1, least(20, coalesce((v_item ->> 'quantity')::int, 1)));
    v_price := greatest(0, coalesce((v_item ->> 'unit_price')::numeric, 0));

    insert into book_order_items
      (order_id, book_id, title, author, quantity, asking_unit_price_lkr)
    values (
      v_id,
      (v_item ->> 'book_id')::bigint,
      coalesce(v_item ->> 'title', ''),
      coalesce(v_item ->> 'author', ''),
      v_qty,
      v_price
    );

    v_total := v_total + (v_price * v_qty);
  end loop;

  update book_orders set asking_total_lkr = v_total where id = v_id;

  delete from cart_items where member_id = v_me;

  -- Tell every admin. The club asked to be notified BEFORE a purchase is
  -- confirmed, which is what this whole status does.
  perform public.notify_member(
    p.id,
    'order.placed',
    coalesce(v_profile.first_name, 'A member') || ' wants to buy '
      || jsonb_array_length(p_items)::text || ' book'
      || case when jsonb_array_length(p_items) = 1 then '' else 's' end,
    'Asking total LKR ' || to_char(v_total, 'FM999,999,990.00'),
    '/admin/orders',
    'order:' || v_id::text
  )
  from profiles p
  where p.role in ('super_admin','secretary') and p.status = 'active';

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_book_order_price — the admin's answer, and the ONLY source of a charge
-- ---------------------------------------------------------------------------
-- p_unit_prices is [{ "item_id": uuid, "unit_price": 1234.00 }, ...]. Omitting
-- an item leaves it at what the member asked, which is the "the price is
-- right, accept as-is" case.
--
-- Status lands on 'agreed' when nothing went up, and 'quoted' when it did --
-- because only an increase needs the member to say yes again. A correction
-- DOWNWARD does not need consent, and making someone re-accept a discount is
-- a good way to lose the sale.
create or replace function public.set_book_order_price(
  p_order_id    uuid,
  p_unit_prices jsonb default '[]'::jsonb,
  p_message     text default null
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_order   book_orders%rowtype;
  v_row     jsonb;
  v_total   numeric(12,2) := 0;
  v_pct     numeric(5,2);
  v_raised  boolean := false;
  v_status  text;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  select * into v_order from book_orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if v_order.status not in ('review','quoted') then
    raise exception 'this order has already been settled';
  end if;

  -- Start every item from what the member asked, then overwrite the ones the
  -- admin actually changed.
  update book_order_items
  set agreed_unit_price_lkr = asking_unit_price_lkr
  where order_id = p_order_id;

  for v_row in select value from jsonb_array_elements(coalesce(p_unit_prices, '[]'::jsonb)) loop
    update book_order_items
    set agreed_unit_price_lkr = greatest(0, (v_row ->> 'unit_price')::numeric)
    where id = (v_row ->> 'item_id')::uuid and order_id = p_order_id;
  end loop;

  select coalesce(sum(agreed_unit_price_lkr * quantity), 0),
         bool_or(agreed_unit_price_lkr > asking_unit_price_lkr)
    into v_total, v_raised
  from book_order_items where order_id = p_order_id;

  select readrise_percent into v_pct from app_settings where id = 1;

  v_status := case when v_raised then 'quoted' else 'agreed' end;

  update book_orders
  set agreed_total_lkr = v_total,
      -- Frozen now. If the share changes next year, what this member was told
      -- they donated must not change with it.
      readrise_lkr = round(v_total * coalesce(v_pct, 0) / 100, 2),
      status = v_status,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_order_id;

  if coalesce(btrim(p_message), '') <> '' then
    insert into book_order_messages (order_id, sender_id, from_admin, body)
    values (p_order_id, auth.uid(), true, btrim(p_message));
  end if;

  perform public.notify_member(
    v_order.member_id,
    case when v_raised then 'order.quoted' else 'order.agreed' end,
    case when v_raised
         then 'The price of your order has changed'
         else 'Your order is confirmed — ready to pay' end,
    'LKR ' || to_char(v_total, 'FM999,999,990.00'),
    '/orders/' || p_order_id::text,
    'order-price:' || p_order_id::text || ':' || v_status
  );

  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- respond_to_quote — the member accepts or declines a raised price
-- ---------------------------------------------------------------------------
-- Declining is free and final: the club asked that a member be able to walk
-- away with no penalty when a price goes up, so this does not counter-offer or
-- leave anything outstanding.
create or replace function public.respond_to_quote(
  p_order_id uuid,
  p_accept   boolean
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  update book_orders
  set status = case when p_accept then 'agreed' else 'declined' end,
      decided_at = now()
  where id = p_order_id
    and member_id = v_me
    and status = 'quoted';

  if not found then
    raise exception 'there is nothing to respond to on this order';
  end if;
end;
$$;

create or replace function public.cancel_book_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update book_orders
  set status = 'cancelled', decided_at = now()
  where id = p_order_id
    and member_id = auth.uid()
    and status in ('review','quoted','agreed');

  if not found then
    raise exception 'that order can no longer be cancelled';
  end if;
end;
$$;

create or replace function public.post_order_message(p_order_id uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_order book_orders%rowtype;
  v_admin boolean := public.is_admin();
  v_id    uuid;
begin
  select * into v_order from book_orders where id = p_order_id;
  if not found then
    raise exception 'order not found';
  end if;
  if not v_admin and v_order.member_id is distinct from v_me then
    raise exception 'not authorised';
  end if;
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'write something first';
  end if;

  insert into book_order_messages (order_id, sender_id, from_admin, body)
  values (p_order_id, v_me, v_admin, btrim(left(p_body, 2000)))
  returning id into v_id;

  -- Notify the other side, never the sender.
  if v_admin then
    perform public.notify_member(v_order.member_id, 'order.message',
      'A message about your book order', left(btrim(p_body), 120),
      '/orders/' || p_order_id::text, null);
  else
    perform public.notify_member(p.id, 'order.message',
      'A member replied about their book order', left(btrim(p_body), 120),
      '/admin/orders', null)
    from profiles p
    where p.role in ('super_admin','secretary') and p.status = 'active';
  end if;

  return v_id;
end;
$$;

create or replace function public.set_book_order_fulfilled(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  update book_orders
  set status = 'fulfilled', fulfilled_at = now()
  where id = p_order_id and status = 'paid';

  if not found then
    raise exception 'only a paid order can be marked as handed over';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_book_order_payment — charges the AGREED total, never the asked one
-- ---------------------------------------------------------------------------
create or replace function public.start_book_order_payment(p_order_id uuid)
returns table (
  payment_id uuid,
  order_ref  text,
  amount     numeric
)
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_order book_orders%rowtype;
  v_ref   text;
  v_id    uuid;
begin
  select * into v_order from book_orders where id = p_order_id for update;
  if not found or v_order.member_id is distinct from v_me then
    raise exception 'order not found';
  end if;
  if v_order.status <> 'agreed' then
    raise exception 'this order is not ready to pay for';
  end if;
  -- Belt and braces. agreed_total_lkr is only writable by an admin RPC, and
  -- this is the only place it becomes money, so it is worth stating that a
  -- null or zero total can never reach a checkout.
  if coalesce(v_order.agreed_total_lkr, 0) <= 0 then
    raise exception 'this order has no confirmed price yet';
  end if;

  update payments
  set status = 'cancelled', note = 'superseded by a newer attempt'
  where order_id = p_order_id and status = 'pending';

  v_ref := public.new_payment_ref('BK');

  insert into payments (
    purpose, member_id, order_id, provider_order_ref, amount_lkr,
    member_email, member_name, description
  )
  values (
    'book_order', v_me, p_order_id, v_ref, v_order.agreed_total_lkr,
    v_order.member_email, v_order.member_name, 'Book order'
  )
  returning id into v_id;

  return query select v_id, v_ref, v_order.agreed_total_lkr;
end;
$$;

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'video.approved','video.rejected','join.approved','join.rejected',
    'payment.received','points.awarded','membership.added','membership.changed',
    'role.changed','account.status','badge.earned',
    'borrow.updated','borrow.rejected','library.activated',
    'order.placed','order.quoted','order.agreed','order.message','order.paid'
  ));

revoke execute on function
  public.place_book_order(jsonb, text),
  public.set_book_order_price(uuid, jsonb, text),
  public.respond_to_quote(uuid, boolean),
  public.cancel_book_order(uuid),
  public.post_order_message(uuid, text),
  public.set_book_order_fulfilled(uuid),
  public.start_book_order_payment(uuid)
from public;

grant execute on function
  public.place_book_order(jsonb, text),
  public.set_book_order_price(uuid, jsonb, text),
  public.respond_to_quote(uuid, boolean),
  public.cancel_book_order(uuid),
  public.post_order_message(uuid, text),
  public.set_book_order_fulfilled(uuid),
  public.start_book_order_payment(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Settlement — a paid order, and the Read and Rise share
-- ---------------------------------------------------------------------------
-- Adds the book_order branch to the chain from 0024. Everything else is
-- unchanged; see 0014 for why each guard is there.
create or replace function public.apply_payhere_notification(
  p_order_ref    text,
  p_payment_id   text,
  p_status_code  int,
  p_amount       numeric,
  p_currency     text,
  p_signature_ok boolean,
  p_payload      jsonb
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_pay     payments%rowtype;
  v_new     date;
  v_first   boolean;
  v_outcome text;
begin
  -- 1. Bad signature: log and stop. Never trust the body.
  if not p_signature_ok then
    insert into payment_events (provider_order_ref, status_code, signature_ok, applied, outcome, payload)
    values (p_order_ref, p_status_code, false, false, 'bad_signature', p_payload);
    return 'bad_signature';
  end if;

  -- 2. Lock the payment row. Two concurrent retries serialise here.
  select * into v_pay from payments where provider_order_ref = p_order_ref for update;

  if not found then
    insert into payment_events (provider_order_ref, status_code, signature_ok, applied, outcome, payload)
    values (p_order_ref, p_status_code, true, false, 'unknown_ref', p_payload);
    return 'unknown_ref';
  end if;

  -- 3. THE idempotency key. A second successful notification for an
  --    already-successful payment must not advance a renewal date twice.
  if v_pay.status in ('success','manual') then
    insert into payment_events (payment_id, provider_order_ref, status_code, signature_ok, applied, outcome, payload)
    values (v_pay.id, p_order_ref, p_status_code, true, false, 'already_applied', p_payload);
    return 'already_applied';
  end if;

  -- 4. A valid signature over a tampered amount is still a tampered amount.
  if p_amount is distinct from v_pay.amount_lkr or upper(p_currency) <> upper(v_pay.currency) then
    insert into payment_events (payment_id, provider_order_ref, status_code, signature_ok, applied, outcome, payload)
    values (v_pay.id, p_order_ref, p_status_code, true, false, 'amount_mismatch', p_payload);
    return 'amount_mismatch';
  end if;

  -- 5. Failure codes: record and stop. 2 = success, 0 = pending,
  --    -1 = cancelled, -2 = failed, -3 = chargedback.
  if p_status_code <> 2 then
    update payments
    set status = case p_status_code
                   when 0  then 'pending'
                   when -1 then 'cancelled'
                   when -3 then 'chargedback'
                   else 'failed'
                 end,
        status_code = p_status_code,
        raw_notification = p_payload
    where id = v_pay.id;

    insert into payment_events (payment_id, provider_order_ref, status_code, signature_ok, applied, outcome, payload)
    values (v_pay.id, p_order_ref, p_status_code, true, true, 'not_successful', p_payload);
    return 'not_successful';
  end if;

  -- 6. Success. Flip the payment AND apply the side effect in the SAME
  --    transaction -- there must be no window where money is taken and the
  --    membership is not extended.
  update payments
  set status = 'success', provider_payment_id = p_payment_id,
      status_code = p_status_code, paid_at = now(), raw_notification = p_payload
  where id = v_pay.id;

  if v_pay.purpose = 'club_membership' then
    v_first := not exists (
      select 1 from club_memberships where member_id = v_pay.member_id and is_primary
    );

    insert into club_memberships
      (member_id, club_id, status, is_primary, joined_on, renewal_date)
    values (
      v_pay.member_id, v_pay.club_id, 'active', v_first, current_date,
      (current_date + (coalesce(v_pay.term_months, 12) || ' months')::interval)::date
    )
    on conflict (member_id, club_id) do update
      -- Extend from GREATEST(current renewal, today). Renewing three months
      -- early must add a full term to the existing expiry, not restart from
      -- today and burn the remaining three months -- members notice that.
      set status = 'active',
          joined_on = coalesce(club_memberships.joined_on, current_date),
          renewal_date = (
            greatest(coalesce(club_memberships.renewal_date, current_date), current_date)
            + (coalesce(v_pay.term_months, 12) || ' months')::interval
          )::date
    returning renewal_date into v_new;

    v_outcome := 'membership_extended';

  elsif v_pay.purpose = 'session_booking' then
    update session_bookings
    set status = 'confirmed', confirmed_at = now()
    where id = v_pay.booking_id;

    v_outcome := 'booking_confirmed';

  elsif v_pay.purpose = 'library_addon' then
    update profiles
    set library_expires_on = (
      greatest(coalesce(library_expires_on, current_date), current_date)
      + (coalesce(v_pay.term_months, 12) || ' months')::interval
    )::date
    where id = v_pay.member_id
    returning library_expires_on into v_new;

    perform public.notify_member(
      v_pay.member_id,
      'library.activated',
      'Borrowing is now open to you',
      'You can borrow books until ' || to_char(v_new, 'DD Mon YYYY') || '.',
      '/library',
      'library:' || v_pay.id::text
    );

    v_outcome := 'library_extended';

  elsif v_pay.purpose = 'book_order' then
    update book_orders
    set status = 'paid', decided_at = now()
    where id = v_pay.order_id;

    perform public.notify_member(
      v_pay.member_id,
      'order.paid',
      'Thanks - your books are paid for',
      'LKR ' || to_char(
        (select readrise_lkr from book_orders where id = v_pay.order_id),
        'FM999,999,990.00') || ' of that goes to Read and Rise.',
      '/orders/' || v_pay.order_id::text,
      'order-paid:' || v_pay.order_id::text
    );

    v_outcome := 'order_paid';
  else
    v_outcome := 'applied';
  end if;

  insert into payment_events (payment_id, provider_order_ref, status_code, signature_ok, applied, outcome, payload)
  values (v_pay.id, p_order_ref, p_status_code, true, true, v_outcome, p_payload);

  return v_outcome;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read and Rise totals, and the badge queries written ahead of this schema
-- ---------------------------------------------------------------------------
-- 0021 had to guess at this table before it existed, and summed a `quantity`
-- column on book_orders. There is no such column -- quantity belongs to the
-- line items -- and in any case what a member has FUNDED is a share of money,
-- not a count of what they bought. Both readers are corrected below to the
-- real shape: rupees donated, over what the club says a donated book costs.
create or replace function public.readrise_books_funded(p_member_id uuid)
returns int
language sql stable security definer set search_path = public as $$
  select floor(
    coalesce((
      select sum(o.readrise_lkr)
      from book_orders o
      where o.member_id = p_member_id and o.status in ('paid','fulfilled')
    ), 0)
    / nullif((select readrise_book_cost_lkr from app_settings where id = 1), 0)
  )::int;
$$;

create or replace function public.readrise_donated_lkr(p_member_id uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((
    select sum(o.readrise_lkr)
    from book_orders o
    where o.member_id = p_member_id and o.status in ('paid','fulfilled')
  ), 0);
$$;

-- Club-wide, for the progress bar towards the campaign target. Readable by any
-- member: it is the number the campaign exists to publicise.
create or replace function public.readrise_totals()
returns table (
  books_funded  int,
  donated_lkr   numeric,
  target_books  int,
  target_on     date,
  my_books      int,
  my_donated    numeric
)
language sql stable security definer set search_path = public as $$
  select
    floor(coalesce(t.total, 0) / nullif(s.readrise_book_cost_lkr, 0))::int,
    coalesce(t.total, 0),
    s.readrise_target_books,
    s.readrise_target_on,
    public.readrise_books_funded((select auth.uid())),
    public.readrise_donated_lkr((select auth.uid()))
  from app_settings s
  left join lateral (
    select sum(o.readrise_lkr) as total
    from book_orders o
    where o.status in ('paid','fulfilled')
  ) t on true
  where s.id = 1;
$$;

revoke execute on function
  public.readrise_books_funded(uuid),
  public.readrise_donated_lkr(uuid),
  public.readrise_totals()
from public;

grant execute on function
  public.readrise_books_funded(uuid),
  public.readrise_donated_lkr(uuid),
  public.readrise_totals()
to authenticated;

-- badge_progress from 0022 read the guessed shape too. Same correction.
create or replace function public.badge_progress()
returns table (family text, value int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    return;
  end if;

  return query
  select 'books_read'::text,
         (select count(*)::int from reading_items
          where member_id = v_me and status = 'read');

  return query
  select 'presented'::text,
         (select count(*)::int from member_activities
          where member_id = v_me
            and activity_code in ('present','present_other_club'));

  return query
  select 'points'::text,
         (select coalesce(points_balance, 0) from profiles where id = v_me);

  -- Same gaps-and-islands run as recompute_member_badges. If one changes the
  -- other must too, or the page will promise a badge the recompute won't award.
  return query
  select 'attend_streak'::text, coalesce(max(run), 0)::int
  from (
    select count(*) as run
    from (
      select m, (m - (row_number() over (order by m) * interval '1 month'))::date as island
      from (
        select distinct date_trunc('month', recorded_at)::date as m
        from member_activities
        where member_id = v_me and activity_code = 'attend'
      ) months
    ) islands
    group by island
  ) runs;

  return query select 'readrise'::text, public.readrise_books_funded(v_me);
end;
$$;

revoke execute on function public.badge_progress() from public;
grant execute on function public.badge_progress() to authenticated;
