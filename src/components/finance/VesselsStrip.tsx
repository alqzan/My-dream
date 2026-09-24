"use client";
import { useAppStore } from "@/lib/store";
import { computeDailyBudgetStatus, formatAmount, reserveBalance, cashOut, today } from "@/lib/utils";
import { groupReserves } from "@/lib/reserveView";

// ===================== الأوعية الثلاثة — سطرُ الفهم =====================
// الحوسةُ التي اشتكى منها المالك لم تكن في الأرقام؛ كانت في أنّ ثلاثة أرقامٍ
// صحيحة تبدو متناقضةً لأنّ أحداً لم يقل **أيُّها يقرّر وأيُّها يخبر**. فهذه
// الشريحة تسمّي الأدوار قبل أن تعرض الأرقام:
//
//   • **المصروف اليومي — يقرّر**: الرقم الوحيد الذي يجيب «أقدر أصرف الآن؟».
//   • **المظاريف — محجوز**: مالٌ موجودٌ مخصَّص (إيجار، سفر). ليس صرفاً.
//   • **صرف الشهر — مرآة**: ما خرج فعلاً، شاملاً ما صُرف من المظاريف. لا يقرّر.
//
// ولكلّ وعاءٍ رسمُه الخطّيّ الذهبيّ (إناء · مظروف · مرآة) على هيئة أدوات «مدار»
// الأخرى — إناءِ الميزانية وقافلةِ المظاريف — فتُقرأ الصفحة أسرةً واحدة.
// لا حساب جديد هنا: كلُّ رقمٍ من مصدره الواحد في التطبيق.

const GLYPH = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

// إناءٌ يُصبّ منه اليوم — أخو «إناء الميزانية» في بطاقة المصروف اليومي.
function GlyphVessel() {
  return (
    <svg {...GLYPH} aria-hidden="true">
      <path d="M7 5h10l-.8 10.2A4 4 0 0 1 12.2 19h-.4a4 4 0 0 1-4-3.8L7 5Z" />
      <path d="M6 5h12" />
      <path d="M8.4 12.2c1.4-.8 2.6.8 4 0s2.2.4 3.3-.2" opacity=".7" />
    </svg>
  );
}

// مظروفٌ مختوم — المال المخصَّص، موجودٌ لكنّه ليس لك اليوم.
function GlyphEnvelope() {
  return (
    <svg {...GLYPH} aria-hidden="true">
      <rect x="3.2" y="6" width="17.6" height="12" rx="2.2" />
      <path d="M3.8 7.2 12 13l8.2-5.8" />
      <path d="M12 13v5" opacity=".55" />
    </svg>
  );
}

// مرآةٌ تُري ما مضى ولا تقرّر شيئاً.
function GlyphMirror() {
  return (
    <svg {...GLYPH} aria-hidden="true">
      <ellipse cx="12" cy="9.5" rx="6" ry="7" />
      <path d="M12 16.5V21" />
      <path d="M9 21h6" />
      <path d="M9.6 7.2c.9-1 2-1.5 3.2-1.5" opacity=".6" />
    </svg>
  );
}

// `onGo` يفتح القسم المطويّ ويمرّر إليه (نفس ما تفعله لوحة الدورة) — رابطُ
// تجزئةٍ وحده لا يفتح قسماً مطويّاً فيبدو الضغط بلا أثر.
export function VesselsStrip({ onGo }: { onGo: (id: "daily" | "reserves" | "history") => void }) {
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const transactions = useAppStore((s) => s.transactions);
  const reserves = useAppStore((s) => s.reserves);

  const status = dailyBudget ? computeDailyBudgetStatus(dailyBudget, transactions) : null;
  const envelopes = reserves.reduce((sum, f) => sum + reserveBalance(f, transactions), 0);
  // المجموعُ يخلط مدّخراً طويل الأمد بمظاريف أهدافٍ قريبة — فيُقال تقسيمُه تحته
  // (٠٫١٫٤٦٣) بدل «٢ مظروف». ما لا وجودَ له لا يُذكر.
  const groups = groupReserves(reserves);
  const split = [
    groups.general && `مدّخر ${formatAmount(Math.round(reserveBalance(groups.general, transactions)))}`,
    groups.surplus && `فوائض ${formatAmount(Math.round(reserveBalance(groups.surplus, transactions)))}`,
    groups.goals.length > 0 &&
      `أهداف ${formatAmount(Math.round(groups.goals.reduce((sum, f) => sum + reserveBalance(f, transactions), 0)))}`,
  ].filter(Boolean).join(" · ");
  const month = today().slice(0, 7);
  const monthSpend = transactions.filter((t) => t.date.startsWith(month)).reduce((sum, t) => sum + cashOut(t), 0);

  const cells = [
    {
      go: "daily" as const,
      glyph: <GlyphVessel />,
      role: "يقرّر",
      label: "متاح لك الآن",
      value: status ? formatAmount(Math.round(status.balance)) : "—",
      low: !!status && status.balance < 0,
      sub: status
        ? `مصروفك اليومي ${formatAmount(Math.round(status.rate))} ر.س`
        : "لم تُضبط ميزانيةٌ يومية بعد",
    },
    {
      go: "reserves" as const,
      glyph: <GlyphEnvelope />,
      role: "محجوز",
      label: "في مظاريفك",
      value: formatAmount(Math.round(envelopes)),
      low: envelopes < 0,
      sub: reserves.length ? split : "لا مظاريف بعد",
    },
    {
      go: "history" as const,
      glyph: <GlyphMirror />,
      role: "مرآة",
      label: "صرفت هذا الشهر",
      value: formatAmount(Math.round(monthSpend)),
      low: false,
      sub: "كلّ ما خرج فعلاً — من جيبك ومن مظاريفك",
    },
  ];

  return (
    <div className="mdr-vessels">
      {cells.map((c) => (
        <button key={c.label} type="button" onClick={() => onGo(c.go)} className="mdr-vessel press">
          <span className="mdr-vessel-head">
            <span className="mdr-vessel-glyph">{c.glyph}</span>
            <span className="mdr-vessel-label">{c.label}</span>
            <span className="mdr-vessel-role">{c.role}</span>
          </span>
          <span className={`mdr-vessel-value block ${c.low ? "is-low" : ""}`}>
            {c.value}
            <span className="text-[0.62rem] font-normal opacity-60"> ر.س</span>
          </span>
          <span className="mdr-vessel-sub block">{c.sub}</span>
        </button>
      ))}
    </div>
  );
}
