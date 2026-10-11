import React from "react";

const legalLinks = [
  ["/pricing", "الأسعار والباقات"],
  ["/privacy", "سياسة الخصوصية"],
  ["/terms", "الشروط والأحكام"],
  ["/refund-policy", "المدفوعات والاسترداد"],
  ["/about", "من نحن"],
];

const linkStyle = {
  display: "flex",
  minHeight: 38,
  alignItems: "center",
  justifyContent: "center",
  color: "#1B3AC8",
  textDecoration: "none",
  fontSize: 11.5,
  fontWeight: 700,
  padding: "7px 9px",
  borderRadius: 12,
  border: "1px solid #EDE5FC",
  background: "#FAF8FF",
  boxSizing: "border-box",
  textAlign: "center",
};

function SocialIcon({ href, label, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      style={{ width: 34, height: 34, borderRadius: 11, display: "grid", placeItems: "center", background: "#FAF8FF", border: "1px solid #EDE5FC" }}
    >
      {children}
    </a>
  );
}

export default function VisitorFooter() {
  return (
    <details dir="rtl" style={{ position: "absolute", top: 11, left: 14, zIndex: 90 }}>
      <summary
        aria-label="فتح معلومات وروابط فوس"
        style={{
          listStyle: "none",
          height: 36,
          padding: "0 11px",
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "#241B4D",
          background: "rgba(255,255,255,.88)",
          border: "1px solid rgba(237,229,252,.95)",
          boxShadow: "0 5px 18px rgba(36,27,77,.10)",
          cursor: "pointer",
          fontSize: 11.5,
          fontWeight: 700,
          userSelect: "none",
        }}
      >
        <span aria-hidden="true" style={{ width: 19, height: 19, borderRadius: "50%", display: "grid", placeItems: "center", color: "#fff", background: "#1B3AC8", fontSize: 12, fontFamily: "serif", fontWeight: 700 }}>i</span>
        معلومات
      </summary>

      <div style={{
        position: "absolute",
        top: 44,
        left: 0,
        width: 318,
        maxWidth: "calc(100vw - 28px)",
        padding: 14,
        borderRadius: 20,
        background: "rgba(255,255,255,.97)",
        border: "1px solid #EDE5FC",
        boxShadow: "0 18px 50px rgba(36,27,77,.20)",
        boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
          <span aria-hidden="true" style={{ color: "#1B3AC8", fontSize: 20 }}>✦</span>
          <div>
            <div style={{ color: "#241B4D", fontSize: 14, fontWeight: 800 }}>فوس</div>
            <div style={{ color: "rgba(36,27,77,.58)", fontSize: 10.5, marginTop: 1 }}>روابط الخدمة والتواصل</div>
          </div>
        </div>

        <nav aria-label="السياسات ومعلومات الخدمة" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7 }}>
          {legalLinks.map(([href, label]) => <a key={href} href={href} style={linkStyle}>{label}</a>)}
        </nav>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12, paddingTop: 11, borderTop: "1px solid #EDE5FC" }}>
          <a href="mailto:phoslearn@gmail.com" style={{ color: "#241B4D", fontSize: 10.5, fontWeight: 700, textDecoration: "none" }}>phoslearn@gmail.com</a>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <SocialIcon href="https://t.me/WJbU6YeRPg9jNTA0" label="تيليجرام">
              <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="#229ED9" d="M21.6 3.3 18.3 20c-.25 1.18-.91 1.47-1.84.91l-5.08-3.74-2.45 2.36c-.27.27-.5.5-1.02.5l.36-5.17 9.41-8.5c.41-.36-.09-.56-.63-.2L5.42 13.5.42 11.94c-1.09-.34-1.11-1.09.23-1.62L20.2 2.8c.91-.34 1.7.21 1.4.5Z"/></svg>
            </SocialIcon>
            <SocialIcon href="https://www.tiktok.com/@phoslearn" label="تيك توك">
              <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="#161823" d="M13.25 4.05v11.3a3.4 3.4 0 1 1-2.45-3.27v-3.2a6.55 6.55 0 1 0 5.65 6.5V10.32a6.7 6.7 0 0 0 3.6 1.07V8.25a3.57 3.57 0 0 1-3.6-4.2h-3.2Z"/></svg>
            </SocialIcon>
            <SocialIcon href="https://youtube.com/@phoslearn?si=b2FGgvH4ieQIgWI_" label="يوتيوب">
              <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FF0033" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.55 3.6 12 3.6 12 3.6s-7.55 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.85.5 9.4.5 9.4.5s7.55 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8Z"/><path fill="#fff" d="m9.6 15.6 6.25-3.6L9.6 8.4v7.2Z"/></svg>
            </SocialIcon>
          </div>
        </div>
      </div>
    </details>
  );
}
