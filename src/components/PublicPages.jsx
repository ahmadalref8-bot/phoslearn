import React from "react";

const COLORS = {
  bg: "#D7C7F8",
  bgSoft: "#EDE5FC",
  cobalt: "#1B3AC8",
  ink: "#241B4D",
  card: "#FFFFFF",
  bad: "#B4233B",
  gold: "#D99A2B",
};

export const LEGAL_VERSION = "2026-09-26";

const supportEmailCandidate = String(import.meta.env.VITE_SUPPORT_EMAIL || "phoslearn@gmail.com").trim();
const validSupportEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmailCandidate);
export const SUPPORT_EMAIL = validSupportEmail ? supportEmailCandidate : "";

export const PUBLIC_LINKS = [
  ["/about", "من نحن"],
  ["/pricing", "الأسعار"],
  ["/privacy", "سياسة الخصوصية"],
  ["/terms", "الشروط والأحكام"],
  ["/refund-policy", "سياسة المدفوعات والاسترداد"],
];

const pageByPath = {
  "/about": "about",
  "/pricing": "pricing",
  "/privacy": "privacy",
  "/terms": "terms",
  "/refund-policy": "refund",
};

function SupportContact({ short = false }) {
  if (!SUPPORT_EMAIL) {
    return (
      <span role="alert" style={{ color: COLORS.bad, fontWeight: 700 }}>
        خطأ إعداد: يجب ضبط VITE_SUPPORT_EMAIL قبل النشر.
      </span>
    );
  }
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "inherit", fontWeight: 700 }}>
      {short ? SUPPORT_EMAIL : `البريد الإلكتروني: ${SUPPORT_EMAIL}`}
    </a>
  );
}

export function SiteFooter({ compact = false, style = {} }) {
  return (
    <footer style={{ padding: compact ? "12px 14px" : "24px 20px", textAlign: "center", fontSize: compact ? 10.5 : 12.5, lineHeight: 1.9, color: COLORS.ink, ...style }}>
      <nav aria-label="روابط الموقع القانونية" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: compact ? "4px 10px" : "7px 16px" }}>
        {PUBLIC_LINKS.map(([href, label]) => (
          <a key={href} href={href} style={{ color: COLORS.cobalt, fontWeight: 700, textDecoration: "none" }}>{label}</a>
        ))}
      </nav>
      {!compact && <div style={{ marginTop: 10 }}><SupportContact short /> · © فوس</div>}
    </footer>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ color: COLORS.cobalt, fontSize: 20, margin: "0 0 8px" }}>{title}</h2>
      <div style={{ fontSize: 15, lineHeight: 2, color: COLORS.ink }}>{children}</div>
    </section>
  );
}

function Bullets({ children }) {
  return <ul style={{ margin: "8px 0", paddingRight: 22 }}>{children}</ul>;
}

function AboutPage() {
  return (
    <>
      <h1>من نحن</h1>
      <p>فوس منصة تعليمية إلكترونية تساعد الطلاب على الاستعداد لاختبار القدرات الكمي عبر التدريب التفاعلي، والبطاقات التعليمية، وتقارير الأداء، والشرح الذكي، ومجتمع خاص للمشتركين.</p>
      <Section title="الخدمة">
        <p>يوفر فوس خطة مجانية محدودة، إلى جانب باقتين مدفوعتين متجددتين تلقائيًا: 19 ريالًا سعوديًا كل 30 يومًا، أو 39 ريالًا سعوديًا كل 90 يومًا.</p>
      </Section>
      <Section title="مالك النشاط والتواصل">
        <p>مالك ومشغّل النشاط: احمد عبدالعزيز احمد الرفاعي (Ahmed abdulaziz alrefaei).</p>
        <p><SupportContact /></p>
      </Section>
    </>
  );
}

