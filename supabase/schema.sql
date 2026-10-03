-- Phos recurring subscriptions on Tap Payments
-- Run this entire file in the Supabase SQL editor. It is safe to re-run.
-- Existing one-time members keep their paid access, but are intentionally
-- migrated with auto_renew = false until they complete the Tap consent flow.

begin;

create extension if not exists pgcrypto;

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'tap',
  order_kind text not null default 'initial',
  plan_code text not null,
  amount integer not null,
  currency text not null default 'SAR',
  duration_days smallint not null,
  status text not null default 'pending',
  tap_charge_id text,
  tap_checkout_url text,
  reference_transaction text,
  recurring_consent_at timestamptz,
  terms_version text,
  checkout_expires_at timestamptz not null,
  paid_at timestamptz,
  access_starts_at timestamptz,
  access_ends_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration from the previous one-time schema. Historical orders remain
-- readable as provider=legacy and can never become recurring subscriptions.
alter table public.payment_orders add column if not exists provider text;
alter table public.payment_orders add column if not exists order_kind text;
alter table public.payment_orders add column if not exists tap_charge_id text;
alter table public.payment_orders add column if not exists tap_checkout_url text;
alter table public.payment_orders add column if not exists reference_transaction text;
alter table public.payment_orders add column if not exists recurring_consent_at timestamptz;
alter table public.payment_orders add column if not exists terms_version text;
alter table public.payment_orders add column if not exists checkout_expires_at timestamptz;
alter table public.payment_orders add column if not exists access_starts_at timestamptz;
alter table public.payment_orders add column if not exists access_ends_at timestamptz;
alter table public.payment_orders add column if not exists failure_code text;

update public.payment_orders set provider = 'legacy' where provider is null;
update public.payment_orders set order_kind = 'initial' where order_kind is null;
update public.payment_orders
   set checkout_expires_at = created_at + interval '30 minutes'
 where checkout_expires_at is null;
-- Old provider checkout links are no longer executable by this release. Close
-- any historical pending rows before installing the one-pending-order guard,
-- while preserving every completed order and its paid entitlement.
update public.payment_orders
   set status = 'expired',
       failure_code = coalesce(failure_code, 'legacy_provider_migration'),
       updated_at = now()
 where provider = 'legacy' and status = 'pending';

alter table public.payment_orders alter column provider set default 'tap';
alter table public.payment_orders alter column provider set not null;
alter table public.payment_orders alter column order_kind set default 'initial';
alter table public.payment_orders alter column order_kind set not null;
alter table public.payment_orders alter column checkout_expires_at set not null;

alter table public.payment_orders drop constraint if exists payment_orders_provider_check;
alter table public.payment_orders add constraint payment_orders_provider_check
  check (provider in ('tap', 'legacy'));
alter table public.payment_orders drop constraint if exists payment_orders_order_kind_check;
alter table public.payment_orders add constraint payment_orders_order_kind_check
  check (order_kind in ('initial', 'renewal'));
alter table public.payment_orders drop constraint if exists payment_orders_plan_code_check;
alter table public.payment_orders add constraint payment_orders_plan_code_check
  check (plan_code in ('access_30_days', 'access_90_days'));
alter table public.payment_orders drop constraint if exists payment_orders_amount_check;
alter table public.payment_orders add constraint payment_orders_amount_check
  check (amount > 0);
alter table public.payment_orders drop constraint if exists payment_orders_currency_check;
alter table public.payment_orders add constraint payment_orders_currency_check
  check (currency = 'SAR');
alter table public.payment_orders drop constraint if exists payment_orders_duration_days_check;
alter table public.payment_orders add constraint payment_orders_duration_days_check
  check (duration_days in (30, 90));
alter table public.payment_orders drop constraint if exists payment_orders_status_check;
alter table public.payment_orders add constraint payment_orders_status_check
  check (status in ('pending', 'paid', 'failed', 'expired', 'refunded', 'voided'));
alter table public.payment_orders drop constraint if exists payment_orders_plan_snapshot_check;
alter table public.payment_orders add constraint payment_orders_plan_snapshot_check check (
  (plan_code = 'access_30_days' and amount = 1900 and duration_days = 30)
  or (plan_code = 'access_90_days' and amount = 3900 and duration_days = 90)
  or provider = 'legacy'
);
alter table public.payment_orders drop constraint if exists payment_orders_tap_reference_check;
alter table public.payment_orders add constraint payment_orders_tap_reference_check
  check (provider <> 'tap' or reference_transaction is not null);
alter table public.payment_orders drop constraint if exists payment_orders_initial_consent_check;
alter table public.payment_orders add constraint payment_orders_initial_consent_check check (
  provider <> 'tap'
  or order_kind = 'renewal'
  or (recurring_consent_at is not null and nullif(btrim(terms_version), '') is not null)
);
alter table public.payment_orders drop constraint if exists payment_orders_paid_evidence_check;
alter table public.payment_orders add constraint payment_orders_paid_evidence_check check (
  provider <> 'tap'
  or status <> 'paid'
  or (tap_charge_id is not null and paid_at is not null
      and access_starts_at is not null and access_ends_at is not null)
);
alter table public.payment_orders drop constraint if exists payment_orders_access_window_check;
alter table public.payment_orders add constraint payment_orders_access_window_check
  check (access_ends_at is null or access_starts_at is null or access_ends_at > access_starts_at);

