-- Temporarily switch new Phos purchases to one-time access.
-- Run this whole file once in the Supabase SQL editor before deploying the app.
-- It is safe to run again. Existing recurring subscriptions remain supported.

begin;

alter table public.payment_orders add column if not exists payment_mode text;
update public.payment_orders
   set payment_mode = 'recurring'
 where payment_mode is null;
alter table public.payment_orders alter column payment_mode set default 'recurring';
alter table public.payment_orders alter column payment_mode set not null;

alter table public.payment_orders drop constraint if exists payment_orders_payment_mode_check;
alter table public.payment_orders add constraint payment_orders_payment_mode_check
  check (payment_mode in ('recurring', 'one_time'));

alter table public.payment_orders drop constraint if exists payment_orders_initial_consent_check;
alter table public.payment_orders add constraint payment_orders_initial_consent_check check (
  provider <> 'tap'
  or order_kind = 'renewal'
  or (payment_mode = 'recurring' and recurring_consent_at is not null and nullif(btrim(terms_version), '') is not null)
  or (payment_mode = 'one_time' and recurring_consent_at is null and nullif(btrim(terms_version), '') is not null)
);

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
  v_one_time boolean;
  v_now timestamptz := now();
begin
  if p_charge_id !~ '^chg_[A-Za-z0-9_-]{6,120}$' then
    raise exception 'invalid Tap charge identifier';
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
  v_one_time := v_order.payment_mode = 'one_time';
  if v_one_time then
    if p_customer_id is not null or p_card_id is not null or p_agreement_id is not null then
      raise exception 'one-time payment must not store recurring identifiers';
    end if;
  elsif p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9_-]{3,120}$'
     or p_card_id is null or p_card_id !~ '^card_[A-Za-z0-9_-]{3,120}$'
     or p_agreement_id is null or p_agreement_id !~ '^payment_agreement_[A-Za-z0-9_-]{3,160}$' then
    raise exception 'invalid Tap recurring identifiers';
  end if;
  if not ((v_order.plan_code = 'access_30_days' and v_order.amount = 1900 and v_order.duration_days = 30)
       or (v_order.plan_code = 'access_90_days' and v_order.amount = 3900 and v_order.duration_days = 90))
     or v_order.currency <> 'SAR'
     or nullif(btrim(v_order.terms_version), '') is null
     or (v_one_time and v_order.recurring_consent_at is not null)
     or (not v_one_time and v_order.recurring_consent_at is null) then
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
    not v_one_time, false, null, p_customer_id, p_card_id, p_agreement_id,
    p_charge_id, v_order.id, case when v_one_time then null else v_access_end end, 0, v_now, v_now
  )
  on conflict (user_id) do update set
    plan_code = excluded.plan_code,
    status = 'active',
    active_until = excluded.active_until,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    auto_renew = excluded.auto_renew,
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = excluded.canceled_at,
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

revoke all on function public.activate_tap_initial_payment(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.activate_tap_initial_payment(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz)
  to service_role;

commit;
