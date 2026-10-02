import crypto from "node:crypto";
import {
  RECURRING_TERMS_VERSION,
  getAppUrl,
  getPlan,
  tapMerchantId,
} from "./_lib/config.js";
import { HttpError, parseBody, sendError, sendJson } from "./_lib/http.js";
import { reconcileTapCharge } from "./_lib/reconcile.js";
import {
  TAP_TERMINAL_FAILURES,
  createCharge,
  minorToTapAmount,
  retrieveCharge,
  tapAmountToMinor,
  validateTapAccount,
} from "./_lib/tap.js";
import { getSupabaseAdmin, requireUser } from "./_lib/supabase-admin.js";

const CHECKOUT_MINUTES = 30;
const SETTLEMENT_GRACE_MINUTES = 5;

function cleanName(value, field) {
  if (typeof value !== "string") throw new HttpError(400, `${field} مطلوب.`, "customer_details_required");
  const cleaned = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 60 || /[\u0000-\u001f\u007f<>]/u.test(cleaned)) {
    throw new HttpError(400, `${field} غير صالح.`, "invalid_customer_details");
  }
  return cleaned;
}

function customerDetails(value, email) {
  const firstName = cleanName(value?.firstName, "الاسم الأول");
  const lastName = cleanName(value?.lastName, "اسم العائلة");
  const countryCode = String(value?.phoneCountryCode || "").replace(/^\+/, "");
  const number = String(value?.phoneNumber || "").replace(/[\s()-]/g, "");
  if (!/^\d{1,4}$/.test(countryCode) || !/^\d{6,15}$/.test(number)) {
    throw new HttpError(400, "رقم الجوال غير صالح.", "invalid_customer_phone");
  }
  if (typeof email !== "string" || !email.includes("@") || email.length > 254) {
    throw new HttpError(400, "أضف بريدًا صحيحًا إلى حسابك أولًا.", "customer_email_required");
  }
  return {
    first_name: firstName,
    last_name: lastName,
    email,
    phone: { country_code: countryCode, number },
  };
}

function transactionReference(orderId, kind = "initial") {
  return `phos_${kind}_${orderId.replaceAll("-", "")}`;
}

function validateCreatedCharge(charge, orderId, plan, referenceTransaction) {
  if (typeof charge?.id !== "string" || !charge.id.startsWith("chg_")) throw new Error("Tap returned an invalid charge");
  validateTapAccount(charge);
  if (!["INITIATED", "CAPTURED"].includes(charge.status)) throw new Error(`Tap charge is not payable (${charge.status || "missing"})`);
  if (tapAmountToMinor(charge.amount) !== plan.amount || charge.currency !== plan.currency) {
    throw new Error("Tap returned a mismatched amount");
  }
  if (charge.customer_initiated !== true || charge.save_card !== true || charge.threeDSecure !== true) {
    throw new Error("Tap returned a mismatched initial-payment mode");
  }
  if (charge.reference?.order !== orderId || charge.reference?.transaction !== referenceTransaction) {
    throw new Error("Tap returned mismatched references");
  }
  if (charge.metadata?.order_id !== orderId || charge.metadata?.plan_code !== plan.code || charge.metadata?.kind !== "initial") {
    throw new Error("Tap returned mismatched metadata");
  }
  const expiry = charge.transaction?.expiry;
  if (expiry && (Number(expiry.period) !== CHECKOUT_MINUTES || expiry.type !== "MINUTE")) {
    throw new Error("Tap returned a mismatched checkout expiry");
  }
}

function checkoutUrl(charge) {
  const url = new URL(charge?.transaction?.url);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || (host !== "tap.company" && !host.endsWith(".tap.company"))) {
    throw new Error("Tap returned an invalid hosted checkout URL");
  }
  return url.href;
}

