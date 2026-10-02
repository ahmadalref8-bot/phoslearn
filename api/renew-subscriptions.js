import { cronSecret, getAppUrl, getPlan, tapMerchantId } from "./_lib/config.js";
import { HttpError, safeEqual, sendError, sendJson } from "./_lib/http.js";
import { reconcileTapCharge } from "./_lib/reconcile.js";
import { getSupabaseAdmin } from "./_lib/supabase-admin.js";
import {
  TAP_TERMINAL_FAILURES,
  assertTapChargeId,
  createCharge,
  createSavedCardToken,
  minorToTapAmount,
  tapAmountToMinor,
  validateTapAccount,
} from "./_lib/tap.js";

export const maxDuration = 300;

const PROVIDER_RETRY_HOURS = 6;
const DEFINITE_PROVIDER_REJECTIONS = new Set([400, 402, 422]);

function authorizeCron(req) {
  const supplied = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : String(req.headers.authorization || "");
  if (!safeEqual(supplied, `Bearer ${cronSecret()}`)) {
    throw new HttpError(401, "Unauthorized", "invalid_cron_secret");
  }
}

function validProviderId(value, prefix) {
  return typeof value === "string"
    && value.startsWith(prefix)
    && /^[A-Za-z0-9_-]{8,180}$/.test(value);
}

function validateClaim(row) {
  const plan = getPlan(row?.plan_code);
  if (!plan
    || Number(row.amount) !== plan.amount
    || row.currency !== plan.currency
    || Number(row.duration_days) !== plan.durationDays) {
    throw new Error("Invalid renewal plan snapshot");
  }
  if (typeof row.order_id !== "string" || typeof row.reference_transaction !== "string") {
    throw new Error("Invalid renewal order claim");
  }
  if (!validProviderId(row.tap_customer_id, "cus_")
    || !validProviderId(row.tap_card_id, "card_")
    || !validProviderId(row.tap_payment_agreement_id, "payment_agreement_")) {
    throw new Error("Renewal is missing saved-card credentials");
  }
  return plan;
}

function validateRenewalCharge(charge, row, plan) {
  assertTapChargeId(charge?.id);
  if (charge?.object !== "charge") throw new Error("Tap object is not a charge");
  validateTapAccount(charge);
  if (tapAmountToMinor(charge.amount) !== plan.amount || charge.currency !== plan.currency) {
    throw new Error("Tap renewal amount mismatch");
  }
  if (charge.reference?.order !== row.order_id
    || charge.reference?.transaction !== row.reference_transaction) {
    throw new Error("Tap renewal reference mismatch");
  }
  if (charge.metadata?.order_id !== row.order_id
    || charge.metadata?.plan_code !== plan.code
    || charge.metadata?.kind !== "renewal") {
    throw new Error("Tap renewal metadata mismatch");
  }
  if (charge.customer_initiated !== false || charge.threeDSecure !== false || charge.save_card !== false) {
    throw new Error("Tap renewal transaction mode mismatch");
  }
  if (charge.customer?.id !== row.tap_customer_id) throw new Error("Tap renewal customer mismatch");
  if (charge.payment_agreement?.id !== row.tap_payment_agreement_id) {
    throw new Error("Tap renewal agreement mismatch");
  }
  if (charge.card?.id && charge.card.id !== row.tap_card_id) throw new Error("Tap renewal card mismatch");
  const contract = charge.payment_agreement?.contract;
  if (contract?.id && String(contract.id).startsWith("card_") && contract.id !== row.tap_card_id) {
    throw new Error("Tap renewal saved-card contract mismatch");
  }
  const acceptedStatuses = new Set(["INITIATED", "CAPTURED", ...TAP_TERMINAL_FAILURES]);
  if (!acceptedStatuses.has(charge.status)) throw new Error(`Unexpected Tap renewal status (${charge.status || "missing"})`);
}

async function failClaim(row, error, force = false, phase = "tap_charge") {
  const status = Number(error?.status);
  if (!force && !DEFINITE_PROVIDER_REJECTIONS.has(status)) return false;
  const retryAt = new Date(Date.now() + PROVIDER_RETRY_HOURS * 60 * 60_000).toISOString();
  const detail = error?.providerCode || (Number.isFinite(status) ? `http_${status}` : "unavailable");
  const failure = `${phase}_${String(detail)}`.slice(0, 120);
  const { error: rpcError } = await getSupabaseAdmin().rpc("fail_tap_renewal", {
    p_order_id: row.order_id,
    p_charge_id: null,
    p_failure: failure,
    p_retry_at: retryAt,
  });
  if (rpcError) throw rpcError;
  return true;
}

