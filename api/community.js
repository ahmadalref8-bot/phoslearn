import { getTelegramCommunityUrl } from "./_lib/config.js";
import { HttpError, sendError, sendJson } from "./_lib/http.js";
import { refreshProviderStateIfDue } from "./_lib/reconcile.js";
import { activeMembership, requireUser } from "./_lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  try {
    const { user } = await requireUser(req);
    await refreshProviderStateIfDue(user.id).catch((syncError) => console.error("Provider membership refresh failed", syncError));
    const membership = await activeMembership(user.id);
    if (!membership.isPaid) throw new HttpError(403, "هذه الميزة للمشتركين فقط.", "subscription_required");
    return sendJson(res, 200, { url: getTelegramCommunityUrl() });
  } catch (error) {
    return sendError(res, error);
  }
}