function PlanCard({ title, price, period, featured = false }) {
  return (
    <article style={{ background: featured ? COLORS.bgSoft : "#FAF8FF", border: `2px solid ${featured ? COLORS.cobalt : "transparent"}`, borderRadius: 20, padding: 20, position: "relative" }}>
      {featured && <div style={{ position: "absolute", top: -12, right: 16, background: COLORS.gold, color: "#fff", borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>الأفضل قيمة</div>}
      <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
      <div style={{ color: COLORS.cobalt, fontWeight: 700, fontSize: 25, marginTop: 10 }}>{price} ر.س <span style={{ fontSize: 13, color: COLORS.ink }}>/ كل {period}</span></div>
      <p style={{ lineHeight: 1.9, marginBottom: 0 }}>أسئلة تدريب بلا حدود، فيد تكيفي، شرح ذكي ضمن الاستخدام العادل، تقرير أداء كامل، ومجتمع فوس الخاص.</p>
    </article>
  );
}

function PricingPage() {
  return (
    <>
      <h1>باقات فوس وأسعارها</h1>
      <p>الأسعار بالريال السعودي. الباقتان اشتراكان متجددان تلقائيًا حتى الإلغاء، ويُعرض ذلك بوضوح قبل الدفع.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16, marginTop: 24 }}>
        <PlanCard title="اشتراك 30 يومًا" price="19" period="30 يومًا" />
        <PlanCard title="اشتراك 90 يومًا" price="39" period="90 يومًا" featured />
      </div>
      <Section title="التجديد والإلغاء">
        <p>يتجدد الاشتراك تلقائيًا بالقيمة والدورة المختارتين ما لم يلغِ العميل التجديد قبل موعد الخصم التالي. إذا تم الإلغاء قبل ذلك الموعد فلا تحدث دفعة جديدة، ويستمر الوصول إلى المزايا حتى نهاية المدة المدفوعة الحالية.</p>
      </Section>
      <p style={{ background: "#FFF8E8", borderRadius: 14, padding: 14, fontSize: 13.5, lineHeight: 1.9 }}>إلغاء التجديد لا يعني استرداد قيمة المدة الحالية. راجع <a href="/refund-policy">سياسة المدفوعات والاسترداد</a> و<a href="/terms">الشروط والأحكام</a>.</p>
      <a href="/?plans=1" style={{ display: "block", maxWidth: 360, margin: "22px auto 0", background: COLORS.cobalt, color: "#fff", textDecoration: "none", textAlign: "center", borderRadius: 16, padding: 15, fontWeight: 700 }}>ابدأ الاشتراك</a>
    </>
  );
}

