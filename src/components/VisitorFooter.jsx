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

export default function VisitorFooter() {
  return (
    <footer aria-label="روابط فوس المهمة" style={{
      padding: "18px 20px 28px",
      background: "rgba(255,255,255,.72)",
      borderTop: "1px solid #EDE5FC",
      textAlign: "center",
    }}>
      <div style={{ maxWidth: 430, margin: "0 auto" }}>
        <div style={{ color: "#241B4D", fontSize: 13, fontWeight: 700 }}>روابط ومعلومات مهمة</div>
        <nav aria-label="السياسات والشروط" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 7, marginTop: 10 }}>
          <a href="/privacy" style={linkStyle}>سياسة الخصوصية</a>
          <a href="/terms" style={linkStyle}>الشروط والأحكام</a>
          <a href="/refund-policy" style={linkStyle}>المدفوعات والاسترداد</a>
        </nav>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "6px 12px", marginTop: 14, fontSize: 11.5, fontWeight: 700 }}>
          <a href="mailto:phoslearn@gmail.com" style={{ color: "#241B4D" }}>phoslearn@gmail.com</a>
          <a href="https://t.me/WJbU6YeRPg9jNTA0" target="_blank" rel="noreferrer" style={{ color: "#1B3AC8", textDecoration: "none" }}>تيليجرام</a>
          <a href="https://www.tiktok.com/@phoslearn" target="_blank" rel="noreferrer" style={{ color: "#1B3AC8", textDecoration: "none" }}>تيك توك</a>
          <a href="https://youtube.com/@phoslearn?si=b2FGgvH4ieQIgWI_" target="_blank" rel="noreferrer" style={{ color: "#1B3AC8", textDecoration: "none" }}>يوتيوب</a>
        </div>
      </div>
    </footer>
  );
}
