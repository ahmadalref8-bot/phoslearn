import React, { useEffect, useState } from "react";

function friendlyAuthError(authError) {
  const raw = String(authError?.code || authError?.message || "").toLowerCase();
  if (raw.includes("rate") || raw.includes("too many") || authError?.status === 429) {
    return "تم طلب روابط كثيرة خلال وقت قصير. انتظر ساعة من آخر محاولة، ثم اطلب رابطًا واحدًا جديدًا.";
  }
  if (raw.includes("invalid login") || raw.includes("invalid credentials") || raw.includes("invalid_credentials")) {
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  }
  if (raw.includes("not authorized") || raw.includes("email address")) {
    return "إرسال البريد التجريبي لا يسمح بهذا العنوان حاليًا. تواصل مع دعم فوس.";
  }
  return "تعذر إرسال رابط الدخول الآن. حاول مرة أخرى بعد قليل.";
}

export default function AuthModal({ open, onClose, onSend, onPasswordSignIn, configured, color = "#1B3AC8", ink = "#241B4D" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("password");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) { setError(""); setSent(false); }
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

  return (
    <div role="dialog" aria-modal="true" aria-label="تسجيل الدخول" style={{ position: "absolute", inset: 0, zIndex: 90, background: "rgba(36,27,77,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} style={{ background: "#fff", color: ink, borderRadius: 24, width: "100%", maxWidth: 380, padding: "26px 22px", boxShadow: "0 22px 70px rgba(36,27,77,0.28)", textAlign: "right" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>ادخل إلى حساب فوس</h3>
        {!configured ? (
          <p style={{ lineHeight: 1.9, fontSize: 14 }}>تسجيل الدخول غير مفعّل في هذه النسخة بعد. أضف مفاتيح Supabase في إعدادات النشر أولًا.</p>
        ) : sent ? (
          <>
            <p style={{ lineHeight: 1.9, fontSize: 14 }}>أرسلنا رابط دخول إلى <b>{email}</b>. افتح أحدث رسالة فقط واضغط الرابط مرة واحدة. إذا اخترت باقة قبل تسجيل الدخول، ستعود إلى خطوة مراجعة الاشتراك قبل الدفع.</p>
            <button type="button" onClick={() => setSent(false)} style={{ width: "100%", border: `2px solid ${color}`, color, background: "transparent", borderRadius: 14, padding: 12, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>استخدم بريدًا آخر</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <p style={{ lineHeight: 1.9, fontSize: 14, opacity: 0.78 }}>{mode === "password" ? "ادخل ببريدك وكلمة المرور." : "سنرسل رابط دخول إلى بريدك."}</p>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 7 }}>البريد الإلكتروني</label>
            <input type="email" dir="ltr" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" style={{ width: "100%", boxSizing: "border-box", border: "1px solid rgba(36,27,77,0.2)", borderRadius: 14, padding: "13px 14px", fontSize: 16, outlineColor: color }} />
            {mode === "password" && (
              <>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, margin: "11px 0 7px" }}>كلمة المرور</label>
                <input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" style={{ width: "100%", boxSizing: "border-box", border: "1px solid rgba(36,27,77,0.2)", borderRadius: 14, padding: "13px 14px", fontSize: 16, outlineColor: color }} />
              </>
            )}
            {error && <div role="alert" style={{ color: "#C83C55", fontSize: 12.5, marginTop: 8 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ width: "100%", border: "none", background: color, color: "#fff", borderRadius: 14, padding: 14, marginTop: 12, fontFamily: "inherit", fontWeight: 700, fontSize: 15, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.65 : 1 }}>{loading ? "جارٍ التنفيذ…" : mode === "password" ? "دخول" : "أرسل رابط الدخول"}</button>
            <button type="button" onClick={() => { setMode(mode === "password" ? "magic" : "password"); setError(""); }} style={{ width: "100%", border: "none", background: "none", color, padding: 11, marginTop: 3, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>{mode === "password" ? "الدخول برابط البريد" : "الدخول بكلمة المرور"}</button>
          </form>
        )}
        <button type="button" onClick={onClose} style={{ width: "100%", border: "none", background: "none", color: "rgba(36,27,77,0.58)", padding: 11, marginTop: 5, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>إغلاق</button>
      </div>
    </div>
  );
}
