import { getPlan } from "./config.js";
import { HttpError, assertUuid } from "./http.js";
import {
  TAP_TERMINAL_FAILURES,
  assertTapRefundId,
  listRefundsForCharge,
  retrieveCharge,
  retrieveRefund,
  tapAmountToMinor,
  validateTapAccount,
  validateTapMode,
} from "./tap.js";
import { getSupabaseAdmin } from "./supabase-admin.js";

function providerTimestamp(value) {
  if (value == null || value === "") return NaN;
  if (typeof value === "string" && !/^\d+$/.test(value)) return Date.parse(value);
  return Number(value);
}

function assertProviderTimestamp(value, label) {
  const millis = providerTimestamp(value);
  const earliest = Date.UTC(2020, 0, 1);
  if (!Number.isSafeInteger(millis) || millis < earliest || millis > Date.now() + 5 * 60_000) {
    throw new Error(`Tap charge has an invalid ${label} time`);
  }
  return new Date(millis).toISOString();
}

function chargeCapturedAt(charge) {
  // The hosted 3DS flow can finish well after charge creation. Prefer Tap's
  // completion evidence so the customer receives the full purchased term.
  const completed = charge?.transaction?.date?.completed;
  if (completed != null && completed !== "") {
    return assertProviderTimestamp(completed, "completion");
  }
  const capturedActivities = Array.isArray(charge?.activities)
    ? charge.activities.filter((item) => item?.status === "CAPTURED" && item.created != null)
    : [];
  if (capturedActivities.length) {
    const latest = Math.max(...capturedActivities.map((item) => providerTimestamp(item.created)));
    return assertProviderTimestamp(latest, "capture activity");
  }
  return assertProviderTimestamp(charge?.transaction?.created, "creation");
}

function validateAgreementContract(contract, cardId) {
  if (!contract?.id) return;
  // Tap documents contract IDs for a card, subscription, invoice, or order,
  // and its examples use inconsistent type labels. The ID prefix is stable:
  // bind card_ contracts to this saved card, while allowing non-card contracts
  // to be bound by the verified agreement/customer/charge IDs.
  if (String(contract.id).startsWith("card_") && contract.id !== cardId) {
    throw new Error("Tap agreement saved-card contract mismatch");
  }
}

function addDays(iso, days) {
  const start = Date.parse(iso);
  if (!Number.isFinite(start)) throw new Error("Invalid subscription period start");
  return new Date(start + days * 86_400_000).toISOString();
}

function validateLocalOrder(order) {
  const plan = getPlan(order?.plan_code);
  if (!plan || order.provider !== "tap") throw new Error("Unknown local Tap order");
  if (!Number.isSafeInteger(Number(order.amount)) || Number(order.amount) !== plan.amount) {
    throw new Error("Order amount snapshot mismatch");
  }
  if (order.currency !== plan.currency || Number(order.duration_days) !== plan.durationDays) {
    throw new Error("Order plan snapshot mismatch");
  }
  if (!['initial', 'renewal'].includes(order.order_kind)) throw new Error("Unknown Tap order kind");
  return plan;
}

function validateChargeBinding(charge, order) {
  const plan = validateLocalOrder(order);
  if (charge?.object !== "charge") throw new Error("Tap object is not a charge");
  validateTapAccount(charge);
  if (charge.id !== order.tap_charge_id) throw new Error("Tap charge ID mismatch");
  if (tapAmountToMinor(charge.amount) !== Number(order.amount) || charge.currency !== order.currency) {
    throw new Error("Tap charge amount mismatch");
  }
  if (charge.reference?.order !== order.id || charge.reference?.transaction !== order.reference_transaction) {
    throw new Error("Tap charge reference mismatch");
  }
  if (charge.metadata?.order_id !== order.id
    || charge.metadata?.plan_code !== order.plan_code
    || charge.metadata?.kind !== order.order_kind) {
    throw new Error("Tap charge metadata mismatch");
  }
  if (order.order_kind === "initial" && charge.metadata?.terms_version !== order.terms_version) {
    throw new Error("Tap recurring terms version mismatch");
  }
  return plan;
}