function PrivacyPage() {
  return (
    <>
      <h1>سياسة الخصوصية</h1>
      <p>آخر تحديث: 26 سبتمبر 2026. توضح هذه السياسة كيف يتعامل فوس مع بياناتك عند استخدام الموقع والخدمة.</p>
      <Section title="المتحكم في البيانات">
        <p>المتحكم في البيانات ومالك النشاط هو احمد عبدالعزيز احمد الرفاعي (Ahmed abdulaziz alrefaei)، وتشغَّل الخدمة باسم «فوس». للتواصل بشأن الخصوصية: <SupportContact />.</p>
      </Section>
      <Section title="البيانات التي نعالجها">
        <Bullets>
          <li>بيانات الحساب والاشتراك، مثل البريد الإلكتروني والاسم الأول واسم العائلة ورقم الجوال ومعرّف المستخدم.</li>
          <li>بيانات التعلّم، مثل الإجابات والتقدم والدقة والمحتوى المحفوظ.</li>
          <li>بيانات العملية المالية اللازمة للتحقق من حالة الاشتراك، مثل رقم العملية والمبلغ والحالة. لا يستقبل فوس أرقام بطاقتك الكاملة؛ تُدخل بيانات الدفع لدى بوابة الدفع.</li>
          <li>الأسئلة والسياق الذي ترسله إلى ميزة الشرح الذكي لتوليد الإجابة.</li>
          <li>بيانات تقنية وأمنية محدودة، مثل نوع الجهاز والمتصفح وعنوان الشبكة والسجلات الفنية، لازمة لتشغيل الخدمة ومنع إساءة الاستخدام.</li>
          <li>بيانات تُخزَّن محليًا في متصفحك، مثل تقدمك وتفضيلاتك وحالة إتمام الدفع، حتى تعمل التجربة وتستعيد حالتك.</li>
        </Bullets>
      </Section>
      <Section title="الأغراض والأساس النظامي">
        <p>نعالج البيانات لتنفيذ عقد الخدمة معك، بما يشمل إنشاء الحساب وحفظ التقدم وتقديم المحتوى والتحقق من الدفع والتجديد والإلغاء. ونعالج ما يلزم لحماية الخدمة ومكافحة الاحتيال والوفاء بالالتزامات النظامية. عندما يتطلب نوع من المعالجة موافقتك، مثل التفويض الصريح بالدفع المتكرر أو أي استخدام اختياري، نعتمد على موافقتك ويمكنك سحبها للمستقبل دون أن يؤثر ذلك في مشروعية المعالجة السابقة.</p>
      </Section>
      <Section title="الجهات المستلمة والنقل خارج المملكة">
        <p>قد نشارك القدر اللازم مع Supabase لقاعدة البيانات وتسجيل الدخول، وTap Payments لمعالجة الدفع وحفظ وسيلة الدفع المتكرر، وVercel للاستضافة، ومزوّد الذكاء الاصطناعي لتوليد الشرح. قد تكون بعض هذه الجهات أو أنظمتها خارج المملكة العربية السعودية؛ وعند حدوث نقل دولي نتعامل معه وفق المتطلبات النظامية والضمانات المتاحة. لا نبيع بياناتك الشخصية.</p>
      </Section>
      <Section title="مدة الاحتفاظ والحذف">
        <p>نحتفظ بكل فئة من البيانات قدر الحاجة إلى الغرض الذي جُمعت من أجله، وطوال العلاقة التعاقدية عند اللزوم، وللمدد التي تتطلبها الالتزامات النظامية أو المحاسبية أو تسوية النزاعات. بعد انتهاء الحاجة نحذف البيانات أو نجعلها غير مرتبطة بك بطريقة مناسبة. يمكنك حذف البيانات المحلية من إعدادات المتصفح أو إعادة ضبط تقدمك داخل التطبيق.</p>
      </Section>
      <Section title="الأمان">
        <p>نطبق إجراءات تقنية وتنظيمية مناسبة، تشمل تقييد الوصول والتحقق من الجلسات وعدم تمرير بيانات البطاقة الكاملة إلى خوادم فوس، مع الإقرار بأن أي نقل أو تخزين إلكتروني لا يخلو من المخاطر تمامًا.</p>
      </Section>
      <Section title="حقوقك والشكوى">
        <p>بحسب الأنظمة السارية، يمكنك طلب العلم ببياناتك والوصول إليها والحصول عليها بصيغة واضحة، أو تصحيحها وإكمالها وتحديثها، أو طلب إتلافها عندما ينطبق ذلك، أو سحب الموافقة للمعالجات القائمة عليها. يمكنك تقديم طلب أو شكوى أولًا عبر <SupportContact />، وإذا لم تُحل يمكنك اللجوء إلى الجهة المختصة بحماية البيانات الشخصية في المملكة العربية السعودية.</p>
      </Section>
    </>
  );
}

