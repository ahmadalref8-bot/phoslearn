import React, { useEffect, useMemo, useRef, useState } from "react";

function initials(name, email) {
  const source = String(name || email?.split("@")[0] || "فوس").trim();
  const words = source.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : source.slice(0, 2)).toUpperCase();
}

function planLabel(plan) {
  if (plan === "season") return "اشتراك ٩٠ يومًا";
  if (plan === "month") return "اشتراك ٣٠ يومًا";
  return "الخطة المجانية";
}

const cardStyle = {
  background: "#fff",
  borderRadius: 22,
  padding: "18px",
  boxShadow: "0 10px 28px rgba(27,58,200,0.09)",
  border: "1px solid #EDE5FC",
};

export default function ProfileSettings({
  user,
  profile,
  loading,
  saving,
  error,
  onSave,
  onSignIn,
  plan,
  accessLoading,
  color = "#1B3AC8",
  ink = "#241B4D",
  soft = "#EDE5FC",
}) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [preview, setPreview] = useState("");
  const [formError, setFormError] = useState("");
  const inputRef = useRef(null);
  const objectUrlRef = useRef("");

  const shownName = profile?.displayName || user?.email?.split("@")[0] || "مستخدم فوس";
  const avatarUrl = profile?.avatarUrl || "";
  const letters = useMemo(() => initials(shownName, user?.email), [shownName, user?.email]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const openEditor = () => {
    setDisplayName(shownName);
    setAvatarFile(null);
    setRemoveAvatar(false);
    setPreview(avatarUrl);
    setFormError("");
    setEditing(true);
  };

  const chooseImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setAvatarFile(file);
    setRemoveAvatar(false);
    setPreview(objectUrlRef.current);
    setFormError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      await onSave({ displayName, avatarFile, removeAvatar });
      setEditing(false);
    } catch (saveError) {
      setFormError(saveError?.message || "تعذر الحفظ.");
    }
  };

  if (!user) {
    return (
      <section style={{ ...cardStyle, textAlign: "center" }}>
        <div style={{ width: 66, height: 66, borderRadius: "50%", margin: "0 auto", background: soft, color, display: "grid", placeItems: "center", fontSize: 20, fontWeight: 800 }}>فوس</div>
        <div style={{ fontWeight: 800, fontSize: 18, marginTop: 12, color: ink }}>ملفك الشخصي</div>
        <div style={{ fontSize: 13, opacity: 0.62, marginTop: 5, lineHeight: 1.7 }}>سجّل الدخول لحفظ اسمك وصورتك وتقدمك.</div>
        <button onClick={onSignIn} style={{ width: "100%", border: "none", borderRadius: 14, background: color, color: "#fff", padding: 13, marginTop: 14, fontFamily: "inherit", fontWeight: 800, fontSize: 14.5, cursor: "pointer" }}>تسجيل الدخول</button>
      </section>
    );
  }

  return (
    <>
      <section style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 68, height: 68, flex: "0 0 auto", borderRadius: "50%", overflow: "hidden", background: soft, color, display: "grid", placeItems: "center", fontSize: 19, fontWeight: 800, border: "3px solid #fff", boxShadow: "0 0 0 2px #EDE5FC" }}>
            {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : letters}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loading ? "جارٍ التحميل…" : shownName}</div>
            <div dir="ltr" style={{ fontSize: 12.5, opacity: 0.56, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{user.email}</div>
            <div style={{ display: "inline-block", background: soft, color, borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 800, marginTop: 8 }}>{accessLoading ? "جارٍ التحقق…" : planLabel(plan)}</div>
          </div>
        </div>
        <button onClick={openEditor} disabled={loading} style={{ width: "100%", border: `2px solid ${color}`, borderRadius: 14, background: "transparent", color, padding: 11, marginTop: 15, fontFamily: "inherit", fontWeight: 800, fontSize: 13.5, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.55 : 1 }}>تعديل الملف الشخصي</button>
        {error && <div role="alert" style={{ color: "#C83C55", background: "#FFF1F2", borderRadius: 12, padding: "9px 11px", fontSize: 12, fontWeight: 700, marginTop: 9 }}>{error}</div>}
      </section>

      {editing && (
        <div role="dialog" aria-modal="true" aria-label="تعديل الملف الشخصي" onClick={() => !saving && setEditing(false)} style={{ position: "absolute", inset: 0, zIndex: 95, background: "rgba(36,27,77,0.58)", display: "flex", alignItems: "center", justifyContent: "center", padding: 22 }}>
          <form onSubmit={submit} onClick={(event) => event.stopPropagation()} style={{ width: "100%", maxWidth: 390, background: "#fff", color: ink, borderRadius: 24, padding: "24px 20px", boxShadow: "0 24px 80px rgba(36,27,77,0.3)", textAlign: "right" }}>
            <div style={{ fontWeight: 800, fontSize: 20 }}>تعديل الملف الشخصي</div>
            <div style={{ display: "grid", placeItems: "center", margin: "20px 0 17px" }}>
              <button type="button" onClick={() => inputRef.current?.click()} style={{ width: 92, height: 92, borderRadius: "50%", overflow: "hidden", border: `3px solid ${soft}`, background: soft, color, display: "grid", placeItems: "center", fontFamily: "inherit", fontSize: 22, fontWeight: 800, cursor: "pointer", padding: 0 }}>
                {preview ? <img src={preview} alt="معاينة الصورة" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(displayName, user.email)}
              </button>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseImage} hidden />
              <button type="button" onClick={() => inputRef.current?.click()} style={{ border: "none", background: "none", color, fontFamily: "inherit", fontWeight: 800, fontSize: 12.5, marginTop: 8, cursor: "pointer" }}>اختيار صورة</button>
              {(preview || avatarUrl) && (
                <button type="button" onClick={() => { setAvatarFile(null); setRemoveAvatar(true); setPreview(""); if (inputRef.current) inputRef.current.value = ""; }} style={{ border: "none", background: "none", color: "#C83C55", fontFamily: "inherit", fontWeight: 700, fontSize: 11.5, marginTop: 3, cursor: "pointer" }}>حذف الصورة</button>
              )}
            </div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 800, marginBottom: 7 }}>الاسم الظاهر</label>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 40))} maxLength={40} autoFocus style={{ width: "100%", boxSizing: "border-box", border: "1px solid rgba(36,27,77,0.2)", borderRadius: 14, padding: "13px 14px", fontFamily: "inherit", fontSize: 16, outlineColor: color }} />
            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 5 }}>من حرفين إلى ٤٠ حرفًا</div>
            {formError && <div role="alert" style={{ color: "#C83C55", fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>{formError}</div>}
            <button type="submit" disabled={saving} style={{ width: "100%", border: "none", borderRadius: 14, background: color, color: "#fff", padding: 13, marginTop: 14, fontFamily: "inherit", fontWeight: 800, fontSize: 14.5, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "جارٍ الحفظ…" : "حفظ التغييرات"}</button>
            <button type="button" disabled={saving} onClick={() => setEditing(false)} style={{ width: "100%", border: "none", background: "none", color: "rgba(36,27,77,0.6)", padding: 11, marginTop: 4, fontFamily: "inherit", fontWeight: 800, cursor: "pointer" }}>إلغاء</button>
          </form>
        </div>
      )}
    </>
  );
}