create index if not exists payment_orders_user_created_idx
  on public.payment_orders (user_id, created_at desc);
create unique index if not exists payment_orders_tap_charge_idx
  on public.payment_orders (tap_charge_id) where tap_charge_id is not null;
create unique index if not exists payment_orders_reference_transaction_idx
  on public.payment_orders (reference_transaction) where reference_transaction is not null;
drop index if exists public.payment_orders_one_pending_plan_idx;
create unique index if not exists payment_orders_one_pending_user_idx
  on public.payment_orders (user_id) where status = 'pending';
create unique index if not exists payment_orders_one_paid_renewal_period_idx
  on public.payment_orders (user_id, access_starts_at)
  where provider = 'tap' and order_kind = 'renewal' and status = 'paid';

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null,
  status text not null default 'active',
  active_until timestamptz not null,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  auto_renew boolean not null default false,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  tap_customer_id text,
  tap_card_id text,
  tap_payment_agreement_id text,
  last_charge_id text,
  last_order_id uuid references public.payment_orders(id) on delete set null,
  next_renewal_attempt_at timestamptz,
  renewal_failures smallint not null default 0,
  provider_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions add column if not exists current_period_start timestamptz;
alter table public.subscriptions add column if not exists current_period_end timestamptz;
alter table public.subscriptions add column if not exists auto_renew boolean not null default false;
alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.subscriptions add column if not exists canceled_at timestamptz;
alter table public.subscriptions add column if not exists tap_customer_id text;
alter table public.subscriptions add column if not exists tap_card_id text;
alter table public.subscriptions add column if not exists tap_payment_agreement_id text;
alter table public.subscriptions add column if not exists last_charge_id text;
alter table public.subscriptions add column if not exists last_order_id uuid;
alter table public.subscriptions add column if not exists next_renewal_attempt_at timestamptz;
alter table public.subscriptions add column if not exists renewal_failures smallint not null default 0;
alter table public.subscriptions add column if not exists provider_checked_at timestamptz;

alter table public.subscriptions drop constraint if exists subscriptions_last_order_id_fkey;
alter table public.subscriptions add constraint subscriptions_last_order_id_fkey
  foreign key (last_order_id) references public.payment_orders(id) on delete set null;

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
update public.subscriptions set status = 'expired' where status = 'revoked';
update public.subscriptions
   set current_period_end = active_until
 where current_period_end is null;
update public.subscriptions
   set current_period_start = current_period_end
     - case plan_code when 'access_90_days' then interval '90 days' else interval '30 days' end
 where current_period_start is null;
-- Deliberate legacy-safety rule: new recurring columns never opt an existing
-- customer into a future charge.
update public.subscriptions
   set auto_renew = false,
       next_renewal_attempt_at = null
 where tap_customer_id is null
    or tap_card_id is null
    or tap_payment_agreement_id is null;
update public.subscriptions
   set status = 'expired', auto_renew = false, next_renewal_attempt_at = null
 where current_period_end <= now() and status = 'active' and auto_renew = false;

alter table public.subscriptions alter column current_period_start set not null;
alter table public.subscriptions alter column current_period_end set not null;
alter table public.subscriptions drop constraint if exists subscriptions_plan_code_check;
alter table public.subscriptions add constraint subscriptions_plan_code_check
  check (plan_code in ('access_30_days', 'access_90_days'));
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('active', 'past_due', 'expired'));
alter table public.subscriptions drop constraint if exists subscriptions_period_check;
alter table public.subscriptions add constraint subscriptions_period_check
  check (current_period_end > current_period_start and active_until = current_period_end);
alter table public.subscriptions drop constraint if exists subscriptions_renewal_failures_check;
alter table public.subscriptions add constraint subscriptions_renewal_failures_check
  check (renewal_failures between 0 and 3);
alter table public.subscriptions drop constraint if exists subscriptions_tap_credentials_check;
alter table public.subscriptions add constraint subscriptions_tap_credentials_check check (
  (tap_customer_id is null and tap_card_id is null and tap_payment_agreement_id is null)
  or (tap_customer_id is not null and tap_card_id is not null and tap_payment_agreement_id is not null)
);
alter table public.subscriptions drop constraint if exists subscriptions_auto_renew_check;
alter table public.subscriptions add constraint subscriptions_auto_renew_check check (
  not auto_renew
  or (not cancel_at_period_end and status <> 'expired'
      and tap_customer_id is not null and tap_card_id is not null
      and tap_payment_agreement_id is not null and next_renewal_attempt_at is not null)
);
alter table public.subscriptions drop constraint if exists subscriptions_cancel_check;
alter table public.subscriptions add constraint subscriptions_cancel_check
  check (not cancel_at_period_end or (not auto_renew and canceled_at is not null));

