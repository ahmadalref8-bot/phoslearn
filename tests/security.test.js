import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  getAiOrigin,
  getAppUrl,
  getPlan,
  RECURRING_TERMS_VERSION,
  requireSecret,
} from "../api/_lib/config.js";
import { safeEqual } from "../api/_lib/http.js";
import {
  minorToTapAmount,
  tapAmountToMinor,
  verifyTapWebhook,
} from "../api/_lib/tap.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (relative) => readFile(path.join(ROOT, relative), "utf8");

function withEnv(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  try {
    return callback();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

test("paid plan price and duration are server-owned", () => {
  assert.deepEqual(
    { amount: getPlan("access_30_days").amount, days: getPlan("access_30_days").durationDays },
    { amount: 1900, days: 30 },
  );
  assert.deepEqual(
    { amount: getPlan("access_90_days").amount, days: getPlan("access_90_days").durationDays },
    { amount: 3900, days: 90 },
  );
  assert.equal(getPlan("free"), null);
  assert.equal(getPlan("access_365_days"), null);
});

test("constant-time comparison and secret validation fail closed", () => {
  assert.equal(safeEqual("same-secret", "same-secret"), true);
  assert.equal(safeEqual("same-secret", "other-secret"), false);
  assert.equal(safeEqual("short", "much-longer"), false);
  assert.equal(safeEqual(undefined, "value"), false);
  withEnv({ TEST_RANDOM_SECRET: "GENERATE_A_LONG_RANDOM_VALUE" }, () => {
    assert.throws(() => requireSecret("TEST_RANDOM_SECRET"), /strong random secret/);
  });
  withEnv({ TEST_RANDOM_SECRET: "a".repeat(32) }, () => {
    assert.throws(() => requireSecret("TEST_RANDOM_SECRET"), /strong random secret/);
  });
  withEnv({ TEST_RANDOM_SECRET: "9aB!2cD@4eF#6gH$8iJ%0kL^2mN&4pQ*" }, () => {
    assert.equal(requireSecret("TEST_RANDOM_SECRET"), "9aB!2cD@4eF#6gH$8iJ%0kL^2mN&4pQ*");
  });
});

test("live application origin requires HTTPS and AI upstream is allowlisted", () => {
  withEnv({ APP_URL: "https://phoslearn.vercel.app/", TAP_LIVE_MODE: "false" }, () => {
    assert.equal(getAppUrl(), "https://phoslearn.vercel.app");
  });
  withEnv({ APP_URL: "http://phoslearn.vercel.app", TAP_LIVE_MODE: "true" }, () => {
    assert.throws(() => getAppUrl(), /HTTPS/);
  });
  withEnv({
    PHOS_AI_ORIGIN: "https://assistant.example.com/v1",
    PHOS_AI_ALLOWED_HOSTS: "assistant.example.com",
  }, () => {
    assert.equal(getAiOrigin(), "https://assistant.example.com/v1");
  });
  withEnv({
    PHOS_AI_ORIGIN: "https://redirector.example.net/v1",
    PHOS_AI_ALLOWED_HOSTS: "assistant.example.com",
  }, () => {
    assert.throws(() => getAiOrigin(), /allowed host/);
  });
});

test("Tap SAR conversion is exact and webhook hash verification is fail-closed", () => {
  assert.equal(minorToTapAmount(1900), 19);
  assert.equal(minorToTapAmount(3900), 39);
  assert.equal(tapAmountToMinor("19.00"), 1900);
  assert.throws(() => tapAmountToMinor(19.001), /precision/);

  const payload = {
    id: "chg_ABCDEF123456",
    object: "charge",
    amount: 19,
    currency: "SAR",
    status: "CAPTURED",
    live_mode: false,
    reference: { gateway: "gw_1", payment: "pay_1" },
    transaction: { created: "1790272800000" },
  };
  const secret = "sk_test_1234567890abcdefghijklmnopqrstuvwxyz";
  const input = "x_idchg_ABCDEF123456x_amount19.00x_currencySARx_gateway_referencegw_1x_payment_referencepay_1x_statusCAPTUREDx_created1790272800000";
  const signature = crypto.createHmac("sha256", secret).update(input).digest("hex");
  withEnv({ TAP_SECRET_KEY: secret, TAP_LIVE_MODE: "false" }, () => {
    assert.equal(verifyTapWebhook(payload, signature), true);
    assert.equal(verifyTapWebhook(payload, `${signature.slice(0, -1)}0`), false);
    assert.equal(verifyTapWebhook({ ...payload, currency: "USD" }, signature), false);
  });
});

test("frontend requires explicit recurring consent and keeps paid AI/community gates", async () => {
  const [app, membership, pages] = await Promise.all([
    load("src/App.jsx"),
    load("src/hooks/useMembership.js"),
    load("src/components/PublicPages.jsx"),
  ]);
  assert.match(app, /const \[recurringConsent, setRecurringConsent\] = useState\(false\)/);
  assert.match(app, /recurringConsent: true/);
  assert.match(app, /termsVersion: LEGAL_VERSION/);
  assert.equal(RECURRING_TERMS_VERSION, "2026-09-26");
  assert.match(pages, /LEGAL_VERSION = "2026-09-26"/);
  assert.match(app, /١٩ ر\.س تلقائيًا كل ٣٠ يومًا/);
  assert.match(app, /٣٩ ر\.س تلقائيًا كل ٩٠ يومًا/);
  assert.match(app, /fetch\("\/api\/ai"/);
  assert.match(app, /fetch\("\/api\/community"/);
  assert.match(app, /const hasAI = isPaid/);
  assert.match(membership, /inRenewalGrace/);
  assert.match(pages, /Ahmed abdulaziz alrefaei/);
  assert.match(pages, /VITE_SUPPORT_EMAIL/);
  assert.match(pages, /phoslearn@gmail\.com/);
  assert.match(pages, /\/privacy/);
  assert.match(pages, /\/terms/);
  assert.match(pages, /\/refund-policy/);
});

test("private benefit configuration is server-only", async () => {
  const [app, community, ai, envExample] = await Promise.all([
    load("src/App.jsx"),
    load("api/community.js"),
    load("api/ai.js"),
    load(".env.example"),
  ]);
  assert.doesNotMatch(app, /TELEGRAM_COMMUNITY_URL|PHOS_AI_PROXY_SECRET/);
  assert.match(community, /if \(!membership\.isPaid\)/);
  assert.match(ai, /if \(!membership\.isPaid\)/);
  assert.match(envExample, /TELEGRAM_COMMUNITY_URL=/);
  assert.match(envExample, /PHOS_AI_PROXY_SECRET=/);
});

test("checkout blocks active, past-due, and already-due canceled cycles", async () => {
  const checkout = await load("api/checkout.js");
  assert.match(checkout, /subscription_already_active/);
  assert.match(checkout, /existingSubscription\?\.status === "past_due"/);
  assert.match(checkout, /hasDueCanceledCycle/);
  assert.match(checkout, /next_renewal_attempt_at/);
  assert.match(checkout, /charge_submission_not_started/);
  assert.match(checkout, /charge_submission_started/);
  assert.match(checkout, /tap_create_ambiguous/);
  assert.match(checkout, /reference: \{ transaction: referenceTransaction, order: orderId, idempotent: referenceTransaction \}/);
  assert.match(checkout, /customer_initiated: true/);
  assert.match(checkout, /threeDSecure: true/);
  assert.match(checkout, /save_card: true/);
  assert.match(checkout, /source: \{ id: "src_card" \}/);
  assert.doesNotMatch(checkout, /body\.amount|body\.duration/);
});

test("renewal is MIT, bounded, and sized for the first 50 subscribers", async () => {
  const [renewal, vercel] = await Promise.all([
    load("api/renew-subscriptions.js"),
    load("vercel.json").then(JSON.parse),
  ]);
  assert.match(renewal, /export const maxDuration = 300/);
  assert.match(renewal, /p_limit: 50/);
  assert.match(renewal, /index \+= 5/);
  assert.match(renewal, /Promise\.allSettled/);
  assert.match(renewal, /customer_initiated: false/);
  assert.match(renewal, /threeDSecure: false/);
  assert.match(renewal, /save_card: false/);
  assert.match(renewal, /payment_agreement: \{ id: row\.tap_payment_agreement_id \}/);
  assert.match(renewal, /idempotent: row\.reference_transaction/);
  assert.equal(vercel.functions["api/renew-subscriptions.js"].maxDuration, 300);
  assert.deepEqual(vercel.crons, [{ path: "/api/renew-subscriptions", schedule: "5 * * * *" }]);
});

test("database schema serializes subscription changes and preserves one claimed due cycle", async () => {
  const schema = await load("supabase/schema.sql");
  assert.match(schema, /payment_orders_one_pending_user_idx/i);
  assert.match(schema, /where status = 'pending'/i);
  assert.match(schema, /perform pg_advisory_xact_lock\(hashtextextended\('subscription:'/i);
  assert.match(schema, /create or replace function public\.activate_tap_initial_payment/i);
  assert.match(schema, /create or replace function public\.complete_tap_renewal/i);
  assert.match(schema, /create or replace function public\.cancel_tap_subscription/i);
  assert.match(schema, /create or replace function public\.claim_due_tap_renewals/i);
  assert.match(schema, /s\.current_period_end <= p_claimed_at/i);
  assert.match(schema, /v_order\.created_at <= p_claimed_at - interval '23 hours'/i);
  assert.match(schema, /v_order\.created_at \+ interval '48 hours'/i);
  assert.match(schema, /current_period_end \+ interval '48 hours' <= p_claimed_at/i);
  assert.match(schema, /renewal_window_elapsed_manual_review/i);
  assert.match(schema, /when v_due_renewal then coalesce\(next_renewal_attempt_at, current_period_end\)/i);
  assert.doesNotMatch(schema.match(/create or replace function public\.cancel_tap_subscription[\s\S]*?\$\$;/i)?.[0] || "", /update public\.payment_orders/i);
  // One increment is for a late already-linked charge that is retrieval-only;
  // the other is the normal in-window renewal claim. Neither branch creates
  // two rows for the same candidate.
  assert.equal((schema.match(/v_returned := v_returned \+ 1;/g) || []).length, 2);
  assert.match(schema, /revoke all on table public\.payment_orders from anon, authenticated/i);
  assert.match(schema, /grant execute on function public\.claim_due_tap_renewals\(integer, timestamptz\) to service_role/i);
  assert.equal((schema.match(/create or replace function/gi) || []).length, (schema.match(/\$\$;/g) || []).length);
  assert.match(schema, /^begin;/m);
  assert.match(schema, /commit;\s*$/);
});

test("reconciliation verifies Tap objects, capture time, agreement, and cumulative refunds", async () => {
  const [tap, reconcile, webhook] = await Promise.all([
    load("api/_lib/tap.js"),
    load("api/_lib/reconcile.js"),
    load("api/tap-webhook.js"),
  ]);
  assert.match(reconcile, /transaction\?\.date\?\.completed/);
  assert.match(reconcile, /status === "CAPTURED"/);
  assert.match(reconcile, /String\(contract\.id\)\.startsWith\("card_"\)/);
  assert.match(reconcile, /validateTapMode\(refund\)/);
  assert.match(reconcile, /listRefundsForCharge\(charge\.id\)/);
  assert.match(reconcile, /refundedMinor \+= tapAmountToMinor\(item\.amount\)/);
  assert.match(reconcile, /refundedMinor < Number\(order\.amount\)/);
  assert.match(reconcile, /refund webhook can race the original CAPTURED webhook/);
  assert.doesNotMatch(reconcile, /order\.status !== "paid"/);
  assert.match(tap, /body: \{ charges: \[assertTapChargeId\(chargeId\)\], limit: 50 \}/);
  assert.match(webhook, /verifyTapWebhook/);
  assert.match(webhook, /reconcileTapCharge\(providerId\)/);
  assert.match(webhook, /reconcileTapRefund\(providerId\)/);
});

test("legacy provider implementation, merge markers, and real secrets are absent", async () => {
  const providerName = ["moya", "sar"].join("");
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else files.push(absolute);
    }
  }
  await walk(ROOT);
  const checked = files.filter((file) => !file.endsWith("tests/security.test.js"));
  for (const file of checked) {
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content.toLowerCase(), new RegExp(providerName), path.relative(ROOT, file));
    assert.doesNotMatch(content, /^(<{7}|={7}|>{7})/m, path.relative(ROOT, file));
    if (!file.endsWith(".env.example")) {
      assert.doesNotMatch(content, /sk_(?:live|test)_[A-Za-z0-9]{20,}/, path.relative(ROOT, file));
      assert.doesNotMatch(content, /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/, path.relative(ROOT, file));
    }
  }
});