async function settleStaleInitialOrders(admin, userId, beforeIso) {
  const { data: stale, error } = await admin
    .from("payment_orders")
    .select("id,tap_charge_id,failure_code")
    .eq("user_id", userId)
    .eq("order_kind", "initial")
    .eq("status", "pending")
    .lte("checkout_expires_at", beforeIso);
  if (error) throw error;

  let activated = false;
  const safeToExpire = [];
  for (const order of stale || []) {
    if (!order.tap_charge_id) {
      // This marker is written on insert and replaced *before* the request to
      // Tap starts. It is the only unlinked state that proves no payable
      // provider request was attempted. Any other unlinked state is ambiguous
      // and must remain blocked for webhook/manual reconciliation.
      if (order.failure_code === "charge_submission_not_started") {
        safeToExpire.push(order.id);
        continue;
      }
      throw new HttpError(
        409,
        "تعذر حسم محاولة الدفع السابقة تلقائيًا. تواصل مع الدعم قبل إنشاء محاولة أخرى.",
        "checkout_review_required",
      );
    }
    const charge = await retrieveCharge(order.tap_charge_id);
    if (charge.status === "CAPTURED") {
      await reconcileTapCharge(order.tap_charge_id, charge);
      activated = true;
      continue;
    }
    if (TAP_TERMINAL_FAILURES.has(charge.status)) {
      safeToExpire.push(order.id);
    } else {
      throw new HttpError(409, "ما زلنا نتحقق من محاولة الدفع السابقة؛ جرّب بعد دقائق.", "checkout_in_progress");
    }
  }

  if (safeToExpire.length) {
    const { error: expireError } = await admin
      .from("payment_orders")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("order_kind", "initial")
      .eq("status", "pending")
      .in("id", safeToExpire);
    if (expireError) throw expireError;
  }
  return activated;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  try {
    const { user } = await requireUser(req);
    const body = parseBody(req);
    const plan = getPlan(body.planCode);
    if (!plan) throw new HttpError(400, "الباقة غير صالحة.", "invalid_plan");
    if (body.recurringConsent !== true || body.termsVersion !== RECURRING_TERMS_VERSION) {
      throw new HttpError(400, "يجب الموافقة بوضوح على التجديد التلقائي وشروطه.", "recurring_consent_required");
    }
    const customer = customerDetails(body.customer, user.email);

    // Resolve configuration before creating a database row. This avoids a
    // stuck unique pending order when deployment secrets are incomplete.
    const appUrl = getAppUrl();
    const merchantId = tapMerchantId();
    const admin = getSupabaseAdmin();
    const now = new Date();
    const nowIso = now.toISOString();

    const { data: existingSubscription, error: subscriptionError } = await admin
      .from("subscriptions")
      .select("status,active_until,current_period_end,auto_renew,cancel_at_period_end,canceled_at,next_renewal_attempt_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;
    const existingEnd = Date.parse(existingSubscription?.current_period_end || existingSubscription?.active_until || "");
    if (Number.isFinite(existingEnd) && existingEnd > now.getTime()) {
      throw new HttpError(409, "لديك باقة سارية بالفعل. يمكنك تغييرها بعد انتهاء مدتها الحالية.", "subscription_already_active");
    }
    const canceledAt = Date.parse(existingSubscription?.canceled_at || "");
    const hasDueCanceledCycle = existingSubscription?.auto_renew === false
      && existingSubscription?.cancel_at_period_end === true
      && existingSubscription?.next_renewal_attempt_at
      && Number.isFinite(existingEnd)
      && Number.isFinite(canceledAt)
      && existingEnd <= now.getTime()
      && canceledAt >= existingEnd;
    if (existingSubscription?.status === "past_due"
      || (existingSubscription?.auto_renew && !existingSubscription.cancel_at_period_end)
      || hasDueCanceledCycle) {
      throw new HttpError(409, "يجري تنفيذ التجديد التلقائي لاشتراكك الحالي.", "subscription_renewal_pending");
    }

    const staleBefore = new Date(now.getTime() - SETTLEMENT_GRACE_MINUTES * 60_000).toISOString();
    if (await settleStaleInitialOrders(admin, user.id, staleBefore)) {
      throw new HttpError(409, "تم تأكيد الدفعة السابقة وتفعيل اشتراكك؛ حدّث الصفحة.", "previous_payment_confirmed");
    }

    const { data: recent, error: recentError } = await admin
      .from("payment_orders")
      .select("id,order_kind,plan_code,tap_checkout_url,checkout_expires_at,failure_code")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentError) throw recentError;
    if (recent?.order_kind === "initial"
      && recent.plan_code === plan.code
      && recent.tap_checkout_url
      && Date.parse(recent.checkout_expires_at) > now.getTime()) {
      return sendJson(res, 200, { orderId: recent.id, checkoutUrl: recent.tap_checkout_url, reused: true });
    }
    if (recent && ["charge_submission_started", "tap_create_ambiguous"].includes(recent.failure_code)) {
      throw new HttpError(
        409,
        "تعذر حسم محاولة الدفع السابقة تلقائيًا. تواصل مع الدعم قبل إنشاء محاولة أخرى.",
        "checkout_review_required",
      );
    }
    if (recent) throw new HttpError(409, "ما زلنا نتحقق من محاولة الدفع السابقة؛ جرّب بعد دقائق.", "checkout_in_progress");

    const orderId = crypto.randomUUID();
    const referenceTransaction = transactionReference(orderId);
    const checkoutExpiresAt = new Date(now.getTime() + CHECKOUT_MINUTES * 60_000).toISOString();
    const { error: insertError } = await admin.from("payment_orders").insert({
      id: orderId,
      user_id: user.id,
      provider: "tap",
      order_kind: "initial",
      plan_code: plan.code,
      amount: plan.amount,
      currency: plan.currency,
      duration_days: plan.durationDays,
      status: "pending",
      checkout_expires_at: checkoutExpiresAt,
      reference_transaction: referenceTransaction,
      recurring_consent_at: nowIso,
      terms_version: RECURRING_TERMS_VERSION,
      failure_code: "charge_submission_not_started",
    });
    if (insertError?.code === "23505") throw new HttpError(409, "يجري تجهيز صفحة دفع سابقة؛ حاول بعد لحظات.", "checkout_in_progress");
    if (insertError) throw insertError;

    // Persist the boundary before making the external request. If the process
    // dies from this point onward, an unlinked order is treated as possibly
    // submitted and is never automatically replaced by a second payable one.
    const { data: submissionStarted, error: submissionError } = await admin
      .from("payment_orders")
      .update({ failure_code: "charge_submission_started", updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("status", "pending")
      .eq("failure_code", "charge_submission_not_started")
      .select("id")
      .maybeSingle();
    if (submissionError || !submissionStarted) {
      throw submissionError || new Error("Could not mark Tap charge submission boundary");
    }

    let charge;
    try {
      charge = await createCharge({
        amount: minorToTapAmount(plan.amount),
        currency: plan.currency,
        customer_initiated: true,
        threeDSecure: true,
        save_card: true,
        description: plan.description,
        metadata: { order_id: orderId, plan_code: plan.code, kind: "initial", terms_version: RECURRING_TERMS_VERSION },
        reference: { transaction: referenceTransaction, order: orderId, idempotent: referenceTransaction },
        customer,
        merchant: { id: merchantId },
        source: { id: "src_card" },
        transaction: { expiry: { period: CHECKOUT_MINUTES, type: "MINUTE" } },
        post: { url: `${appUrl}/api/tap-webhook` },
        redirect: { url: `${appUrl}/?payment=success&order_id=${orderId}` },
      });
      validateCreatedCharge(charge, orderId, plan, referenceTransaction);
    } catch (chargeError) {
      // 408/409/429 and transport/5xx errors are ambiguous: Tap may have
      // created the charge and its idempotency record even though our request
      // did not receive the response. Never free the one-pending-order guard
      // for those cases, or a second payable charge could be created.
      const definiteFailure = [400, 402, 422].includes(Number(chargeError?.status));
      if (definiteFailure) {
        const { error: failError } = await admin
          .from("payment_orders")
          .update({ status: "failed", failure_code: String(chargeError.providerCode || "tap_rejected"), updated_at: new Date().toISOString() })
          .eq("id", orderId)
          .eq("status", "pending");
        if (failError) console.error("Could not record rejected Tap checkout", failError);
      } else {
        const { error: ambiguousError } = await admin
          .from("payment_orders")
          .update({ failure_code: "tap_create_ambiguous", updated_at: new Date().toISOString() })
          .eq("id", orderId)
          .eq("status", "pending")
          .is("tap_charge_id", null);
        if (ambiguousError) console.error("Could not record ambiguous Tap checkout", ambiguousError);
      }
      throw chargeError;
    }

    const hostedUrl = charge.status === "INITIATED" ? checkoutUrl(charge) : null;
    const { data: linked, error: linkError } = await admin
      .from("payment_orders")
      .update({ tap_charge_id: charge.id, tap_checkout_url: hostedUrl, failure_code: null, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .is("tap_charge_id", null)
      .select("id,tap_charge_id,tap_checkout_url,status")
      .maybeSingle();
    if (linkError || !linked) {
      const { data: recovered, error: recoveryError } = await admin
        .from("payment_orders")
        .select("tap_charge_id,tap_checkout_url,status")
        .eq("id", orderId)
        .maybeSingle();
      if (recoveryError || recovered?.tap_charge_id !== charge.id) {
        throw linkError || recoveryError || new Error("Tap charge could not be linked to its local order");
      }
    }

    if (charge.status === "CAPTURED") {
      await reconcileTapCharge(charge.id, charge);
      return sendJson(res, 201, {
        orderId,
        checkoutUrl: `${appUrl}/?payment=success&order_id=${orderId}`,
        captured: true,
      });
    }
    return sendJson(res, 201, { orderId, checkoutUrl: hostedUrl });
  } catch (error) {
    return sendError(res, error);
  }
}
