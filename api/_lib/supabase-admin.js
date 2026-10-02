import { createClient } from "@supabase/supabase-js";
import { RENEWAL_GRACE_HOURS, getSupabaseUrl, supabaseServerKey } from "./config.js";
import { HttpError, bearerToken } from "./http.js";

let cachedAdmin;

export function getSupabaseAdmin() {
  if (!cachedAdmin) {
    cachedAdmin = createClient(getSupabaseUrl(), supabaseServerKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cachedAdmin;
}

export async function requireUser(req) {
  const token = bearerToken(req);
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "انتهت جلسة الدخول؛ سجّل الدخول مجددًا.", "invalid_session");
  return { user: data.user, token };
}

export async function activeMembership(userId) {
  const { data, error } = await getSupabaseAdmin()
    .from("subscriptions")
    .select("plan_code,status,active_until,current_period_end,auto_renew,cancel_at_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  const currentPeriodEnd = data?.current_period_end || data?.active_until || null;
  const endMillis = currentPeriodEnd ? Date.parse(currentPeriodEnd) : NaN;
  const now = Date.now();
  const renewalIsEnabled = Boolean(data?.auto_renew && !data?.cancel_at_period_end);
  const graceEndMillis = Number.isFinite(endMillis)
    ? endMillis + RENEWAL_GRACE_HOURS * 60 * 60_000
    : NaN;
  const inRenewalGrace = renewalIsEnabled
    && ["active", "past_due"].includes(data?.status)
    && endMillis <= now
    && graceEndMillis > now;
  const isPaid = ["active", "past_due"].includes(data?.status)
    && Number.isFinite(endMillis)
    && (endMillis > now || inRenewalGrace);
  const activeUntil = inRenewalGrace ? new Date(graceEndMillis).toISOString() : currentPeriodEnd;
  const subscriptionStatus = data?.status
    ? (isPaid ? data.status : (Number.isFinite(endMillis) && endMillis <= now ? "expired" : data.status))
    : "inactive";
  return {
    isPaid: Boolean(isPaid),
    planCode: isPaid ? data.plan_code : null,
    plan: isPaid ? (data.plan_code === "access_90_days" ? "season" : "month") : "free",
    activeUntil,
    currentPeriodEnd,
    autoRenew: renewalIsEnabled,
    cancelAtPeriodEnd: Boolean(data?.cancel_at_period_end),
    subscriptionStatus,
    inRenewalGrace,
  };
}