create unique index if not exists subscriptions_tap_customer_idx
  on public.subscriptions (tap_customer_id) where tap_customer_id is not null;
create unique index if not exists subscriptions_tap_agreement_idx
  on public.subscriptions (tap_payment_agreement_id) where tap_payment_agreement_id is not null;
create index if not exists subscriptions_due_renewal_idx
  on public.subscriptions (next_renewal_attempt_at, current_period_end)
  where auto_renew and not cancel_at_period_end;

create table if not exists public.ai_usage_counters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_started_at timestamptz not null default date_trunc('minute', now()),
  minute_count integer not null default 0 check (minute_count >= 0),
  day_started_at date not null default current_date,
  day_count integer not null default 0 check (day_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.payment_orders enable row level security;
alter table public.subscriptions enable row level security;
alter table public.ai_usage_counters enable row level security;

drop policy if exists "read own payment orders" on public.payment_orders;
create policy "read own payment orders"
  on public.payment_orders for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.payment_orders from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.ai_usage_counters from anon, authenticated;
-- Membership and order status are exposed only through authenticated server
-- endpoints. Browser roles do not need direct access to saved-card provider
-- identifiers, checkout URLs, or consent evidence.

create or replace function public.consume_ai_quota(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_counter public.ai_usage_counters%rowtype;
  v_now timestamptz := now();
  v_today date := current_date;
  v_minute_limit constant integer := 15;
  v_day_limit constant integer := 200;
begin
  if p_user_id is null then raise exception 'user id is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ai:' || p_user_id::text, 0));

  select * into v_counter
    from public.ai_usage_counters
   where user_id = p_user_id
   for update;

  if not found then
    insert into public.ai_usage_counters
      (user_id, minute_started_at, minute_count, day_started_at, day_count, updated_at)
    values (p_user_id, date_trunc('minute', v_now), 1, v_today, 1, v_now);
    return jsonb_build_object('allowed', true, 'minuteRemaining', v_minute_limit - 1, 'dayRemaining', v_day_limit - 1);
  end if;

  if v_counter.minute_started_at <= v_now - interval '1 minute' then
    v_counter.minute_started_at := date_trunc('minute', v_now);
    v_counter.minute_count := 0;
  end if;
  if v_counter.day_started_at <> v_today then
    v_counter.day_started_at := v_today;
    v_counter.day_count := 0;
  end if;

  if v_counter.minute_count >= v_minute_limit or v_counter.day_count >= v_day_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', case when v_counter.day_count >= v_day_limit then 'daily' else 'minute' end,
      'minuteRemaining', greatest(0, v_minute_limit - v_counter.minute_count),
      'dayRemaining', greatest(0, v_day_limit - v_counter.day_count)
    );
  end if;

  update public.ai_usage_counters
     set minute_started_at = v_counter.minute_started_at,
         minute_count = v_counter.minute_count + 1,
         day_started_at = v_counter.day_started_at,
         day_count = v_counter.day_count + 1,
         updated_at = v_now
   where user_id = p_user_id;

  return jsonb_build_object(
    'allowed', true,
    'minuteRemaining', v_minute_limit - v_counter.minute_count - 1,
    'dayRemaining', v_day_limit - v_counter.day_count - 1
  );
end;
$$;

