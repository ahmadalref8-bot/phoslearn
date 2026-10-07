import React from "react";

const linkStyle = {
  color: "#1B3AC8",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 700,
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(237,229,252,.72)",
};

function SocialIcon({ href, label, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      style={{ width: 36, height: 36, borderRadius: 12, display: "grid", placeItems: "center", background: "#fff", boxShadow: "0 4px 12px rgba(27,58,200,.10)" }}
    >
      {children}
    </a>
  );
}

export default function VisitorFooter({ legal = true }) {
  return (
    <footer aria-label="روابط فوس المهمة" style={{
      padding: "18px 20px 28px",
      background: "rgba(255,255,255,.72)",
      borderTop: "1px solid #EDE5FC",
      textAlign: "center",
    }}>
      <div style={{ maxWidth: 430, margin: "0 auto" }}>
        <div style={{ color: "#241B4D", fontSize: 13, fontWeight: 700 }}>{legal ? "روابط ومعلومات مهمة" : "تابع فوس"}</div>
        {legal && (
          <nav aria-label="السياسات والشروط" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 7, marginTop: 10 }}>
            <a href="/privacy" style={linkStyle}>سياسة الخصوصية</a>
            <a href="/terms" style={linkStyle}>الشروط والأحكام</a>
            <a href="/refund-policy" style={linkStyle}>المدفوعات والاسترداد</a>
          </nav>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 9, marginTop: legal ? 14 : 10 }}>
          <a href="mailto:phoslearn@gmail.com" style={{ color: "#241B4D", fontSize: 11.5, fontWeight: 700 }}>phoslearn@gmail.com</a>
          <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(36,27,77,.35)" }} />
          <SocialIcon href="https://t.me/WJbU6YeRPg9jNTA0" label="تيليجرام">
            <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true"><path fill="#229ED9" d="M21.6 3.3 18.3 20c-.25 1.18-.91 1.47-1.84.91l-5.08-3.74-2.45 2.36c-.27.27-.5.5-1.02.5l.36-5.17 9.41-8.5c.41-.36-.09-.56-.63-.2L5.42 13.5.42 11.94c-1.09-.34-1.11-1.09.23-1.62L20.2 2.8c.91-.34 1.7.21 1.4.5Z"/></svg>
          </SocialIcon>
          <SocialIcon href="https://www.tiktok.com/@phoslearn" label="تيك توك">
            <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#25F4EE" d="M14.2 3v11.3a3.4 3.4 0 1 1-2.45-3.27v-3.2a6.55 6.55 0 1 0 5.65 6.5V9.27A6.7 6.7 0 0 0 21 10.34V7.2A3.57 3.57 0 0 1 17.4 3h-3.2Z"/>
              <path fill="#FE2C55" d="M12.3 5.1v11.3a3.4 3.4 0 1 1-2.45-3.27v-3.2a6.55 6.55 0 1 0 5.65 6.5V11.37A6.7 6.7 0 0 0 19.1 12.44V9.3A3.57 3.57 0 0 1 15.5 5.1h-3.2Z"/>
              <path fill="#161823" d="M13.25 4.05v11.3a3.4 3.4 0 1 1-2.45-3.27v-3.2a6.55 6.55 0 1 0 5.65 6.5V10.32a6.7 6.7 0 0 0 3.6 1.07V8.25a3.57 3.57 0 0 1-3.6-4.2h-3.2Z"/>
            </svg>
          </SocialIcon>
          <SocialIcon href="https://youtube.com/@phoslearn?si=b2FGgvH4ieQIgWI_" label="يوتيوب">
            <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FF0033" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.55 3.6 12 3.6 12 3.6s-7.55 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.85.5 9.4.5 9.4.5s7.55 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8Z"/><path fill="#fff" d="m9.6 15.6 6.25-3.6L9.6 8.4v7.2Z"/></svg>
          </SocialIcon>
        </div>
      </div>
    </footer>
  );
}
