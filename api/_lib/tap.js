import crypto from "node:crypto";
import { tapLiveMode, tapMerchantId, tapSecretKey } from "./config.js";
import { safeEqual } from "./http.js";

const API_BASE = "https://api.tap.company/v2";
const CHARGE_ID = /^chg_[A-Za-z0-9_-]{6,120}$/;
const REFUND_ID = /^re_[A-Za-z0-9_-]{4,120}$/;
const TOKEN_ID = /^tok_[A-Za-z0-9_-]{6,120}$/;

export const TAP_TERMINAL_FAILURES = new Set([
  "ABANDONED",
  "CANCELLED",
  "CANCELED",
  "EXPIRED",
  "FAILED",
  "DECLINED",
  "RESTRICTED",
  "REFUNDED",
  "VOID",
  "VOIDED",
  "TIMEDOUT",
  "UNKNOWN",
]);

function providerErrorMessage(payload) {
  if (Array.isArray(payload?.errors)) {
    return payload.errors.map((item) => item?.code || item?.description).filter(Boolean).slice(0, 3).join(", ");
  }
  return payload?.error?.code || payload?.response?.code || "unknown";
}

async function tapRequest(path, { method = "GET", body, timeoutMs = 8_000 } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: `Bearer ${tapSecretKey()}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(`Tap API ${response.status} (${providerErrorMessage(payload)})`);
    error.status = response.status;
    error.providerCode = providerErrorMessage(payload);
    throw error;
  }
  return payload;
}

export function assertTapChargeId(value) {
  if (typeof value !== "string" || !CHARGE_ID.test(value)) throw new Error("Invalid Tap charge ID");
  return value;
}

export function assertTapRefundId(value) {
  if (typeof value !== "string" || !REFUND_ID.test(value)) throw new Error("Invalid Tap refund ID");
  return value;
}

export function minorToTapAmount(minor) {
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error("Invalid minor-unit amount");
  return Number((minor / 100).toFixed(2));
}

export function tapAmountToMinor(amount) {
  const numeric = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error("Invalid Tap amount");
  const minor = Math.round(numeric * 100);
  if (!Number.isSafeInteger(minor) || Math.abs(numeric - minor / 100) > 1e-9) {
    throw new Error("Tap amount has invalid SAR precision");
  }
  return minor;
}

export function createCharge(payload) {
  return tapRequest("/charges/", { method: "POST", body: payload, timeoutMs: 12_000 });
}

export function retrieveCharge(chargeId) {
  return tapRequest(`/charges/${encodeURIComponent(assertTapChargeId(chargeId))}`, { timeoutMs: 8_000 });
}

export function retrieveRefund(refundId) {
  return tapRequest(`/refunds/${encodeURIComponent(assertTapRefundId(refundId))}`, { timeoutMs: 8_000 });
}

export async function listRefundsForCharge(chargeId) {
  const payload = await tapRequest("/refunds/list", {
    method: "POST",
    timeoutMs: 8_000,
    body: { charges: [assertTapChargeId(chargeId)], limit: 50 },
  });
  if (payload?.object !== "list" || !Array.isArray(payload.refunds)) {
    throw new Error("Tap returned an invalid refund list");
  }
  validateTapMode(payload);
  return payload;
}

export async function createSavedCardToken(customerId, cardId) {
  if (typeof customerId !== "string" || !customerId.startsWith("cus_")) throw new Error("Invalid Tap customer ID");
  if (typeof cardId !== "string" || !cardId.startsWith("card_")) throw new Error("Invalid Tap card ID");
  const token = await tapRequest("/tokens/", {
    method: "POST",
    timeoutMs: 8_000,
    body: {
      saved_card: { customer_id: customerId, card_id: cardId },
      client_ip: "127.0.0.1",
    },
  });
  if (typeof token?.id !== "string" || !TOKEN_ID.test(token.id) || token.used === true) {
    throw new Error("Tap returned an invalid saved-card token");
  }
  if (typeof token.live_mode === "boolean" && token.live_mode !== tapLiveMode()) {
    throw new Error("Tap token mode mismatch");
  }
  if (token.card?.id && token.card.id !== cardId) throw new Error("Tap token card mismatch");
  return token;
}

export function validateTapMode(providerObject) {
  if (typeof providerObject?.live_mode !== "boolean" || providerObject.live_mode !== tapLiveMode()) {
    throw new Error("Tap object mode mismatch");
  }
}

export function validateTapAccount(charge) {
  validateTapMode(charge);
  const returnedMerchant = charge?.merchant?.id ?? charge?.merchant_id;
  if (String(returnedMerchant || "") !== tapMerchantId()) throw new Error("Tap merchant mismatch");
}

function sarHashAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) throw new Error("Invalid webhook amount");
  return numeric.toFixed(2);
}

export function verifyTapWebhook(payload, postedHash) {
  if (!payload || !["charge", "refund"].includes(payload.object) || typeof postedHash !== "string") return false;
  const id = typeof payload.id === "string" ? payload.id : "";
  const currency = typeof payload.currency === "string" ? payload.currency : "";
  const status = typeof payload.status === "string" ? payload.status : "";
  const gateway = payload.reference?.gateway == null ? "" : String(payload.reference.gateway);
  const payment = payload.reference?.payment == null ? "" : String(payload.reference.payment);
  const createdValue = payload.object === "refund" ? payload.created : payload.transaction?.created;
  const created = createdValue == null ? "" : String(createdValue);
  const validId = payload.object === "refund" ? REFUND_ID.test(id) : CHARGE_ID.test(id);
  if (!validId || currency !== "SAR" || !status || !created) return false;

  let amount;
  try {
    amount = sarHashAmount(payload.amount);
  } catch {
    return false;
  }
  const hashInput = `x_id${id}x_amount${amount}x_currency${currency}x_gateway_reference${gateway}x_payment_reference${payment}x_status${status}x_created${created}`;
  const calculated = crypto.createHmac("sha256", tapSecretKey()).update(hashInput).digest("hex");
  return safeEqual(calculated, postedHash.toLowerCase());
}
