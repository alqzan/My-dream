"use client";
import { useAppStore } from "@/lib/store";
import { computeDailyBudgetStatus, formatAmount, reserveBalance, cashOut, today } from "@/lib/utils";
import { Wallet, Package, Receipt } from "lucide-react";

// ===================== الأوعية الثلاثة — سطرُ الفهم =====================
// الحوسةُ التي اشتكى منها المالك لم تكن في الأرقام؛ كانت في أنّ ثلاثة أرقامٍ
// صحيحة تبدو متناقضةً لأنّ أحداً لم يقل **أيّها يقرّر وأيّها يخبر**. فهذه
// الشريحة تسمّي الأدوار قبل أن تعرض الأرقام:
//
//   • **البدل اليومي — يقرّر**: الرقم الوحيد الذي يجيب «أقدر أصرف الآن؟».
//   • **المظاريف — محجوز**: مالٌ موجودٌ مخصَّص (إيجار، سفر). ليس صرفاً.
//   • **صرف الشهر — مرآة**: ما خرج فعلاً، شاملاً ما صُرف من المظاريف. لا يقرّر شيئاً.
//
// لا حساب جديد هنا: كلُّ رقمٍ من مصدره الواحد في التطبيق.
// `onGo` يفتح القسم المطويّ ويمرّر إليه (نفس ما تفعله لوحة الدورة) — رابطُ
// تجزئةٍ وحده لا يفتح قسماً مطويّاً فيبدو الضغط بلا أثر.
export function VesselsStrip({ onGo }: { onGo: (id: "daily" | "reserves" | "history") => void }) {
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const transactions = useAppStore((s) => s.transactions);
  const reserves = useAppStore((s) => s.reserves);

  const status = dailyBudget ? computeDailyBudgetStatus(dailyBudget, transactions) : null;
  const envelopes = reserves.reduce((sum, f) => sum + reserveBalance(f, transactions), 0);
  const month = today().slice(0, 7);
  const monthSpend = transactions.filter((t) => t.date.startsWith(month)).reduce((sum, t) => sum + cashOut(t), 0);

  const cells = [
    {
      go: "daily" as const,
      icon: <Wallet size={14} />,
      role: "يقرّر",
      label: "متاح لك الآن",
      value: status ? `${formatAmount(Math.round(status.balance))} ر.س` : "—",
      sub: status ? `بدلك ${formatAmount(Math.round(status.rate))} ر.س/يوم` : "اضبط ميزانيتك اليومية",
      tone: status && status.balance < 0 ? "text-red-500" : "text-finance",
    },
    {
      go: "reserves" as const,
      icon: <Package size={14} />,
      role: "محجوز",
      label: "في مظاريفك",
      value: `${formatAmount(Math.round(envelopes))} ر.س`,
      sub: reserves.length ? `${formatAmount(reserves.length)} مظروف — مالٌ مخصَّص لا مصروف` : "لا مظاريف بعد",
      tone: envelopes < 0 ? "text-red-500" : "text-gray-800 dark:text-gray-100",
    },
    {
      go: "history" as const,
      icon: <Receipt size={14} />,
      role: "مرآة",
      label: "صرفت هذا الشهر",
      value: `${formatAmount(Math.round(monthSpend))} ر.س`,
      sub: "كلّ ما خرج فعلاً — من جيبك ومن مظاريفك",
      tone: "text-gray-800 dark:text-gray-100",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {cells.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => onGo(c.go)}
          className="text-right rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2.5 press hover:border-finance/30 transition-colors"
        >
          <div className="flex items-center gap-1.5 text-gray-400">
            <span className="text-finance">{c.icon}</span>
            <span className="text-[11px] font-semibold">{c.label}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 mr-auto">
              {c.role}
            </span>
          </div>
          <div className={`text-xl font-bold tabular-nums mt-0.5 ${c.tone}`}>{c.value}</div>
          <div className="text-[10px] text-gray-400 leading-relaxed">{c.sub}</div>
        </button>
      ))}
    </div>
  );
}