export function AppSettings({ user, onSignOut, onReset, color = "#1B3AC8", ink = "#241B4D", soft = "#EDE5FC" }) {
  return (
    <section style={{ ...cardStyle, marginTop: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 17, color: ink }}>إعدادات التطبيق</div>
      <div style={{ fontSize: 12, opacity: 0.58, marginTop: 3 }}>الحساب والبيانات والسياسات</div>

      <a href="/about" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 14, padding: "13px 0", borderTop: `1px solid ${soft}`, textDecoration: "none", color: ink, fontWeight: 700, fontSize: 13.5 }}>
        <span>معلومات فوس والسياسات</span>
        <span style={{ color, fontSize: 18 }}>‹</span>
      </a>

      <button onClick={() => window.confirm("هل تريد إعادة ضبط تقدمك؟ لا يمكن التراجع عن ذلك.") && onReset()} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", border: "none", borderTop: `1px solid ${soft}`, background: "none", color: ink, padding: "13px 0", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, cursor: "pointer", textAlign: "right" }}>
        <span>إعادة ضبط التقدم</span>
        <span style={{ color: "#C83C55", fontSize: 12 }}>مسح</span>
      </button>

      {user && (
        <button onClick={onSignOut} style={{ width: "100%", border: "none", borderRadius: 13, background: "#FFF1F2", color: "#C83C55", padding: 12, marginTop: 8, fontFamily: "inherit", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}>تسجيل الخروج</button>
      )}
    </section>
  );
}
