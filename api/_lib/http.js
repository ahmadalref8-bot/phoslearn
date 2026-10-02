import crypto from "node:crypto";

export class HttpError extends Error {
  constructor(status, message, code = "request_error") {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function sendJson(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

export function sendError(res, error) {
  if (error instanceof HttpError) {
    sendJson(res, error.status, { error: error.code, message: error.message });
    return;
  }
  console.error(error);
  sendJson(res, 500, { error: "server_error", message: "تعذر إكمال الطلب الآن." });
}

export function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    throw new HttpError(400, "صيغة الطلب غير صحيحة.", "invalid_json");
  }
}

export function bearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new HttpError(401, "سجّل الدخول أولًا.", "authentication_required");
  return match[1];
}

export function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function assertUuid(value, fieldName = "id") {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, `${fieldName} غير صالح.`, "invalid_id");
  }
  return value;
}

