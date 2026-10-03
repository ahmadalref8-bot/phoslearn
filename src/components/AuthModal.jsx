import React, { useEffect, useState } from "react";

function normalizeOtp(value) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  return String(value || "")
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/\D/g, "")
    .slice(0, 8);
}

const OTP_COOLDOWN_SECONDS = 60;
const OTP_STORAGE_PREFIX = "phos-otp-cooldown:";
const cooldownMemory = new Map();

function cooldownKey(email) {
  return `${OTP_STORAGE_PREFIX}${String(email || "").trim().toLowerCase()}`;
}

function readCooldown(email) {
  if (!email) return 0;
  const key = cooldownKey(email);
  let until = Number(cooldownMemory.get(key) || 0);
  if (typeof window !== "undefined") {
    try {
      until = Math.max(until, Number(window.sessionStorage.getItem(key) || 0));
    } catch (error) {}
  }
  const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
  if (!remaining) {
    cooldownMemory.delete(key);
    if (typeof window !== "undefined") {
      try { window.sessionStorage.removeItem(key); } catch (error) {}
    }
  }
  return remaining;
}

function saveCooldown(email, seconds = OTP_COOLDOWN_SECONDS) {
  const safeSeconds = Math.max(1, Number(seconds) || OTP_COOLDOWN_SECONDS);
  const key = cooldownKey(email);
  const until = Date.now() + safeSeconds * 1000;
  cooldownMemory.set(key, until);
  if (typeof window !== "undefined") {
    try { window.sessionStorage.setItem(key, String(until)); } catch (error) {}
  }
  return safeSeconds;
}

function retryAfterSeconds(authError) {
  const raw = String(authError?.message || "");
  const match = raw.match(/(?:after|in|wait)\s*(\d+)\s*(?:seconds?|secs?|s)\b/i) ||
    raw.match(/(\d+)\s*(?:seconds?|secs?)\b/i);
  return match ? Math.max(1, Number(match[1])) : 0;
}

function isRateLimitError(authError) {
  const raw = String(authError?.code || authError?.message || "").toLowerCase();
  return authError?.status === 429 || raw.includes("rate") || raw.includes("too many");
}

function friendlyAuthError(authError) {
  const raw = String(authError?.code || authError?.message || "").toLowerCase();
  if (
    raw.includes("otp_expired") ||
    raw.includes("token has expired") ||
    raw.includes("invalid token") ||
    raw.includes("invalid otp")
  ) {
    return "الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزًا جديدًا وحاول مرة أخرى.";
  }
  if (raw.includes("rate") || raw.includes("too many") || authError?.status === 429) {
    return "تم طلب رموز كثيرة خلال وقت قصير. انتظر قليلًا، ثم اطلب رمزًا واحدًا جديدًا.";
  }
  if (raw.includes("user already registered") || raw.includes("user_already_exists")) {
    return "يوجد حساب بهذا البريد بالفعل. اختر تسجيل الدخول.";
  }
  if (raw.includes("password") && (raw.includes("weak") || raw.includes("short"))) {
    return "اختر كلمة مرور أقوى من 8 أحرف وتحتوي أرقامًا وحروفًا.";
  }
  if (raw.includes("invalid login") || raw.includes("invalid credentials") || raw.includes("invalid_credentials")) {
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  }
  if (raw.includes("not authorized") || raw.includes("email address")) {
    return "إرسال البريد التجريبي لا يسمح بهذا العنوان حاليًا. تواصل مع دعم فوس.";
  }
  return "تعذر إكمال الدخول الآن. حاول مرة أخرى بعد قليل.";
}

