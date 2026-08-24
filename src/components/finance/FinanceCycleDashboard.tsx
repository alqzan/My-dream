"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { ChevronLeft, Gauge, TrendingDown, Wallet } from "lucide-react";
import type { FinanceCategoryDef } from "@/lib/types";
import type { BudgetStatus } from "@/lib/budgetStatus";
import type { FinanceOverview } from "@/lib/financeOverview";
import { projectedCycleSurplus } from "@/lib/financeOverview";
import type { CycleCurve } from "@/lib/cycleCurve";
import {
  CURVE_BASE,
  curveGeometry,
  disciplineDays,
  disciplineScore,
} from "@/lib/cycleCurve";
import { arNum, arPct } from "@/lib/madar/format";
import { formatAmount, formatDateShort, getCategoryInfo } from "@/lib/utils";

type GoTarget = "daily" | "budgets" | "recurring" | "installments" | "reserves" | "history";
type SummaryId = "curve" | "cycle" | "budgets";

interface FinanceCycleDashboardProps {
  curve: CycleCurve | null;
  overview: FinanceOverview;
  categories: FinanceCategoryDef[];
  budgetRows: BudgetStatus[];
  onGo: (target: GoTarget) => void;
  visible?: (id: SummaryId) => boolean;
}

type RingStyle = CSSProperties & {
  "--ring-tone": string;
  "--ring-progress": string;
};

function salaryLabel(days: number): string {
  if (days === 0) return "اليوم";
  if (days === 1) return "غدًا";
  return `${formatAmount(days)} يوم`;
}

/**
 * الواجهة المختصرة للدورة: نفس حسابات مدار الحالية، لكن بترتيب التصميم
 * المعتمد (المنحنى ← حالة الدورة ← دوائر السقوف). لا يملك هذا المكوّن أي
 * بيانات ولا يغيّرها؛ كل زرٍ يعيد المستخدم إلى المحرّر الحقيقي أسفل الصفحة.
 */
