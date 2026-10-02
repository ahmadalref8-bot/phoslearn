export const PLANS = Object.freeze({
  access_30_days: Object.freeze({
    code: "access_30_days",
    uiCode: "month",
    amount: 1900,
    currency: "SAR",
    durationDays: 30,
    description: "اشتراك فوس المتجدد كل 30 يومًا",
  }),
  access_90_days: Object.freeze({
    code: "access_90_days",
    uiCode: "season",
    amount: 3900,
    currency: "SAR",
    durationDays: 90,
    description: "اشتراك فوس المتجدد كل 90 يومًا",
  }),
});

// Increment this value whenever the recurring-payment wording changes. The
// checkout endpoint requires the browser to send this exact version and stores
// it with the order as evidence of the consent presented to the customer.
export const RECURRING_TERMS_VERSION = "2026-09-26";
export const RENEWAL_GRACE_HOURS = 48;

export function getPlan(planCode) {
  return typeof planCode === "string" && Object.hasOwn(PLANS, planCode)
    ? PLANS[planCode]
    : null;
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function requireSecret(name, minimumLength = 32) {
  const value = requireEnv(name);
  const distinctCharacters = new Set(value).size;
  if (value.length < minimumLength
    || /\s/.test(value)
    || distinctCharacters < 8
    || /^(?:replace_me|generate_|change_me)/i.test(value)) {
    throw new Error(`${name} must be a strong random secret`);
  }
  return value;
}

export function supabaseServerKey() {
  const value = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Missing server environment variable: SUPABASE_SECRET_KEY");
  if (value.length < 32 || /^(?:your_|replace_me)/i.test(value)) throw new Error("SUPABASE_SECRET_KEY is invalid");
  return value;
}

export function tapLiveMode() {
  const value = requireEnv("TAP_LIVE_MODE");
  if (!["true", "false"].includes(value)) throw new Error("TAP_LIVE_MODE must be true or false");
  return value === "true";
}

export function tapSecretKey() {
  const value = requireEnv("TAP_SECRET_KEY");
  const live = value.startsWith("sk_live_");
  const test = value.startsWith("sk_test_");
  if ((!live && !test) || live !== tapLiveMode() || value.length < 24 || /replace_me/i.test(value)) {
    throw new Error("TAP_SECRET_KEY does not match TAP_LIVE_MODE");
  }
  return value;
}

export function tapMerchantId() {
  const value = requireEnv("TAP_MERCHANT_ID").trim();
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(value) || /replace_me/i.test(value)) {
    throw new Error("TAP_MERCHANT_ID is invalid");
  }
  return value;
}

export function cronSecret() {
  return requireSecret("CRON_SECRET");
}

export function getAppUrl() {
  const url = new URL(requireEnv("APP_URL"));
  if (url.pathname !== "/" || url.search || url.hash) throw new Error("APP_URL must contain only the site origin");
  if (tapLiveMode() && url.protocol !== "https:") throw new Error("APP_URL must use HTTPS in live mode");
  if (!tapLiveMode() && !["http:", "https:"].includes(url.protocol)) throw new Error("APP_URL protocol is invalid");
  return url.origin;
}

export function getSupabaseUrl() {
  const url = new URL(requireEnv("SUPABASE_URL"));
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.hostname.includes("YOUR_PROJECT") || url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !local)) {
    throw new Error("SUPABASE_URL must be an HTTPS project origin");
  }
  return url.origin;
}

export function getAiOrigin() {
  const url = new URL(requireEnv("PHOS_AI_ORIGIN"));
  const allowedHosts = requireEnv("PHOS_AI_ALLOWED_HOSTS").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || !allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error("PHOS_AI_ORIGIN must use HTTPS and an explicitly allowed host");
  }
  return url.href;
}

export function getTelegramCommunityUrl() {
  const url = new URL(requireEnv("TELEGRAM_COMMUNITY_URL"));
  if (url.protocol !== "https:" || !["t.me", "telegram.me"].includes(url.hostname) || /replace_me/i.test(url.pathname) || url.pathname === "/") {
    throw new Error("TELEGRAM_COMMUNITY_URL must be a real HTTPS Telegram invite");
  }
  return url.href;
}