export default function AuthModal({ open, onClose, onSend, onVerifyOtp, onPasswordSignIn, configured, color = "#1B3AC8", ink = "#241B4D" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState("magic");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setNotice("");
      setSent(false);
      setCode("");
      setCooldown(0);
      setResending(false);
      setMode("magic");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !sent || !email) return undefined;
    const updateCooldown = () => setCooldown(readCooldown(email));
    updateCooldown();
    const timer = window.setInterval(updateCooldown, 1000);
    return () => window.clearInterval(timer);
  }, [open, sent, email]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) { setError("اكتب بريدًا إلكترونيًا صحيحًا."); return; }
    if (mode === "password" && password.length < 8) {
      setError("اكتب كلمة مرور من 8 أحرف على الأقل.");
      return;
    }
    setEmail(clean);
    setLoading(true); setError("");
    try {
      if (mode === "password") {
        await onPasswordSignIn(clean, password);
        onClose?.();
      } else {
        const existingCooldown = readCooldown(clean);
        if (existingCooldown > 0) {
          setCooldown(existingCooldown);
          setNotice("استخدم آخر رمز وصلك، أو انتظر حتى يتاح إرسال رمز جديد.");
          setSent(true);
          return;
        }
        await onSend(clean);
        setCooldown(saveCooldown(clean));
        setNotice("تم إرسال رمز الدخول إلى بريدك.");
        setSent(true);
      }
    } catch (sendError) {
      const retrySeconds = retryAfterSeconds(sendError);
      if (mode !== "password" && isRateLimitError(sendError)) {
        setCooldown(saveCooldown(clean, retrySeconds || OTP_COOLDOWN_SECONDS));
        setNotice("استخدم آخر رمز وصلك، ثم أعد الإرسال بعد انتهاء العدّاد.");
        setSent(true);
      }
      setError(friendlyAuthError(sendError));
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    const clean = email.trim().toLowerCase();
    const remaining = readCooldown(clean);
    if (remaining > 0) {
      setCooldown(remaining);
      return;
    }
    setResending(true);
    setError("");
    setNotice("");
    try {
      await onSend(clean);
      setCode("");
      setCooldown(saveCooldown(clean));
      setNotice("أرسلنا رمزًا جديدًا إلى بريدك.");
    } catch (sendError) {
      const retrySeconds = retryAfterSeconds(sendError);
      if (isRateLimitError(sendError)) {
        setCooldown(saveCooldown(clean, retrySeconds || OTP_COOLDOWN_SECONDS));
      }
      setError(friendlyAuthError(sendError));
    } finally {
      setResending(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    const cleanCode = normalizeOtp(code);
    if (cleanCode.length < 6 || cleanCode.length > 8) {
      setError("اكتب رمز الدخول كاملًا كما وصلك في البريد.");
      return;
    }
    setCode(cleanCode);
    setLoading(true); setError("");
    try {
      await onVerifyOtp(email, cleanCode);
      onClose?.();
    } catch (verifyError) {
      setError(friendlyAuthError(verifyError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="تسجيل الدخول" style={{ position: "absolute", inset: 0, zIndex: 90, background: "rgba(36,27,77,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} style={{ background: "#fff", color: ink, borderRadius: 24, width: "100%", maxWidth: 380, padding: "26px 22px", boxShadow: "0 22px 70px rgba(36,27,77,0.28)", textAlign: "right" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>{mode === "magic" ? "دخول أو إنشاء حساب" : "الدخول بكلمة المرور"}</h3>
        {!configured ? (
          <p style={{ lineHeight: 1.9, fontSize: 14 }}>تسجيل الدخول غير مفعّل في هذه النسخة بعد. أضف مفاتيح Supabase في إعدادات النشر أولًا.</p>
        ) : sent ? (
          <form onSubmit={verifyCode}>
            <p style={{ lineHeight: 1.9, fontSize: 14 }}>أرسلنا رمز دخول إلى <b dir="ltr">{email}</b>. اكتبه هنا لإكمال الدخول داخل فوس.</p>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 7 }}>رمز الدخول</label>
            <input
              type="text"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(event) => setCode(normalizeOtp(event.target.value))}
              placeholder="000000"
              autoFocus
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid rgba(36,27,77,0.2)", borderRadius: 14, padding: "13px 14px", fontSize: 22, fontWeight: 700, letterSpacing: 6, textAlign: "center", outlineColor: color }}
            />
            {notice && <div role="status" style={{ color: "#147A5B", background: "#E8FAF3", borderRadius: 11, padding: "8px 10px", fontSize: 12.5, fontWeight: 700, marginTop: 9 }}>{notice}</div>}
            {error && <div role="alert" style={{ color: "#C83C55", fontSize: 12.5, marginTop: 8 }}>{error}</div>}
            <button type="submit" disabled={loading || resending || code.length < 6} style={{ width: "100%", border: "none", background: color, color: "#fff", borderRadius: 14, padding: 14, marginTop: 12, fontFamily: "inherit", fontWeight: 700, fontSize: 15, cursor: loading ? "wait" : "pointer", opacity: loading || resending || code.length < 6 ? 0.55 : 1 }}>{loading ? "جارٍ التحقق…" : "تأكيد الرمز"}</button>
            <button type="button" onClick={resendCode} disabled={resending || cooldown > 0} style={{ width: "100%", border: `2px solid ${color}`, color, background: "transparent", borderRadius: 14, padding: 11, marginTop: 8, fontFamily: "inherit", fontWeight: 700, cursor: resending ? "wait" : cooldown > 0 ? "default" : "pointer", opacity: resending || cooldown > 0 ? 0.55 : 1 }}>
              {resending ? "جارٍ إرسال رمز جديد…" : cooldown > 0 ? `إعادة الإرسال بعد ${cooldown.toLocaleString("ar-SA")} ث` : "إعادة إرسال الرمز"}
            </button>
            <button type="button" onClick={() => { setSent(false); setCode(""); setError(""); setNotice(""); }} style={{ width: "100%", border: "none", color, background: "transparent", borderRadius: 14, padding: 10, marginTop: 4, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>تغيير البريد</button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <p style={{ lineHeight: 1.9, fontSize: 14, opacity: 0.78 }}>{mode === "password" ? "ادخل ببريدك وكلمة المرور مباشرة؛ هذا الخيار للحسابات الموجودة ولا يرسل بريدًا." : "اكتب بريدك وسنرسل رمز دخول، وإذا لم يكن لديك حساب سننشئه تلقائيًا."}</p>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 7 }}>البريد الإلكتروني</label>
            <input type="email" dir="ltr" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" style={{ width: "100%", boxSizing: "border-box", border: "1px solid rgba(36,27,77,0.2)", borderRadius: 14, padding: "13px 14px", fontSize: 16, outlineColor: color }} />
            {mode === "password" && (
              <>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, margin: "11px 0 7px" }}>كلمة المرور</label>
                <input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" style={{ width: "100%", boxSizing: "border-box", border: "1px solid rgba(36,27,77,0.2)", borderRadius: 14, padding: "13px 14px", fontSize: 16, outlineColor: color }} />
              </>
            )}
            {error && <div role="alert" style={{ color: "#C83C55", fontSize: 12.5, marginTop: 8 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ width: "100%", border: "none", background: color, color: "#fff", borderRadius: 14, padding: 14, marginTop: 12, fontFamily: "inherit", fontWeight: 700, fontSize: 15, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.65 : 1 }}>{loading ? "جارٍ التنفيذ…" : mode === "password" ? "دخول" : "أرسل رمز الدخول"}</button>
            <button type="button" onClick={() => { setMode(mode === "password" ? "magic" : "password"); setError(""); }} style={{ width: "100%", border: "none", background: "none", color, padding: 11, marginTop: 3, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>{mode === "password" ? "الدخول أو إنشاء حساب برمز البريد" : "الدخول بكلمة المرور"}</button>
          </form>
        )}
        <button type="button" onClick={onClose} style={{ width: "100%", border: "none", background: "none", color: "rgba(36,27,77,0.58)", padding: 11, marginTop: 5, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>إغلاق</button>
      </div>
    </div>
  );
}
