import { sendError, sendJson } from "./_lib/http.js";
import { refreshProviderStateIfDue } from "./_lib/reconcile.js";
import { activeMembership, requireUser } from "./_lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  try {
    const { user } = await requireUser(req);
    await refreshProviderStateIfDue(user.id).catch((syncError) => console.error("Provider membership refresh failed", syncError));
    const membership = await activeMembership(user.id);
    return sendJson(res, 200, { ...membership, email: user.email || null });
  } catch (error) {
    return sendError(res, error);
  }
}
