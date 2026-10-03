import React, { useEffect, useState } from "react";

function normalizeOtp(value) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  return String(value || "")
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/\D/g, "")
    .slice(0, 6);
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

  useEffect(() => {
    if (open) { setError(""); setSent(false); setCode(""); setMode("magic"); }
  }, [open]);

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
        await onSend(clean);
        setSent(true);
      }
    } catch (sendError) {
      setError(friendlyAuthError(sendError));
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    const cleanCode = normalizeOtp(code);
    if (cleanCode.length !== 6) {
      setError("اكتب رمز الدخول المكوّن من 6 أرقام.");
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
            <p style={{ lineHeight: 1.9, fontSize: 14 }}>أرسلنا رمز دخول من 6 أرقام إلى <b dir="ltr">{email}</b>. اكتبه هنا لإكمال الدخول داخل فوس.</p>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 7 }}>رمز الدخول</label>
            <input
              type="text"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(normalizeOtp(event.target.value))}
              placeholder="000000"
              autoFocus
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid rgba(36,27,77,0.2)", borderRadius: 14, padding: "13px 14px", fontSize: 22, fontWeight: 700, letterSpacing: 6, textAlign: "center", outlineColor: color }}
            />
            {error && <div role="alert" style={{ color: "#C83C55", fontSize: 12.5, marginTop: 8 }}>{error}</div>}
            <button type="submit" disabled={loading || code.length !== 6} style={{ width: "100%", border: "none", background: color, color: "#fff", borderRadius: 14, padding: 14, marginTop: 12, fontFamily: "inherit", fontWeight: 700, fontSize: 15, cursor: loading ? "wait" : "pointer", opacity: loading || code.length !== 6 ? 0.55 : 1 }}>{loading ? "جارٍ التحقق…" : "تأكيد الرمز"}</button>
            <button type="button" onClick={() => { setSent(false); setCode(""); setError(""); }} style={{ width: "100%", border: `2px solid ${color}`, color, background: "transparent", borderRadius: 14, padding: 11, marginTop: 8, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>تغيير البريد</button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <p style={{ lineHeight: 1.9, fontSize: 14, opacity: 0.78 }}>{mode === "password" ? "ادخل ببريدك وكلمة المرور مباشرة؛ هذا الخيار للحسابات الموجودة ولا يرسل بريدًا." : "اكتب بريدك وسنرسل رمزًا من 6 أرقام، وإذا لم يكن لديك حساب سننشئه تلقائيًا."}</p>
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