async function findOrderForCharge(charge) {
  const admin = getSupabaseAdmin();
  let { data: order, error } = await admin
    .from("payment_orders")
    .select("*")
    .eq("tap_charge_id", charge.id)
    .maybeSingle();
  if (error) throw error;

  if (!order && charge.reference?.order) {
    const orderId = assertUuid(charge.reference.order, "رقم الطلب");
    ({ data: order, error } = await admin.from("payment_orders").select("*").eq("id", orderId).maybeSingle());
    if (error) throw error;
  }
  if (!order) throw new Error("No local order for Tap charge");
  const plan = validateLocalOrder(order);

  // Recover a Tap charge created just before the deployment lost its HTTP
  // response. Exact provider references and immutable price snapshots make
  // the claim safe; the unique charge index resolves concurrent webhooks.
  if (!order.tap_charge_id) {
    const claimable = ["pending", "expired", "failed"].includes(order.status)
      && charge.reference?.order === order.id
      && charge.reference?.transaction === order.reference_transaction
      && charge.metadata?.order_id === order.id
      && charge.metadata?.plan_code === order.plan_code
      && charge.metadata?.kind === order.order_kind
      && tapAmountToMinor(charge.amount) === Number(order.amount)
      && charge.currency === plan.currency;
    if (!claimable) throw new Error("Unlinked Tap charge cannot be claimed");
    const { data: claimed, error: claimError } = await admin
      .from("payment_orders")
      .update({ tap_charge_id: charge.id, updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .is("tap_charge_id", null)
      .select("*")
      .maybeSingle();
    if (claimError) throw claimError;
    if (claimed) order = claimed;
    else {
      ({ data: order, error } = await admin.from("payment_orders").select("*").eq("tap_charge_id", charge.id).maybeSingle());
      if (error) throw error;
      if (!order) throw new Error("Tap charge claim raced with another order");
    }
  }
  return order;
}

async function markProviderFailure(order, charge) {
  const admin = getSupabaseAdmin();
  const failure = String(charge?.response?.code || charge?.status || "tap_failed").slice(0, 120);
  if (order.order_kind === "renewal") {
    const retryAt = new Date(Date.now() + 6 * 60 * 60_000).toISOString();
    const { error } = await admin.rpc("fail_tap_renewal", {
      p_order_id: order.id,
      p_charge_id: charge.id || null,
      p_failure: failure,
      p_retry_at: retryAt,
    });
    if (error) throw error;
    return;
  }
  const { error } = await admin
    .from("payment_orders")
    .update({ status: "failed", failure_code: failure, updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .in("status", ["pending", "expired"]);
  if (error) throw error;
}

async function reversePaidOrder(order, chargeId, status) {
  const normalized = status === "REFUNDED" ? "REFUNDED" : "VOIDED";
  const { data, error } = await getSupabaseAdmin().rpc("reverse_tap_payment", {
    p_order_id: order.id,
    p_charge_id: chargeId,
    p_new_status: normalized,
  });
  if (error) throw error;
  return data;
}

async function activateInitial(charge, order, plan) {
  if (charge.customer_initiated !== true || charge.save_card !== true || charge.threeDSecure !== true) {
    throw new Error("Tap initial charge mode mismatch");
  }
  const customerId = typeof charge.customer?.id === "string" && charge.customer.id.startsWith("cus_")
    ? charge.customer.id : null;
  const cardId = typeof charge.card?.id === "string" && charge.card.id.startsWith("card_")
    ? charge.card.id : null;
  const agreementId = typeof charge.payment_agreement?.id === "string"
    && charge.payment_agreement.id.startsWith("payment_agreement_")
    ? charge.payment_agreement.id : null;

  // Tap's recurring flow is usable only when the successful first charge
  // returns all three saved-card identifiers. Never silently turn on renewal
  // for a payment that did not produce a complete agreement.
  if (!customerId || !cardId || !agreementId) {
    throw new Error("Tap did not return complete saved-card credentials");
  }

  const contract = charge.payment_agreement?.contract;
  validateAgreementContract(contract, cardId);
  if (contract?.customer_id && customerId && contract.customer_id !== customerId) {
    throw new Error("Tap agreement customer mismatch");
  }

  const paidAt = chargeCapturedAt(charge);
  const periodStart = paidAt;
  const periodEnd = addDays(periodStart, plan.durationDays);
  const { data, error } = await getSupabaseAdmin().rpc("activate_tap_initial_payment", {
    p_order_id: order.id,
    p_charge_id: charge.id,
    p_customer_id: customerId,
    p_card_id: cardId,
    p_agreement_id: agreementId,
    p_paid_at: paidAt,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
  if (error) throw error;
  return data;
}

async function completeRenewal(charge, order, plan) {
  if (charge.customer_initiated !== false || charge.save_card !== false || charge.threeDSecure !== false) {
    throw new Error("Tap renewal charge mode mismatch");
  }
  const admin = getSupabaseAdmin();
  const { data: subscription, error: subscriptionError } = await admin
    .from("subscriptions")
    .select("user_id,plan_code,current_period_end,tap_customer_id,tap_card_id,tap_payment_agreement_id")
    .eq("user_id", order.user_id)
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;
  if (!subscription || subscription.plan_code !== order.plan_code) throw new Error("Renewal subscription mismatch");
  if (charge.customer?.id !== subscription.tap_customer_id) throw new Error("Tap renewal customer mismatch");
  if (charge.payment_agreement?.id !== subscription.tap_payment_agreement_id) {
    throw new Error("Tap renewal agreement mismatch");
  }
  if (charge.card?.id && charge.card.id !== subscription.tap_card_id) throw new Error("Tap renewal card mismatch");
  const contract = charge.payment_agreement?.contract;
  validateAgreementContract(contract, subscription.tap_card_id);
  if (contract?.customer_id && contract.customer_id !== subscription.tap_customer_id) {
    throw new Error("Tap renewal contract customer mismatch");
  }

  const periodStart = order.access_starts_at || subscription.current_period_end;
  const nextPeriodEnd = addDays(periodStart, plan.durationDays);
  const paidAt = chargeCapturedAt(charge);
  const { data, error } = await admin.rpc("complete_tap_renewal", {
    p_order_id: order.id,
    p_charge_id: charge.id,
    p_paid_at: paidAt,
    p_next_period_end: nextPeriodEnd,
  });
  if (error) throw error;
  return data;
}

export async function reconcileTapCharge(chargeId, suppliedCharge = null) {
  const charge = suppliedCharge || await retrieveCharge(chargeId);
  if (charge.id !== chargeId) throw new Error("Retrieved Tap charge ID mismatch");
  const order = await findOrderForCharge(charge);
  const plan = validateChargeBinding(charge, order);

  if (charge.status !== "CAPTURED") {
    if (["REFUNDED", "VOID", "VOIDED"].includes(charge.status)) {
      await reversePaidOrder(order, charge.id, charge.status);
    } else if (TAP_TERMINAL_FAILURES.has(charge.status)) {
      await markProviderFailure(order, charge);
    }
    const error = new HttpError(409, "الدفع لم يتأكد بعد.", "provider_not_captured");
    error.providerStatus = charge.status;
    error.order = order;
    throw error;
  }

  const result = order.order_kind === "renewal"
    ? await completeRenewal(charge, order, plan)
    : await activateInitial(charge, order, plan);
  return { charge, order, result };
}

export async function reconcileTapRefund(refundId) {
  const refund = await retrieveRefund(refundId);
  if (refund?.id !== refundId || refund.object !== "refund") throw new Error("Retrieved Tap refund mismatch");
  validateTapMode(refund);
  if (refund.status !== "REFUNDED") {
    return { refund, reversed: false, pending: true };
  }

  const admin = getSupabaseAdmin();
  const chargeId = typeof refund.charge_id === "string"
    ? refund.charge_id
    : refund.charge?.id;
  const charge = await retrieveCharge(chargeId);
  const order = await findOrderForCharge(charge);
  validateChargeBinding(charge, order);
  if (["refunded", "voided"].includes(order.status)) {
    return { refund, order, reversed: false, duplicate: true };
  }
  if (refund.currency !== order.currency) throw new Error("Tap refund currency mismatch");

  // Tap supports multiple partial refunds. Re-fetch the charge-filtered refund
  // list and aggregate unique, completed refunds so two partial refunds that
  // total the charge cannot leave paid access active indefinitely.
  const refundList = await listRefundsForCharge(charge.id);
  const refunds = new Map([[refund.id, { ...refund, charge_id: chargeId }]]);
  for (const item of refundList.refunds) {
    const id = assertTapRefundId(item?.id);
    if (item?.object !== "refund" || item.charge_id !== charge.id) {
      throw new Error("Tap refund list binding mismatch");
    }
    refunds.set(id, item);
  }
  let refundedMinor = 0;
  for (const item of refunds.values()) {
    if (item.status !== "REFUNDED") continue;
    if (item.currency !== order.currency || item.charge_id !== charge.id) {
      throw new Error("Tap completed refund binding mismatch");
    }
    refundedMinor += tapAmountToMinor(item.amount);
  }
  if (!Number.isSafeInteger(refundedMinor) || refundedMinor > Number(order.amount)) {
    throw new Error("Tap cumulative refund amount mismatch");
  }
  if (refundedMinor < Number(order.amount)) {
    console.warn("Partial Tap refund requires manual entitlement review", {
      refundId: refund.id,
      orderId: order.id,
      refundedMinor,
      listIncomplete: Boolean(refundList.has_more),
    });
    return {
      refund,
      order,
      reversed: false,
      partial: true,
      refundedMinor,
      listIncomplete: Boolean(refundList.has_more),
    };
  }

  // The refund webhook can race the original CAPTURED webhook. The reversal
  // RPC accepts pending/failed/expired orders under the same per-user lock, so
  // a full refund always wins and a later activation cannot grant access.
  const result = await reversePaidOrder(order, charge.id, "REFUNDED");
  return { refund, order, result, reversed: true };
}

export async function refreshProviderStateIfDue(userId) {
  const admin = getSupabaseAdmin();
  const { data: claimed, error: claimError } = await admin.rpc("claim_provider_refresh", { p_user_id: userId });
  if (claimError) throw claimError;
  if (!claimed) return;

  const { data: subscription, error: subscriptionError } = await admin
    .from("subscriptions")
    .select("last_charge_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;
  if (subscription?.last_charge_id) {
    const charge = await retrieveCharge(subscription.last_charge_id);
    try {
      await reconcileTapCharge(charge.id, charge);
    } catch (error) {
      if (error?.code !== "provider_not_captured") throw error;
    }
  }
  const { error: checkedError } = await admin
    .from("subscriptions")
    .update({ provider_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (checkedError) throw checkedError;
}
