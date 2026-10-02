import { assertUuid, sendError, sendJson } from "./_lib/http.js";
import { reconcileTapCharge } from "./_lib/reconcile.js";
import { activeMembership, getSupabaseAdmin, requireUser } from "./_lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  try {
    const { user } = await requireUser(req);
    const orderId = assertUuid(req.query.order_id, "رقم الطلب");
    const admin = getSupabaseAdmin();
    let { data: order, error } = await admin
      .from("payment_orders")
      .select("id,status,tap_charge_id,plan_code,paid_at")
      .eq("id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!order) return sendJson(res, 404, { error: "order_not_found", message: "لم نجد عملية الدفع لهذا الحساب." });

    // The browser can request a status refresh, but only Tap's server response
    // can activate access. This also recovers a missed/delayed webhook.
    if (["pending", "expired", "failed"].includes(order.status) && order.tap_charge_id) {
      try {
        await reconcileTapCharge(order.tap_charge_id);
        ({ data: order, error } = await admin
          .from("payment_orders")
          .select("id,status,tap_charge_id,plan_code,paid_at")
          .eq("id", orderId)
          .eq("user_id", user.id)
          .single());
        if (error) throw error;
      } catch (verificationError) {
        if (verificationError?.code !== "provider_not_captured") console.error("Tap status refresh failed", verificationError);
      }
    }

    const membership = await activeMembership(user.id);
    return sendJson(res, 200, { order: { id: order.id, status: order.status, planCode: order.plan_code }, membership });
  } catch (error) {
    return sendError(res, error);
  }
}
