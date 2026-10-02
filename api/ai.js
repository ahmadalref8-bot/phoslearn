import { getAiOrigin, requireSecret } from "./_lib/config.js";
import { HttpError, parseBody, sendError } from "./_lib/http.js";
import { refreshProviderStateIfDue } from "./_lib/reconcile.js";
import { activeMembership, getSupabaseAdmin, requireUser } from "./_lib/supabase-admin.js";

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 12) {
    throw new HttpError(400, "المحادثة غير صالحة.", "invalid_messages");
  }
  let total = 0;
  return messages.map((message) => {
    const role = message?.role === "assistant" ? "assistant" : message?.role === "user" ? "user" : null;
    const content = typeof message?.content === "string" ? message.content : "";
    total += content.length;
    if (!role || !content || content.length > 4000 || total > 12000) {
      throw new HttpError(400, "المحادثة طويلة أو غير صالحة.", "invalid_messages");
    }
    return { role, content };
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    const { user } = await requireUser(req);
    await refreshProviderStateIfDue(user.id).catch((syncError) => console.error("Provider membership refresh failed", syncError));
    const membership = await activeMembership(user.id);
    if (!membership.isPaid) throw new HttpError(403, "المساعد الذكي للمشتركين فقط.", "subscription_required");
    const { data: quota, error: quotaError } = await getSupabaseAdmin().rpc("consume_ai_quota", { p_user_id: user.id });
    if (quotaError) throw quotaError;
    if (!quota?.allowed) {
      throw new HttpError(429, quota?.reason === "daily" ? "وصلت للحد العادل للشرح الذكي اليوم؛ يتجدد غدًا." : "طلبات كثيرة بسرعة؛ انتظر دقيقة ثم جرّب.", "ai_rate_limited");
    }
    const body = parseBody(req);
    const messages = validateMessages(body.messages);
    const headers = {
      "Content-Type": "application/json",
      "X-Phos-Proxy-Secret": requireSecret("PHOS_AI_PROXY_SECRET"),
    };

    const upstream = await fetch(getAiOrigin(), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers,
      body: JSON.stringify({
        model: process.env.PHOS_AI_MODEL || "claude-sonnet-4-6",
        max_tokens: 700,
        messages,
      }),
    });
    const text = await upstream.text();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    return res.status(upstream.status).send(text);
  } catch (error) {
    return sendError(res, error);
  }
}