async function linkCharge(row, chargeId) {
  const admin = getSupabaseAdmin();
  const { data: linked, error } = await admin
    .from("payment_orders")
    .update({ tap_charge_id: chargeId, updated_at: new Date().toISOString() })
    .eq("id", row.order_id)
    .eq("user_id", row.user_id)
    .eq("order_kind", "renewal")
    .eq("status", "pending")
    .is("tap_charge_id", null)
    .select("tap_charge_id")
    .maybeSingle();
  if (error) throw error;
  if (linked?.tap_charge_id === chargeId) return;

  const { data: existing, error: existingError } = await admin
    .from("payment_orders")
    .select("tap_charge_id")
    .eq("id", row.order_id)
    .single();
  if (existingError) throw existingError;
  if (existing.tap_charge_id !== chargeId) throw new Error("Renewal order was linked to another Tap charge");
}

async function processClaim(row) {
  const plan = validateClaim(row);

  // A prior invocation can be interrupted after linking but before
  // reconciliation. Retrieve that exact charge instead of creating another.
  if (row.tap_charge_id) {
    try {
      await reconcileTapCharge(assertTapChargeId(row.tap_charge_id));
      return "captured";
    } catch (error) {
      if (error?.code === "provider_not_captured") {
        return TAP_TERMINAL_FAILURES.has(error.providerStatus) ? "failed" : "pending";
      }
      throw error;
    }
  }

  let token;
  try {
    token = await createSavedCardToken(row.tap_customer_id, row.tap_card_id);
  } catch (error) {
    // A token can be abandoned safely: no charge request has started and the
    // token is single-use/short-lived. Record a retryable failed attempt.
    await failClaim(row, error, true, "tap_token");
    return "failed";
  }

  let charge;
  try {
    const appUrl = getAppUrl();
    charge = await createCharge({
      amount: minorToTapAmount(plan.amount),
      currency: plan.currency,
      customer_initiated: false,
      threeDSecure: false,
      save_card: false,
      payment_agreement: { id: row.tap_payment_agreement_id },
      description: plan.description,
      metadata: { order_id: row.order_id, plan_code: plan.code, kind: "renewal" },
      reference: {
        transaction: row.reference_transaction,
        order: row.order_id,
        idempotent: row.reference_transaction,
      },
      customer: { id: row.tap_customer_id },
      merchant: { id: tapMerchantId() },
      source: { id: token.id },
      post: { url: `${appUrl}/api/tap-webhook` },
      redirect: { url: `${appUrl}/?payment=renewal` },
    });
  } catch (error) {
    // Only a definite provider rejection is safe to release. Timeouts, 409s,
    // rate limits, and 5xx responses may hide a created charge; their pending
    // order stays locked to the same 23-hour idempotency window.
    if (await failClaim(row, error, false, "tap_charge")) return "failed";
    throw error;
  }

  // From here a charge definitely exists. Never route validation, DB-linking,
  // or reconciliation errors through fail_tap_renewal: doing so could mark a
  // CAPTURED charge failed and permit a duplicate attempt.
  validateRenewalCharge(charge, row, plan);
  await linkCharge(row, charge.id);

  try {
    await reconcileTapCharge(charge.id, charge);
    return "captured";
  } catch (error) {
    if (error?.code === "provider_not_captured") {
      return TAP_TERMINAL_FAILURES.has(error.providerStatus) ? "failed" : "pending";
    }
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  try {
    authorizeCron(req);
    const { data: claims, error } = await getSupabaseAdmin().rpc("claim_due_tap_renewals", {
      p_limit: 50,
      p_claimed_at: new Date().toISOString(),
    });
    if (error) throw error;

    const summary = { claimed: claims?.length || 0, captured: 0, pending: 0, failed: 0, errors: 0 };
    // Small parallel batches keep the cron comfortably within its function
    // deadline while the DB lease prevents a second invocation from charging
    // the same customer/period.
    for (let index = 0; index < (claims || []).length; index += 5) {
      const batch = claims.slice(index, index + 5);
      const results = await Promise.allSettled(batch.map(processClaim));
      results.forEach((result, offset) => {
        if (result.status === "fulfilled") summary[result.value] += 1;
        else {
          summary.errors += 1;
          console.error("Tap renewal failed", {
            orderId: batch[offset]?.order_id,
            message: result.reason?.message || "unknown",
          });
        }
      });
    }
    return sendJson(res, summary.errors ? 207 : 200, summary);
  } catch (error) {
    return sendError(res, error);
  }
}