function TermsPage() {
  return (
    <>
      <h1>الشروط والأحكام</h1>
      <p>آخر تحديث: 26 سبتمبر 2026. باستخدام فوس أو شراء إحدى باقاته، فإنك توافق على هذه الشروط.</p>
      <Section title="طبيعة الخدمة">
        <p>فوس خدمة تعليمية رقمية مساندة للاستعداد لاختبار القدرات الكمي، ولا يضمن درجة أو نتيجة بعينها. قد تتغير طريقة عرض المحتوى أو تتطور بعض المزايا مع الحفاظ على جوهر الخدمة المدفوعة.</p>
      </Section>
      <Section title="الاشتراكات المتجددة">
        <Bullets>
          <li>باقة 30 يومًا: 19 ريالًا سعوديًا، وتتجدد تلقائيًا كل 30 يومًا.</li>
          <li>باقة 90 يومًا: 39 ريالًا سعوديًا، وتتجدد تلقائيًا كل 90 يومًا.</li>
          <li>يعرض فوس السعر ودورة التجديد ويطلب موافقة صريحة قبل الانتقال إلى الدفع.</li>
          <li>يستمر التجديد حتى يلغيه العميل. قد يتطلب نجاح التجديد بقاء وسيلة الدفع صالحة.</li>
        </Bullets>
      </Section>
      <Section title="إلغاء التجديد">
        <p>يمكن للمشترك إلغاء التجديد من صفحة حسابه. يمنع الإلغاء الخصم التالي ولا يوقف المزايا فورًا؛ يبقى الوصول متاحًا حتى نهاية المدة المدفوعة الحالية. يمكن أن يتوقف الوصول عند نهاية المدة إذا لم ينجح التجديد.</p>
      </Section>
      <Section title="موعد التجديد ومهلة المعالجة">
        <p>لا يبدأ فوس طلب خصم التجديد قبل تاريخ التجديد. إذا تعذر الخصم في موعده أو تأخرت نتيجة المعالجة، فقد تُعاد المحاولة خلال مهلة قصيرة لا تتجاوز 48 ساعة، وقد يستمر الوصول مؤقتًا خلالها. لا يبدأ النظام محاولة خصم جديدة بعد هذه المهلة، مع احتمال وصول نتيجة نهائية متأخرة لمحاولة بدأت خلالها. إلغاء التجديد قبل تاريخه يمنع الخصم المستقبلي؛ أما إذا وصل الإلغاء بعد حلول الموعد وكانت محاولة الدورة المستحقة قد بدأت، فقد تكتمل تلك المحاولة ويمنع الإلغاء ما بعدها.</p>
      </Section>
      <Section title="الحساب والاستخدام المقبول">
        <p>أنت مسؤول عن حماية الوصول إلى بريدك وحسابك. لا يجوز مشاركة الحساب على نحو تجاري، أو نسخ المحتوى وإعادة نشره، أو التحايل على حدود الاستخدام، أو محاولة الوصول غير المصرح به إلى الخدمة. يجوز تقييد الحساب عند إساءة الاستخدام بما يتناسب مع المخالفة والأنظمة السارية.</p>
      </Section>
      <Section title="الشرح الذكي">
        <p>الشرح الذكي أداة تعليمية قد تخطئ، ويجب التحقق من الإجابات المهمة. تخضع الميزة لحدود استخدام عادلة لحماية الخدمة لجميع المشتركين.</p>
      </Section>
      <Section title="الدفع والاسترداد">
        <p>تتم معالجة الدفع عبر Tap Payments. تخضع حالات الاسترداد والتصحيح إلى <a href="/refund-policy">سياسة المدفوعات والاسترداد</a>، ولا تؤثر هذه الشروط في أي حقوق إلزامية يقررها النظام.</p>
      </Section>
      <Section title="الملكية والتواصل">
        <p>المحتوى والتصميم والعلامات الخاصة بفوس محمية ولا يجوز استغلالها خارج الاستخدام الشخصي المسموح. مالك ومشغّل النشاط: احمد عبدالعزيز احمد الرفاعي (Ahmed abdulaziz alrefaei). للتواصل: <SupportContact />.</p>
      </Section>
    </>
  );
}