create or replace function public.claim_provider_refresh(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed boolean;
begin
  if p_user_id is null then return false; end if;
  update public.subscriptions
     set provider_checked_at = now(), updated_at = now()
   where user_id = p_user_id
     and status in ('active', 'past_due')
     and (provider_checked_at is null or provider_checked_at <= now() - interval '10 minutes')
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.activate_tap_initial_payment(
  p_order_id uuid,
  p_charge_id text,
  p_customer_id text,
  p_card_id text,
  p_agreement_id text,
  p_paid_at timestamptz,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_order public.payment_orders%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_access_start timestamptz;
  v_access_end timestamptz;
  v_now timestamptz := now();
begin
  if p_charge_id !~ '^chg_[A-Za-z0-9_-]{6,120}$'
     or p_customer_id !~ '^cus_[A-Za-z0-9_-]{3,120}$'
     or p_card_id !~ '^card_[A-Za-z0-9_-]{3,120}$'
     or p_agreement_id !~ '^payment_agreement_[A-Za-z0-9_-]{3,160}$' then
    raise exception 'invalid Tap recurring identifiers';
  end if;
  if p_paid_at is null or p_period_start is null or p_period_end is null
     or p_paid_at > v_now + interval '5 minutes'
     or abs(extract(epoch from (p_period_start - p_paid_at))) > 300 then
    raise exception 'invalid initial payment timestamps';
  end if;

  select po.user_id into v_user_id
    from public.payment_orders po where po.id = p_order_id;
  if not found then raise exception 'unknown order'; end if;
  perform pg_advisory_xact_lock(hashtextextended('subscription:' || v_user_id::text, 0));

  select * into v_order
    from public.payment_orders po
   where po.id = p_order_id
   for update;
  if v_order.user_id is distinct from v_user_id
     or v_order.provider <> 'tap' or v_order.order_kind <> 'initial' then
    raise exception 'invalid initial Tap order';
  end if;
  if not ((v_order.plan_code = 'access_30_days' and v_order.amount = 1900 and v_order.duration_days = 30)
       or (v_order.plan_code = 'access_90_days' and v_order.amount = 3900 and v_order.duration_days = 90))
     or v_order.currency <> 'SAR' or v_order.recurring_consent_at is null
     or nullif(btrim(v_order.terms_version), '') is null then
    raise exception 'initial order snapshot or consent mismatch';
  end if;
  if p_period_end <> p_period_start + make_interval(days => v_order.duration_days) then
    raise exception 'initial subscription period mismatch';
  end if;
  if v_order.tap_charge_id is not null and v_order.tap_charge_id is distinct from p_charge_id then
    raise exception 'charge mismatch';
  end if;

  if v_order.status = 'paid' then
    if v_order.tap_charge_id is distinct from p_charge_id then raise exception 'completed charge mismatch'; end if;
    return v_order.access_ends_at;
  end if;
  if v_order.status not in ('pending', 'expired', 'failed') then
    raise exception 'order cannot be activated from status %', v_order.status;
  end if;

  select * into v_subscription
    from public.subscriptions s
   where s.user_id = v_user_id
   for update;
  v_access_start := greatest(p_period_start, coalesce(v_subscription.current_period_end, p_period_start));
  v_access_end := v_access_start + make_interval(days => v_order.duration_days);

  update public.payment_orders
     set status = 'paid', tap_charge_id = p_charge_id,
         paid_at = p_paid_at, access_starts_at = v_access_start,
         access_ends_at = v_access_end, failure_code = null, updated_at = v_now
   where id = v_order.id;

  insert into public.subscriptions (
    user_id, plan_code, status, active_until, current_period_start, current_period_end,
    auto_renew, cancel_at_period_end, canceled_at,
    tap_customer_id, tap_card_id, tap_payment_agreement_id,
    last_charge_id, last_order_id, next_renewal_attempt_at,
    renewal_failures, provider_checked_at, updated_at
  ) values (
    v_user_id, v_order.plan_code, 'active', v_access_end, v_access_start, v_access_end,
    true, false, null, p_customer_id, p_card_id, p_agreement_id,
    p_charge_id, v_order.id, v_access_end, 0, v_now, v_now
  )
  on conflict (user_id) do update set
    plan_code = excluded.plan_code,
    status = 'active',
    active_until = excluded.active_until,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    auto_renew = true,
    cancel_at_period_end = false,
    canceled_at = null,
    tap_customer_id = excluded.tap_customer_id,
    tap_card_id = excluded.tap_card_id,
    tap_payment_agreement_id = excluded.tap_payment_agreement_id,
    last_charge_id = excluded.last_charge_id,
    last_order_id = excluded.last_order_id,
    next_renewal_attempt_at = excluded.next_renewal_attempt_at,
    renewal_failures = 0,
    provider_checked_at = v_now,
    updated_at = v_now;

  return v_access_end;
end;
$$;

create or replace function public.complete_tap_renewal(
  p_order_id uuid,
  p_charge_id text,
  p_paid_at timestamptz,
  p_next_period_end timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_order public.payment_orders%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_now timestamptz := now();
begin
  if p_charge_id !~ '^chg_[A-Za-z0-9_-]{6,120}$'
     or p_paid_at is null or p_paid_at > v_now + interval '5 minutes'
     or p_next_period_end is null then
    raise exception 'invalid renewal evidence';
  end if;
  select po.user_id into v_user_id
    from public.payment_orders po where po.id = p_order_id;
  if not found then raise exception 'unknown order'; end if;
  perform pg_advisory_xact_lock(hashtextextended('subscription:' || v_user_id::text, 0));

  select * into v_order
    from public.payment_orders po
   where po.id = p_order_id
   for update;
  if v_order.user_id is distinct from v_user_id
     or v_order.provider <> 'tap' or v_order.order_kind <> 'renewal' then
    raise exception 'invalid Tap renewal order';
  end if;
  if not ((v_order.plan_code = 'access_30_days' and v_order.amount = 1900 and v_order.duration_days = 30)
       or (v_order.plan_code = 'access_90_days' and v_order.amount = 3900 and v_order.duration_days = 90))
     or v_order.currency <> 'SAR' then
    raise exception 'renewal order snapshot mismatch';
  end if;
  if v_order.tap_charge_id is not null and v_order.tap_charge_id is distinct from p_charge_id then
    raise exception 'renewal charge mismatch';
  end if;
  if v_order.status = 'paid' then
    if v_order.tap_charge_id is distinct from p_charge_id then raise exception 'completed charge mismatch'; end if;
    return v_order.access_ends_at;
  end if;
  if v_order.status not in ('pending', 'expired', 'failed') then
    raise exception 'renewal cannot complete from status %', v_order.status;
  end if;

  select * into v_subscription
    from public.subscriptions s
   where s.user_id = v_user_id
   for update;
  if not found or v_subscription.plan_code <> v_order.plan_code
     or v_subscription.tap_customer_id is null or v_subscription.tap_card_id is null
     or v_subscription.tap_payment_agreement_id is null then
    raise exception 'renewal subscription mismatch';
  end if;
  if v_order.access_starts_at is null
     or v_subscription.current_period_end <> v_order.access_starts_at
     or p_next_period_end <> v_order.access_starts_at + make_interval(days => v_order.duration_days) then
    raise exception 'renewal period mismatch';
  end if;

  update public.payment_orders
     set status = 'paid', tap_charge_id = p_charge_id,
         paid_at = p_paid_at, access_ends_at = p_next_period_end,
         failure_code = null, updated_at = v_now
   where id = v_order.id;

  update public.subscriptions
     set status = 'active', active_until = p_next_period_end,
         current_period_start = v_order.access_starts_at,
         current_period_end = p_next_period_end,
         last_charge_id = p_charge_id, last_order_id = v_order.id,
         next_renewal_attempt_at = case
           when auto_renew and not cancel_at_period_end then p_next_period_end else null end,
         renewal_failures = 0, provider_checked_at = v_now, updated_at = v_now
   where user_id = v_user_id;

  return p_next_period_end;
end;
$$;

create or replace function public.fail_tap_renewal(
  p_order_id uuid,
  p_charge_id text,
  p_failure text,
  p_retry_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_order public.payment_orders%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_failures smallint;
  v_stop boolean;
  v_now timestamptz := now();
  v_next timestamptz;
begin
  if p_charge_id is not null and p_charge_id !~ '^chg_[A-Za-z0-9_-]{6,120}$' then
    raise exception 'invalid Tap charge id';
  end if;
  if nullif(btrim(p_failure), '') is null or length(p_failure) > 120
     or p_retry_at is null or p_retry_at < v_now then
    raise exception 'invalid renewal failure details';
  end if;
  select po.user_id into v_user_id
    from public.payment_orders po where po.id = p_order_id;
  if not found then raise exception 'unknown order'; end if;
  perform pg_advisory_xact_lock(hashtextextended('subscription:' || v_user_id::text, 0));

  select * into v_order
    from public.payment_orders po
   where po.id = p_order_id
   for update;
  if v_order.provider <> 'tap' or v_order.order_kind <> 'renewal' then
    raise exception 'invalid renewal order';
  end if;
  if v_order.status = 'paid' then raise exception 'a paid renewal cannot fail'; end if;
  if v_order.tap_charge_id is not null and p_charge_id is distinct from v_order.tap_charge_id then
    raise exception 'renewal failure charge mismatch';
  end if;
  if v_order.status = 'failed' then
    select s.next_renewal_attempt_at into v_next
      from public.subscriptions s where s.user_id = v_user_id;
    return v_next;
  end if;

  select * into v_subscription
    from public.subscriptions s where s.user_id = v_user_id for update;
  if not found or v_subscription.plan_code <> v_order.plan_code then
    raise exception 'renewal subscription mismatch';
  end if;

  update public.payment_orders
     set status = 'failed', tap_charge_id = coalesce(tap_charge_id, p_charge_id),
         failure_code = left(p_failure, 120), updated_at = v_now
   where id = v_order.id;

  v_failures := least(3, v_subscription.renewal_failures + 1);
  v_stop := v_failures >= 3 or not v_subscription.auto_renew
            or v_subscription.cancel_at_period_end;
  v_next := case when v_stop then null else p_retry_at end;

  update public.subscriptions
     set renewal_failures = v_failures,
         auto_renew = case when v_stop then false else auto_renew end,
         cancel_at_period_end = case when v_stop then true else cancel_at_period_end end,
         canceled_at = case when v_stop then coalesce(canceled_at, v_now) else canceled_at end,
         status = case
           when v_stop and current_period_end <= v_now then 'expired'
           when v_stop then 'active'
           else 'past_due'
         end,
         next_renewal_attempt_at = v_next,
         provider_checked_at = v_now,
         updated_at = v_now
   where user_id = v_user_id;
  return v_next;
end;
$$;

create or replace function public.cancel_tap_subscription(p_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_now timestamptz := now();
  v_due_renewal boolean;
begin
  if p_user_id is null then raise exception 'user id is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('subscription:' || p_user_id::text, 0));
  select * into v_subscription
    from public.subscriptions s where s.user_id = p_user_id for update;
  if not found then return null; end if;

  -- If the paid boundary has already passed, that cycle is already due even
  -- when the scheduled worker has not claimed it yet. Preserve exactly
  -- that one due cycle; a cancellation requested before the boundary has no
  -- due cycle and prevents the claim entirely.
  v_due_renewal := v_subscription.current_period_end <= v_now
    and v_subscription.tap_customer_id is not null
    and v_subscription.tap_card_id is not null
    and v_subscription.tap_payment_agreement_id is not null
    and (
      (v_subscription.auto_renew and not v_subscription.cancel_at_period_end)
      or (
        not v_subscription.auto_renew and v_subscription.cancel_at_period_end
        and v_subscription.next_renewal_attempt_at is not null
        and v_subscription.canceled_at >= v_subscription.current_period_end
      )
    );

  -- A due renewal order is a claim already handed to the worker. It may be
  -- between the external request and local charge linking, so cancellation
  -- must not expire it. The in-flight cycle is reconciled normally; disabling
  -- auto_renew here prevents every later cycle.
  update public.subscriptions
     set auto_renew = false,
         cancel_at_period_end = true,
         canceled_at = coalesce(canceled_at, v_now),
         status = case when current_period_end <= v_now then 'expired' else status end,
         next_renewal_attempt_at = case
           when v_due_renewal then coalesce(next_renewal_attempt_at, current_period_end)
           else null
         end,
         updated_at = v_now
   where user_id = p_user_id;
  return v_subscription.current_period_end;
end;
$$;

create or replace function public.claim_due_tap_renewals(
  p_limit integer,
  p_claimed_at timestamptz
)
returns table (
  order_id uuid,
  user_id uuid,
  plan_code text,
  amount integer,
  currency text,
  duration_days smallint,
  reference_transaction text,
  tap_charge_id text,
  current_period_end timestamptz,
  tap_customer_id text,
  tap_card_id text,
  tap_payment_agreement_id text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidate record;
  v_subscription public.subscriptions%rowtype;
  v_order public.payment_orders%rowtype;
  v_order_id uuid;
  v_reference text;
  v_returned integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'renewal claim limit must be between 1 and 100';
  end if;
  if p_claimed_at is null
     or p_claimed_at < now() - interval '5 minutes'
     or p_claimed_at > now() + interval '5 minutes' then
    raise exception 'invalid renewal claim timestamp';
  end if;

  for v_candidate in
    select s.user_id as candidate_user_id
      from public.subscriptions s
     where (
         (s.auto_renew = true and s.cancel_at_period_end = false)
         or (
           s.auto_renew = false and s.cancel_at_period_end = true
           and s.canceled_at >= s.current_period_end
           and s.next_renewal_attempt_at is not null
         )
       )
       and s.status in ('active', 'past_due', 'expired')
       and s.current_period_end <= p_claimed_at
       and s.next_renewal_attempt_at <= p_claimed_at
       and s.renewal_failures < 3
       and s.tap_customer_id is not null
       and s.tap_card_id is not null
       and s.tap_payment_agreement_id is not null
     order by s.next_renewal_attempt_at, s.user_id
     limit (p_limit * 4)
  loop
    exit when v_returned >= p_limit;
    if not pg_try_advisory_xact_lock(
      hashtextextended('subscription:' || v_candidate.candidate_user_id::text, 0)
    ) then
      continue;
    end if;

    select * into v_subscription
      from public.subscriptions s
     where s.user_id = v_candidate.candidate_user_id
       and (
         (s.auto_renew = true and s.cancel_at_period_end = false)
         or (
           s.auto_renew = false and s.cancel_at_period_end = true
           and s.canceled_at >= s.current_period_end
           and s.next_renewal_attempt_at is not null
         )
       )
       and s.status in ('active', 'past_due', 'expired')
       and s.current_period_end <= p_claimed_at
       and s.next_renewal_attempt_at <= p_claimed_at
       and s.renewal_failures < 3
       and s.tap_customer_id is not null
       and s.tap_card_id is not null
       and s.tap_payment_agreement_id is not null
     for update;
    if not found then continue; end if;

    -- Ambiguous API timeouts and lost webhooks reuse the same order. The
    -- backend retrieves a linked charge; only an unlinked order is submitted
    -- again with its original reference.idempotent value.
    select * into v_order
      from public.payment_orders po
     where po.user_id = v_subscription.user_id
       and po.provider = 'tap' and po.order_kind = 'renewal'
       and po.status = 'pending'
     order by po.created_at desc
     limit 1
     for update;

    -- Never create a new debit after the advertised 48-hour processing
    -- window. A charge that is already linked gets one final exact retrieval,
    -- but automatic renewal is stopped first; a later CAPTURED webhook may
    -- still grant that paid cycle without enabling another one. Unlinked
    -- attempts require manual review and a fresh customer checkout afterward.
    if v_subscription.current_period_end + interval '48 hours' <= p_claimed_at then
      if found and v_order.tap_charge_id is not null then
        update public.payment_orders
           set updated_at = p_claimed_at
         where id = v_order.id;
        update public.subscriptions
           set status = 'expired', auto_renew = false,
               cancel_at_period_end = true,
               canceled_at = coalesce(canceled_at, p_claimed_at),
               next_renewal_attempt_at = null,
               updated_at = p_claimed_at
         where subscriptions.user_id = v_subscription.user_id;
        v_returned := v_returned + 1;
        return query select
          v_order.id, v_order.user_id, v_order.plan_code, v_order.amount,
          v_order.currency, v_order.duration_days, v_order.reference_transaction,
          v_order.tap_charge_id, v_subscription.current_period_end,
          v_subscription.tap_customer_id, v_subscription.tap_card_id,
          v_subscription.tap_payment_agreement_id;
      else
        if found then
          update public.payment_orders
             set status = 'expired',
                 failure_code = 'renewal_window_elapsed_manual_review',
                 updated_at = p_claimed_at
           where id = v_order.id;
        end if;
        update public.subscriptions
           set status = 'expired', auto_renew = false,
               cancel_at_period_end = true,
               canceled_at = coalesce(canceled_at, p_claimed_at),
               next_renewal_attempt_at = null,
               updated_at = p_claimed_at
         where subscriptions.user_id = v_subscription.user_id;
      end if;
      continue;
    end if;

    if found then
      if v_order.updated_at > p_claimed_at - interval '15 minutes' then continue; end if;
      -- Tap only guarantees reference.idempotent for 24 hours. Automatically
      -- resubmitting an unlinked ambiguous request after that boundary could
      -- double-charge. Keep the 48-hour processing
      -- grace for a late webhook, then stop renewal for manual review.
      if v_order.tap_charge_id is null
         and v_order.created_at <= p_claimed_at - interval '23 hours' then
        if p_claimed_at < v_order.created_at + interval '48 hours' then
          update public.subscriptions
             set status = 'past_due',
                 next_renewal_attempt_at = v_order.created_at + interval '48 hours',
                 updated_at = p_claimed_at
           where subscriptions.user_id = v_subscription.user_id;
        else
          update public.payment_orders
             set status = 'expired',
                 failure_code = 'ambiguous_requires_manual_review',
                 updated_at = p_claimed_at
           where id = v_order.id;
          update public.subscriptions
             set status = 'expired', auto_renew = false,
                 cancel_at_period_end = true,
                 canceled_at = coalesce(canceled_at, p_claimed_at),
                 next_renewal_attempt_at = null,
                 updated_at = p_claimed_at
           where subscriptions.user_id = v_subscription.user_id;
        end if;
        continue;
      end if;
      update public.payment_orders
         set updated_at = p_claimed_at,
             checkout_expires_at = p_claimed_at + interval '30 minutes'
       where id = v_order.id
       returning * into v_order;
    else
      v_order_id := gen_random_uuid();
      v_reference := 'phos_renewal_' || replace(v_order_id::text, '-', '');
      insert into public.payment_orders (
        id, user_id, provider, order_kind, plan_code, amount, currency,
        duration_days, status, reference_transaction, checkout_expires_at,
        access_starts_at, created_at, updated_at
      ) values (
        v_order_id, v_subscription.user_id, 'tap', 'renewal', v_subscription.plan_code,
        case v_subscription.plan_code when 'access_30_days' then 1900 else 3900 end,
        'SAR', case v_subscription.plan_code when 'access_30_days' then 30 else 90 end,
        'pending', v_reference, p_claimed_at + interval '30 minutes',
        v_subscription.current_period_end, p_claimed_at, p_claimed_at
      ) returning * into v_order;
    end if;

    update public.subscriptions
       set status = 'past_due',
           next_renewal_attempt_at = p_claimed_at + interval '15 minutes',
           updated_at = p_claimed_at
     where subscriptions.user_id = v_subscription.user_id;

    v_returned := v_returned + 1;
    return query select
      v_order.id, v_order.user_id, v_order.plan_code, v_order.amount,
      v_order.currency, v_order.duration_days, v_order.reference_transaction,
      v_order.tap_charge_id, v_subscription.current_period_end,
      v_subscription.tap_customer_id, v_subscription.tap_card_id,
      v_subscription.tap_payment_agreement_id;
  end loop;
end;
$$;

create or replace function public.reverse_tap_payment(
  p_order_id uuid,
  p_charge_id text,
  p_new_status text
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_order public.payment_orders%rowtype;
  v_item public.payment_orders%rowtype;
  v_status text;
  v_cursor timestamptz;
  v_remaining interval;
  v_last_order_id uuid;
  v_last_plan_code text;
  v_last_charge_id text;
  v_now timestamptz := now();
begin
  v_status := case upper(coalesce(p_new_status, ''))
    when 'REFUNDED' then 'refunded'
    when 'VOID' then 'voided'
    when 'VOIDED' then 'voided'
    else null
  end;
  if v_status is null or p_charge_id !~ '^chg_[A-Za-z0-9_-]{6,120}$' then
    raise exception 'invalid full reversal evidence';
  end if;
  select po.user_id into v_user_id
    from public.payment_orders po where po.id = p_order_id;
  if not found then raise exception 'unknown order'; end if;
  perform pg_advisory_xact_lock(hashtextextended('subscription:' || v_user_id::text, 0));

  select * into v_order
    from public.payment_orders po where po.id = p_order_id for update;
  if v_order.provider <> 'tap' or v_order.tap_charge_id is distinct from p_charge_id then
    raise exception 'reversal charge mismatch';
  end if;
  if v_order.status = v_status then
    select s.current_period_end into v_cursor
      from public.subscriptions s where s.user_id = v_user_id;
    return v_cursor;
  end if;
  if v_order.status not in ('paid', 'pending', 'expired', 'failed') then
    raise exception 'order cannot be reversed from status %', v_order.status;
  end if;

  update public.payment_orders
     set status = v_status, failure_code = upper(p_new_status), updated_at = v_now
   where id = v_order.id;

  -- Rebuild only unconsumed access from other fully paid orders. This removes
  -- precisely the reversed order without erasing time granted by another one.
  v_cursor := v_now;
  for v_item in
    select po.*
      from public.payment_orders po
     where po.user_id = v_user_id and po.status = 'paid'
       and po.access_starts_at is not null and po.access_ends_at is not null
       and po.access_ends_at > v_now
     order by po.access_starts_at, po.paid_at, po.created_at, po.id
     for update
  loop
    v_remaining := case
      when v_item.access_starts_at <= v_now then v_item.access_ends_at - v_now
      else v_item.access_ends_at - v_item.access_starts_at
    end;
    if v_remaining > interval '0 seconds' then
      update public.payment_orders
         set access_starts_at = v_cursor,
             access_ends_at = v_cursor + v_remaining,
             updated_at = v_now
       where id = v_item.id;
      v_cursor := v_cursor + v_remaining;
      v_last_order_id := v_item.id;
      v_last_plan_code := v_item.plan_code;
      v_last_charge_id := v_item.tap_charge_id;
    end if;
  end loop;

  if v_last_order_id is null then
    update public.subscriptions
       set status = 'expired', active_until = v_now,
           current_period_start = v_now - interval '1 microsecond',
           current_period_end = v_now,
           auto_renew = false, cancel_at_period_end = true,
           canceled_at = coalesce(canceled_at, v_now),
           last_charge_id = null, last_order_id = null,
           next_renewal_attempt_at = null, provider_checked_at = v_now,
           updated_at = v_now
     where user_id = v_user_id;
  else
    update public.subscriptions
       set plan_code = v_last_plan_code, status = 'active', active_until = v_cursor,
           current_period_start = v_now, current_period_end = v_cursor,
           auto_renew = false, cancel_at_period_end = true,
           canceled_at = coalesce(canceled_at, v_now),
           last_charge_id = v_last_charge_id, last_order_id = v_last_order_id,
           next_renewal_attempt_at = null, provider_checked_at = v_now,
           updated_at = v_now
     where user_id = v_user_id;
  end if;
  return v_cursor;
end;
$$;

revoke all on function public.consume_ai_quota(uuid) from public, anon, authenticated;
revoke all on function public.claim_provider_refresh(uuid) from public, anon, authenticated;
revoke all on function public.activate_tap_initial_payment(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_tap_renewal(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.fail_tap_renewal(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.cancel_tap_subscription(uuid) from public, anon, authenticated;
revoke all on function public.claim_due_tap_renewals(integer, timestamptz) from public, anon, authenticated;
revoke all on function public.reverse_tap_payment(uuid, text, text) from public, anon, authenticated;

grant execute on function public.consume_ai_quota(uuid) to service_role;
grant execute on function public.claim_provider_refresh(uuid) to service_role;
grant execute on function public.activate_tap_initial_payment(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz) to service_role;
grant execute on function public.complete_tap_renewal(uuid, text, timestamptz, timestamptz) to service_role;
grant execute on function public.fail_tap_renewal(uuid, text, text, timestamptz) to service_role;
grant execute on function public.cancel_tap_subscription(uuid) to service_role;
grant execute on function public.claim_due_tap_renewals(integer, timestamptz) to service_role;
grant execute on function public.reverse_tap_payment(uuid, text, text) to service_role;

-- ============ ملفات المستخدمين والصور الشخصية ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(btrim(display_name)) between 2 and 40)
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

create or replace function public.create_phos_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'مستخدم فوس'
  );
  if char_length(v_name) < 2 then
    v_name := 'مستخدم فوس';
  end if;
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, left(v_name, 40), nullif(new.raw_user_meta_data ->> 'avatar_url', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_phos_profile_after_signup on auth.users;
create trigger create_phos_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_phos_profile();

insert into public.profiles (id, display_name, avatar_url)
select
  id,
  left(
    case
      when char_length(coalesce(nullif(btrim(raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(email, ''), '@', 1), '')) >= 2
        then coalesce(nullif(btrim(raw_user_meta_data ->> 'display_name'), ''), split_part(email, '@', 1))
      else 'مستخدم فوس'
    end,
    40
  ),
  nullif(raw_user_meta_data ->> 'avatar_url', '')
from auth.users
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


commit;