export function FinanceCycleDashboard({
  curve,
  overview,
  categories,
  budgetRows,
  onGo,
  visible = () => true,
}: FinanceCycleDashboardProps) {
  const geometry = curve ? curveGeometry(curve) : null;
  const tone = curve?.over ? "var(--clay)" : "var(--theme-accent)";
  const bars = curve ? disciplineDays(curve) : [];
  const score = curve ? disciplineScore(curve) : null;
  const projected = curve
    ? projectedCycleSurplus(
        { balance: overview.availableToday, spent: curve.spent, days: curve.idx },
        curve.perDay,
        overview.daysToSalary
      )
    : null;
  const cycleProgress = curve ? Math.min(100, Math.max(0, (curve.idx / curve.total) * 100)) : 0;
  const overCount = budgetRows.filter((row) => row.state === "over").length;
  const nearCount = budgetRows.filter((row) => row.state === "near").length;

  return (
    <div className="mdr-finance-dashboard animate-fade-up">
      {visible("curve") && <section className="mdr-finance-panel mdr-finance-curve-panel" aria-labelledby="finance-curve-title">
        <div className="mdr-finance-panel-head">
          <div>
            <span className="mdr-finance-kicker">منحنى الصرف</span>
            <h2 id="finance-curve-title">صرفك مقارنة بخط الميزانية</h2>
            <p>الخط المتصل صرفك الفعلي، والمتقطع ما تسمح به خطتك.</p>
          </div>
          {curve && (
            <span className="mdr-finance-period">
              {formatDateShort(curve.start)} — {formatDateShort(curve.end)}
            </span>
          )}
        </div>

        {curve && geometry ? (
          <>
            <div className="mdr-finance-curve-box">
              <svg viewBox="0 0 300 116" preserveAspectRatio="none" role="img" aria-label="منحنى الصرف التراكمي مقارنة بخط الميزانية">
                <path d={geometry.areaD} fill={tone} opacity=".12" />
                <path d={geometry.allowD} fill="none" stroke="var(--gold)" strokeWidth="1.2" strokeDasharray="4 3" />
                <path d={geometry.spendD} fill="none" stroke={tone} strokeWidth="1.9" strokeLinejoin="round" />
                <line x1={geometry.nowX} y1="0" x2={geometry.nowX} y2={CURVE_BASE} stroke="var(--ink34)" strokeWidth=".8" />
                <line x1="0" y1={CURVE_BASE} x2="300" y2={CURVE_BASE} stroke="var(--line)" strokeWidth="1" />
              </svg>
              <div className="mdr-finance-curve-labels">
                <span>الراتب · {formatDateShort(curve.start)}</span>
                <span>الراتب التالي · {formatDateShort(curve.end)}</span>
              </div>
              <div className="mdr-finance-curve-legend">
                <span><i className="is-plan" />خط الميزانية</span>
                <span><i className="is-spend" style={{ background: tone }} />صرفك · {formatAmount(curve.spent)} ر.س</span>
              </div>
            </div>
            <div className="mdr-finance-curve-foot">
              <p className={curve.over ? "is-over" : ""}>
                <i />
                {curve.over
                  ? `أعلى من خطتك بـ ${formatAmount(curve.diff)} ر.س`
                  : `أقل من خطتك بـ ${formatAmount(curve.diff)} ر.س`}
              </p>
              <Link href="/finance/insights">تحليل الصرف <TrendingDown size={14} /></Link>
            </div>
          </>
        ) : overview.hasBudget ? (
          <Link href="/settings" className="mdr-finance-empty-curve">
            <Wallet size={22} />
            <span><strong>الميزانية مفعّلة</strong><small>اختر «دورة الراتب» من الإعدادات ليظهر خط المقارنة هنا.</small></span>
            <ChevronLeft size={18} />
          </Link>
        ) : (
          <button type="button" className="mdr-finance-empty-curve" onClick={() => onGo("daily")}>
            <Wallet size={22} />
            <span><strong>حدّد ميزانيتك اليومية</strong><small>وبعدها يظهر خط صرفك تلقائيًا هنا.</small></span>
            <ChevronLeft size={18} />
          </button>
        )}
      </section>}

      {visible("cycle") && <section className="mdr-finance-panel mdr-finance-cycle-panel" aria-labelledby="finance-cycle-title">
        <div className="mdr-finance-cycle-top">
          <div>
            <span className={`mdr-finance-cycle-state ${curve?.over ? "is-over" : ""}`}><i />{curve?.over ? "يحتاج مراجعة" : overview.hasBudget ? "ضمن المسار" : "غير محدد"}</span>
            <h2 id="finance-cycle-title">حالة الدورة</h2>
          </div>
          <button type="button" className={`mdr-finance-available ${overview.availableToday < 0 ? "is-negative" : ""}`} onClick={() => onGo("daily")}>
            <strong>{overview.hasBudget ? formatAmount(overview.availableToday) : "—"}</strong>
            <span>{overview.hasBudget ? "ر.س متاح حتى اليوم" : "حدّد الميزانية"}</span>
          </button>
        </div>

        <div className="mdr-finance-cycle-track" aria-hidden="true">
          <span style={{ width: `${cycleProgress}%` }} />
          {curve && <i style={{ insetInlineStart: `${cycleProgress}%` }} />}
        </div>

        <div className="mdr-finance-cycle-metrics">
          <div><span>يوم الدورة</span><strong>{curve ? `${arNum(curve.idx)} / ${arNum(curve.total)}` : "—"}</strong></div>
          <button type="button" onClick={() => onGo("history")}><span>صرف الدورة</span><strong>{curve ? `${formatAmount(curve.spent)} ر.س` : "—"}</strong></button>
          <button type="button" onClick={() => onGo("history")}><span>صرف الشهر</span><strong>{formatAmount(overview.monthSpend)} ر.س</strong></button>
          <div><span>إلى الراتب</span><strong>{salaryLabel(overview.daysToSalary)}</strong></div>
        </div>

        {projected && (
          <div className={`mdr-finance-projection ${projected.projected < 0 ? "is-negative" : ""}`}>
            <span className="mdr-finance-projection-mark">◇</span>
            <div>
              <strong>المتوقع عند نزول الراتب: {formatAmount(projected.projected)} ر.س</strong>
              <span>تقدير مبني على وتيرة صرفك الحالية، وليس رقمًا ثابتًا.</span>
            </div>
            <button type="button" onClick={() => onGo(projected.projected >= 0 ? "reserves" : "daily")}>
              {projected.projected >= 0 ? "الاحتياطي" : "راجع الخطة"}
            </button>
          </div>
        )}

        {overview.nearest && (
          <button
            type="button"
            className="mdr-finance-next-commitment"
            onClick={() => onGo(overview.nearest?.kind === "installment" ? "installments" : "recurring")}
          >
            <span>أقرب التزام</span>
            <strong>{overview.nearest.note || getCategoryInfo(categories, overview.nearest.category).label}</strong>
            <b>{formatAmount(overview.nearest.amount)} ر.س · {salaryLabel(overview.nearest.daysUntil)}</b>
            <ChevronLeft size={15} />
          </button>
        )}

        {curve && score && (
          <div className="mdr-finance-discipline">
            <div className="mdr-finance-discipline-head"><i /><h3>انضباط الأيام</h3><span /><strong>{arPct(score.ratio)}</strong></div>
            <div className="mdr-finance-discipline-bars" aria-label={`${arNum(score.within)} من ${arNum(score.of)} يومًا داخل البدل`}>
              {bars.map((bar) => (
                <i
                  key={bar.day}
                  className={bar.over ? "is-over" : ""}
                  title={`اليوم ${arNum(bar.day)} · ${formatAmount(bar.value)} ر.س`}
                  style={{ height: bar.height }}
                />
              ))}
            </div>
            <p>{arNum(score.within)} من {arNum(score.of)} يومًا داخل البدل</p>
          </div>
        )}
      </section>}

      {visible("budgets") && <section className="mdr-finance-panel mdr-finance-budgets-panel" aria-labelledby="finance-budgets-title">
        <div className="mdr-finance-budgets-head">
          <div className="mdr-finance-section-title">
            <span><Gauge size={16} /></span>
            <div><h2 id="finance-budgets-title">سقوف الإنفاق</h2><p>كل سقف تضيفه يظهر هنا تلقائيًا.</p></div>
          </div>
          <strong className={overCount ? "is-over" : nearCount ? "is-near" : ""}>
            {overCount ? `${formatAmount(overCount)} متجاوز` : nearCount ? `${formatAmount(nearCount)} قريب` : budgetRows.length ? "ضمن السقوف" : "لا سقوف بعد"}
          </strong>
        </div>

        {budgetRows.length ? (
          <div className="mdr-finance-budget-grid">
            {budgetRows.map((row) => {
              const info = getCategoryInfo(categories, row.category);
              const toneForRow = row.state === "over" ? "var(--clay)" : "var(--theme-accent)";
              const style: RingStyle = {
                "--ring-tone": toneForRow,
                "--ring-progress": `${Math.min(100, Math.max(0, row.pct))}%`,
              };
              return (
                <button key={row.category} type="button" className="mdr-finance-budget-item" onClick={() => onGo("budgets")}>
                  <span className="mdr-finance-budget-ring" style={style}>
                    <span><strong>{formatAmount(row.spent)}</strong><small>{arPct(row.pct / 100)}</small></span>
                  </span>
                  <strong className="mdr-finance-budget-name">{info.label}</strong>
                  <small>{row.remaining < 0 ? `تجاوز ${formatAmount(Math.abs(row.remaining))}` : `يبقى ${formatAmount(row.remaining)} من ${formatAmount(row.cap)} ر.س`}</small>
                </button>
              );
            })}
          </div>
        ) : (
          <button type="button" className="mdr-finance-budget-empty" onClick={() => onGo("budgets")}>
            أضف أول سقف إنفاق ليظهر هنا كدائرة واضحة.
          </button>
        )}

        <div className="mdr-finance-budget-foot">
          <span>المبالغ من دورة مدار الحالية وتُحدّث مع كل مصروف.</span>
          <button type="button" onClick={() => onGo("budgets")}>تعديل السقوف <ChevronLeft size={14} /></button>
        </div>
      </section>}
    </div>
  );
}