function RefundPage() {
  return (
    <>
      <h1>سياسة المدفوعات والاسترداد</h1>
      <p>آخر تحديث: 26 سبتمبر 2026. تشرح هذه الصفحة الفرق بين إلغاء التجديد والاسترداد المالي.</p>
      <Section title="إلغاء التجديد">
        <p>يمكنك إلغاء التجديد من صفحة حسابك في أي وقت قبل الخصم التالي. يوقف الإلغاء الدفعات المستقبلية فقط، وتبقى مزاياك متاحة حتى نهاية المدة المدفوعة الحالية.</p>
        <p>لا يبدأ طلب خصم التجديد قبل تاريخ التجديد. وإذا فشل الخصم في موعده أو تأخرت معالجته، فقد تُعاد المحاولة خلال مهلة معالجة لا تتجاوز 48 ساعة مع استمرار الوصول مؤقتًا. لا يبدأ النظام محاولة خصم جديدة بعد هذه المهلة، مع احتمال وصول نتيجة نهائية متأخرة لمحاولة بدأت خلالها. الإلغاء قبل تاريخ التجديد يمنع هذه المحاولات والدفعات المستقبلية؛ وإذا وصل بعد حلول الموعد وكانت محاولة الدورة المستحقة قد بدأت، فقد تكتمل تلك المحاولة ويمنع الإلغاء ما بعدها.</p>
      </Section>
      <Section title="الخدمة الرقمية بعد التفعيل">
        <p>نظرًا لأن فوس خدمة رقمية يبدأ الانتفاع بها فور تأكيد الدفع وتفعيل المزايا، فلا نقدم استردادًا اختياريًا لمجرد تغيير الرأي بعد بدء الانتفاع بالخدمة.</p>
      </Section>
      <Section title="حالات التصحيح أو الاسترداد">
        <p>نتحقق من الطلب ونعالج التصحيح أو الاسترداد، بحسب الحالة، عند وجود خصم مكرر، أو تحصيل مبلغ غير صحيح، أو عدم تفعيل الخدمة بعد نجاح الدفع وتعذر إصلاح المشكلة خلال مدة معقولة. كما نحترم أي حقوق استرداد إلزامية تقررها الأنظمة السارية.</p>
      </Section>
      <Section title="طريقة تقديم الطلب">
        <p>تواصل عبر <SupportContact /> من البريد المرتبط بالحساب، واذكر رقم العملية وتاريخها ووصف المشكلة. لا ترسل رقم البطاقة الكامل أو رمز التحقق. سنراجع الطلب ونبلغك بالنتيجة، ويعود المبلغ المقبول إلى وسيلة الدفع الأصلية وفق مدة معالجة البنك وبوابة الدفع.</p>
      </Section>
    </>
  );
}

const pageComponents = {
  about: AboutPage,
  pricing: PricingPage,
  privacy: PrivacyPage,
  terms: TermsPage,
  refund: RefundPage,
};

export function isPublicPath(pathname) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return Boolean(pageByPath[normalized]);
}

export default function PublicPage({ pathname = window.location.pathname }) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const key = pageByPath[normalized] || "about";
  const Page = pageComponents[key];
  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.ink, fontFamily: "'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        a:focus-visible { outline: 3px solid ${COLORS.cobalt}; outline-offset: 3px; }
      `}</style>
      <header style={{ background: "rgba(255,255,255,.88)", borderBottom: `1px solid ${COLORS.bgSoft}` }}>
        <div style={{ maxWidth: 920, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <a href="/" style={{ color: COLORS.cobalt, fontSize: 23, fontWeight: 700, textDecoration: "none" }}>فوس ✦</a>
          <nav aria-label="التنقل الرئيسي" style={{ marginRight: "auto", display: "flex", flexWrap: "wrap", gap: "8px 14px" }}>
            <a href="/about" style={{ color: COLORS.ink, textDecoration: "none", fontWeight: 700, fontSize: 13 }}>من نحن</a>
            <a href="/pricing" style={{ color: COLORS.ink, textDecoration: "none", fontWeight: 700, fontSize: 13 }}>الأسعار</a>
            <a href="/" style={{ color: "#fff", background: COLORS.cobalt, textDecoration: "none", fontWeight: 700, fontSize: 13, borderRadius: 10, padding: "6px 11px" }}>افتح التطبيق</a>
          </nav>
        </div>
      </header>
      {!SUPPORT_EMAIL && (
        <div role="alert" style={{ maxWidth: 920, margin: "14px auto 0", padding: "11px 16px", borderRadius: 12, background: "#FFF1F2", color: COLORS.bad, fontWeight: 700, fontSize: 13 }}>
          خطأ إعداد ظاهر للمالك: اضبط VITE_SUPPORT_EMAIL ببريد خدمة العملاء قبل نشر الموقع.
        </div>
      )}
      <main style={{ maxWidth: 920, minHeight: "calc(100vh - 230px)", margin: "18px auto", padding: "clamp(22px, 5vw, 48px)", background: COLORS.card, borderRadius: 26, boxShadow: "0 12px 34px rgba(27,58,200,.10)" }}>
        <style>{`main h1 { color:${COLORS.cobalt}; font-size:clamp(27px,5vw,38px); margin:0 0 14px; } main p { font-size:15px; line-height:2; } main a { color:${COLORS.cobalt}; font-weight:700; } main li { margin:5px 0; }`}</style>
        <Page />
      </main>
      <SiteFooter />
    </div>
  );
}
