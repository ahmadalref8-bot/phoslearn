import { sendError, sendJson } from "./_lib/http.js";
import { activeMembership, getSupabaseAdmin, requireUser } from "./_lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  try {
    const { user } = await requireUser(req);
    const { error } = await getSupabaseAdmin().rpc("cancel_tap_subscription", {
      p_user_id: user.id,
    });
    if (error) throw error;

    // Cancellation is deliberately "at period end": the RPC disables future
    // renewal under the same DB lock used by the renewal claimer, while this
    // membership remains paid until current_period_end.
    const membership = await activeMembership(user.id);
    return sendJson(res, 200, { canceled: true, membership });
  } catch (error) {
    return sendError(res, error);
  }
}
