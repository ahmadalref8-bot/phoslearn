import { HttpError, parseBody, sendError, sendJson } from "./_lib/http.js";
import { reconcileTapCharge, reconcileTapRefund } from "./_lib/reconcile.js";
import { assertTapChargeId, assertTapRefundId, verifyTapWebhook } from "./_lib/tap.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  try {
    const payload = parseBody(req);
    const postedHash = Array.isArray(req.headers.hashstring)
      ? req.headers.hashstring[0]
      : req.headers.hashstring;
    if (!verifyTapWebhook(payload, postedHash)) {
      throw new HttpError(401, "Unauthorized webhook", "invalid_webhook_hash");
    }

    let providerId;
    try {
      providerId = payload.object === "refund"
        ? assertTapRefundId(payload.id)
        : assertTapChargeId(payload.id);
    } catch {
      throw new HttpError(400, "Invalid Tap charge", "invalid_charge");
    }

    // The signed webhook is only a notification. Entitlements are decided
    // from a fresh server-to-server Retrieve Charge response, never its body.
    try {
      if (payload.object === "refund") {
        const result = await reconcileTapRefund(providerId);
        return sendJson(res, 200, {
          received: true,
          reconciled: Boolean(result.reversed),
          partial: Boolean(result.partial),
        });
      }
      await reconcileTapCharge(providerId);
      return sendJson(res, 200, { received: true, reconciled: true });
    } catch (error) {
      if (error?.code === "provider_not_captured") {
        return sendJson(res, 200, {
          received: true,
          reconciled: false,
          providerStatus: error.providerStatus || "PENDING",
        });
      }
      throw error;
    }
  } catch (error) {
    return sendError(res, error);
  }
}
