"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { InstallmentPlan } from "@/lib/types";
import { ASSET_LIFE_PRESETS } from "@/lib/types";
import {
  planSummary, installmentsOverview, partsTotal, installmentDueDates,
  describeDueIn, daysBetween, INSTALLMENT_STATUS_LABEL, MAX_INSTALLMENT_COUNT, rowRemaining,
  isValidDateKey, type ScheduleRow,
} from "@/lib/installments";
import { uid, today, formatAmount, formatDateShort, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { NumberInput } from "@/components/ui/NumberInput";
import { showUndo } from "@/components/ui/UndoToast";
import { Plus, Trash2, X, CheckCircle2, Bell, Pencil, Ban, RotateCcw, Wallet } from "lucide-react";

// «الأقساط» — أُعيد بناء المدخل كلّه حول القصّة الحقيقية للشراء بالتقسيط:
// *دفعتُ أوّلاً كذا، ثمّ عليّ قسطٌ كذا كلّ شهر لكذا شهراً.* المالك يكتب ما يعرفه
// فقط؛ الإجمالي يُحسب هنا (لا يُطالَب بجمعه)، والدفعة الأولى تُسجَّل مصروفاً
// حقيقياً بتاريخها لأنها خرجت فعلاً، والتذكير الشهري يُربط تلقائياً.
//
// ما لم يتغيّر — وهو المبدأ الحاكم: **الخطة وصفُ اتفاقٍ لا مصروف**. لا معاملةَ
// تُخلق لقسطٍ لمجرّد مرور موعده، ولا مصروفَ وهمياً لفرق سدادٍ مبكر.
export function InstallmentPlans() {
  const { installmentPlans, transactions, categories, cancelInstallmentPlan, reopenInstallmentPlan,
    deleteInstallmentPlan, addInstallmentPlan, payNextInstallment } = useAppStore();
  const plans = installmentPlans ?? [];
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const todayStr = today();
  const overview = installmentsOverview(plans, transactions, todayStr);

  // النشطة أولاً ثمّ الأقرب استحقاقاً، والمغلقة في الذيل.
  const ordered = [...plans].sort((a, b) => {
    const openA = a.status === "active" ? 0 : 1;
    const openB = b.status === "active" ? 0 : 1;
    return openA - openB || a.firstDueDate.localeCompare(b.firstDueDate);
  });

  function handleDelete(plan: InstallmentPlan) {
    deleteInstallmentPlan(plan.id);
    setOpenId(null);
    // الحذف شاهدٌ فقط والمعاملات باقية — فالتراجع يُعيد الخطة كما كانت.
    showUndo("حذفت خطة الأقساط", () => addInstallmentPlan(plan));
  }

  return (
    <div className="space-y-3">
      {/* لا عنوان هنا: البطاقة تعيش داخل «الأقساط» القابل للطيّ في صفحة الأموال،
          ورأسُه يحمل الاسم والمتبقّي وشارة المتأخّر — تكرارُهما هنا كان يعرض
          القسم مرّتين متطابقتين. */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => { setAdding((v) => !v); setEditId(null); }}
          className="text-finance hover:text-finance/80 p-1.5 press shrink-0"
          aria-label="إضافة خطة أقساط"
        >
          <Plus size={16} />
        </button>
      </div>

      {overview.activeCount > 0 && (
        <p className="text-[10px] text-gray-400 leading-relaxed">
          القسط الشهري المجموع {formatAmount(overview.monthlyLoad)} ر.س
          {overview.savedTotal > 0 ? ` · وفّرت بالسداد المبكر ${formatAmount(overview.savedTotal)} ر.س` : ""}
        </p>
      )}

      {(adding || editId) && (
        <PlanForm
          key={editId ?? "new"}
          initial={editId ? plans.find((p) => p.id === editId) : undefined}
          onDone={() => { setAdding(false); setEditId(null); }}
        />
      )}

      {/* ===== الطريق اليوميّ: القسط القادم بضغطةٍ واحدة =====
          اختصارٌ **عبر الخطط**: يُظهر أقرب قسطٍ من بينها كلّها. مع خطةٍ واحدة
          مفتوحة يصير هو نفسَه زرَّ بطاقتها حرفياً (نفس القسط ونفس المبلغ ونفس
          الفعل)، فيقرأه المالك عمليةً مكرّرة — فلا نعرضه إلا حين يوفّر بحثاً. */}
      {overview.next && overview.activeCount > 1 && (
        <div className={cn(
          "flex items-center gap-2 rounded-xl border p-2.5",
          overview.next.row.due < todayStr
            ? "border-red-200 bg-red-50/70 dark:border-red-500/20 dark:bg-red-500/10"
            : "border-finance/25 bg-finance/5"
        )}>
          <span className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 flex items-center justify-center shrink-0 text-finance">
            <Wallet size={15} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-gray-800 dark:text-gray-100 truncate">
              {overview.next.plan.name || overview.next.plan.provider} · القسط {overview.next.row.no}
            </div>
            <div className="text-[10px] text-gray-500">
              {formatAmount(rowRemaining(overview.next.row))} ر.س
              {overview.next.row.paidAmount > 0 ? ` (باقي من ${formatAmount(overview.next.row.amount)})` : ""}
              {" · "}{describeDueIn(daysBetween(todayStr, overview.next.row.due))}
            </div>
          </div>
          <button
            onClick={() => payNextInstallment(overview.next!.plan.id)}
            className="shrink-0 text-[11px] font-bold text-white bg-finance rounded-lg px-3 py-2 press"
          >
            سجّل الدفع
          </button>
        </div>
      )}

      {plans.length === 0 && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="w-full py-5 rounded-xl border-2 border-dashed border-finance/30 text-finance text-sm font-medium hover:bg-finance/5 press"
        >
          🧾 اشتريتَ شيئاً بالتقسيط؟ اكتب الدفعة الأولى والقسط وعدد الشهور
        </button>
      )}

      <div className="space-y-2">
        {ordered.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            open={openId === plan.id}
            onTap={() => setOpenId(openId === plan.id ? null : plan.id)}
            onEdit={() => { setEditId(plan.id); setAdding(false); }}
            onCancel={() => cancelInstallmentPlan(plan.id)}
            onReopen={() => reopenInstallmentPlan(plan.id)}
            onDelete={() => handleDelete(plan)}
            categoryLabel={categories.find((c) => c.id === plan.category)?.label}
          />
        ))}
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
function PlanCard({
  plan, open, onTap, onEdit, onCancel, onReopen, onDelete, categoryLabel,
}: {
  plan: InstallmentPlan;
  open: boolean;
  onTap: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onReopen: () => void;
  onDelete: () => void;
  categoryLabel?: string;
}) {
  const { transactions, recordInstallmentPayment, settleInstallmentPlan, linkInstallmentReminder, payNextInstallment } = useAppStore();
  const todayStr = today();
  const s = planSummary(plan, transactions, todayStr);
  const [settleAmount, setSettleAmount] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closed = plan.status !== "active";

  return (
    <div
      className={cn(
        "mdr-finance-installment-card rounded-2xl border p-3 space-y-2.5",
        closed
          ? "border-gray-100 bg-gray-50 dark:bg-white/5"
          : s.overdue > 0
            ? "border-red-200 bg-red-50/60 dark:border-red-500/20 dark:bg-red-500/10"
            : "border-gray-100 bg-white"
      )}
    >
      <button onClick={onTap} aria-expanded={open} className="w-full text-right press" >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">
                {plan.name || plan.provider}
              </span>
              {closed && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-300 shrink-0">
                  {plan.status === "settled" ? "مسددة مبكراً" : INSTALLMENT_STATUS_LABEL[plan.status]}
                </span>
              )}
              {!closed && s.overdue > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white shrink-0">
                  {formatAmount(s.overdue)} متأخّر
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-400 truncate mt-0.5">
              {plan.provider}
              {categoryLabel ? ` · ${categoryLabel}` : ""}
              {` · ${formatAmount(plan.installmentAmount)} × ${formatAmount(plan.count)}`}
            </div>
            <div className="text-[11px] font-semibold text-gray-500 mt-0.5">
              {formatAmount(s.paidRows)} من {formatAmount(s.totalRows)} قسطاً مكتملاً
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-bold tabular-nums text-gray-800 dark:text-gray-100">
              {formatAmount(s.paid)} / {formatAmount(plan.totalPrice)}
            </div>
            <div className="text-[10px] text-gray-400">{s.pct}٪</div>
          </div>
        </div>

        <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden mt-2">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${s.pct}%`, backgroundColor: s.overdue > 0 ? "#e05555" : "var(--theme-accent)" }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] mt-1.5">
          {plan.status === "settled" ? (
            <span className="text-finance font-semibold">
              سُدّدت مبكراً{s.saved > 0 ? ` · وفّرت ${formatAmount(s.saved)} ر.س` : ""}
            </span>
          ) : plan.status === "cancelled" ? (
            <span className="text-gray-400">ملغاة — ما دُفع محفوظ في السجل</span>
          ) : s.next ? (
            <span className={cn("font-semibold", s.next.due < todayStr ? "text-red-500" : "text-gray-500")}>
              القادم: {formatAmount(s.next.amount)} ر.س · {formatDateShort(s.next.due)} ·{" "}
              {describeDueIn(daysBetween(todayStr, s.next.due))}
            </span>
          ) : (
            <span className="text-finance font-semibold">اكتملت كل الأقساط ✓</span>
          )}
          <span className="text-gray-400 shrink-0">
            متبقٍّ {formatAmount(plan.status === "active" ? s.remaining : 0)} ر.س
          </span>
        </div>
      </button>

      {!closed && s.next && (
        <button
          onClick={() => payNextInstallment(plan.id)}
          className="w-full text-[11px] font-bold text-finance bg-finance/10 rounded-lg py-2 press"
        >
          سجّل دفع القسط {s.next.no} ({formatAmount(rowRemaining(s.next))} ر.س
          {s.next.paidAmount > 0 ? " — الباقي عليه" : ""})
        </button>
      )}

      {open && (
        <div className="space-y-2.5 pt-1 border-t border-gray-100 dark:border-white/10">
          {/* الأصل المؤجّل (شراءٌ سُجّل مصروفاً ثمّ قُسِّط) */}
          {s.principal && (
            <div className="rounded-lg bg-gray-50 dark:bg-white/5 px-2.5 py-2 text-[10px] text-gray-500 leading-relaxed">
              🧾 الأصل مربوطٌ بمصروف {formatDateShort(s.principal.date)} بمبلغ{" "}
              {formatAmount(s.principal.amount)} ر.س — <strong>مؤجّل</strong>: لا يُحتسب في الميزانية
              ولا السقوف، والأقساط هي الصرف الفعليّ.
            </div>
          )}

          {/* الدفعة الأولى */}
          {plan.downPayment > 0 && (
            <div className="flex items-center justify-between bg-gray-50 dark:bg-white/5 rounded-lg px-2.5 py-2">
              <span className="text-[11px] text-gray-500">
                الدفعة الأولى · {formatAmount(plan.downPayment)} ر.س
                {plan.downDate ? ` · ${formatDateShort(plan.downDate)}` : ""}
              </span>
              {s.downPaid ? (
                <span className="text-[11px] font-bold text-finance flex items-center gap-1">
                  <CheckCircle2 size={12} /> سُجّلت
                </span>
              ) : (
                <button
                  onClick={() => recordInstallmentPayment(plan.id, {
                    role: "down", amount: plan.downPayment, date: plan.downDate,
                  })}
                  className="text-[11px] font-bold text-finance bg-finance/10 rounded-lg px-2 py-1 press"
                >
                  سجّل الدفعة
                </button>
              )}
            </div>
          )}

          {/* جدول الاستحقاق */}
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-gray-500">جدول الاستحقاق</div>
            {s.rows.map((row) => (
              <ScheduleRowView
                key={row.no}
                row={row}
                todayStr={todayStr}
                closed={closed}
                onPay={() =>
                  recordInstallmentPayment(plan.id, {
                    role: row.isFinal ? "final" : "installment",
                    // الباقي على الصفّ فقط (قد يكون دُفع جزئياً سابقاً).
                    amount: rowRemaining(row),
                    installmentNo: row.no,
                    // **تاريخ الدفع الفعليّ = اليوم** حتى للقسط المتأخّر: المعاملة
                    // سجلٌّ لخروج النقد، وموعد الاستحقاق يبقى في جدول الخطة.
                    date: todayStr,
                  })
                }
              />
            ))}
          </div>

          {plan.note && <p className="text-[11px] text-gray-500">{plan.note}</p>}

          {/* سدادٌ مبكر — بالمبلغ الفعليّ وحده */}
          {plan.status === "active" && s.remaining > 0 && (
            <div className="rounded-lg bg-finance/5 p-2 space-y-1.5">
              <div className="text-[10px] font-semibold text-gray-600">سدّد الباقي مبكراً</div>
              <div className="flex gap-1.5">
                <NumberInput
                  value={settleAmount}
                  onChange={setSettleAmount}
                  placeholder={`المبلغ الفعليّ (المتبقّي ${formatAmount(s.remaining)})`}
                  inputMode="decimal"
                  className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
                />
                <button
                  onClick={() => {
                    const v = parseFloat(settleAmount);
                    if (!v || v <= 0) return;
                    settleInstallmentPlan(plan.id, v);
                    setSettleAmount("");
                  }}
                  className="text-[11px] font-bold text-white bg-finance rounded-lg px-3 press shrink-0"
                >
                  سدّد
                </button>
              </div>
              <p className="text-[10px] text-gray-400">
                يُسجَّل المبلغ الفعليّ فقط؛ الفرق يُعرَض «موفَّراً» ولا يُخلَق له مصروف.
              </p>
            </div>
          )}

          {/* إجراءات الخطة */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <button onClick={onEdit} className="flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1 press">
              <Pencil size={11} /> تعديل
            </button>
            {!plan.recurringId && plan.status === "active" && (
              <button
                onClick={() => linkInstallmentReminder(plan.id)}
                className="flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1 press"
                title="تذكير شهري فقط — لا يُنشئ مصروفاً تلقائياً"
              >
                <Bell size={11} /> اربط تذكيراً شهرياً
              </button>
            )}
            {plan.status === "active" ? (
              <button onClick={onCancel} className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-100 dark:bg-amber-500/20 rounded-lg px-2 py-1 press">
                <Ban size={11} /> إلغاء الخطة
              </button>
            ) : (
              <button onClick={onReopen} className="flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1 press">
                <RotateCcw size={11} /> إعادة تنشيط
              </button>
            )}
            {confirmDelete ? (
              <span className="flex items-center gap-1.5">
                <button onClick={onDelete} className="text-[11px] font-bold text-white bg-red-500 rounded-lg px-2 py-1 press">
                  أكّد الحذف
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-[11px] text-gray-500 bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1 press">
                  تراجع
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-400 press"
              >
                <Trash2 size={11} /> حذف
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-400">
            الإلغاء والحذف لا يمسّان أيّ دفعةٍ سُجّلت — تبقى في سجل المصاريف.
          </p>
        </div>
      )}
    </div>
  );
}

function ScheduleRowView({
  row, todayStr, closed, onPay,
}: {
  row: ScheduleRow;
  todayStr: string;
  closed: boolean;
  onPay: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px]",
        row.paid
          ? "bg-green-50 dark:bg-green-500/10"
          : row.overdue
            ? "bg-red-50 dark:bg-red-500/10"
            : "bg-gray-50 dark:bg-white/5"
      )}
    >
      <span className="w-5 shrink-0 text-gray-400 tabular-nums">{row.no}</span>
      <span className="flex-1 min-w-0 truncate text-gray-600 dark:text-gray-300">
        {formatDateShort(row.due)}
        {row.isFinal ? " · دفعة أخيرة" : ""}
        {row.overdue ? ` · ${describeDueIn(daysBetween(todayStr, row.due))}` : ""}
        {row.closedEarly ? " · أُغلق بالسداد المبكر" : ""}
      </span>
      <span className="shrink-0 font-bold tabular-nums text-gray-700 dark:text-gray-200">
        {formatAmount(row.amount)}
        {!row.paid && row.paidAmount > 0 && (
          <span className="font-normal text-[10px] text-gray-400"> (دُفع {formatAmount(row.paidAmount)})</span>
        )}
      </span>
      {row.paid ? (
        <span className="shrink-0 text-finance flex items-center gap-1">
          <CheckCircle2 size={12} /> مدفوع
        </span>
      ) : row.closedEarly || closed ? (
        <span className="shrink-0 text-gray-400">—</span>
      ) : (
        <button onClick={onPay} className="shrink-0 font-bold text-finance bg-finance/10 rounded-lg px-2 py-0.5 press">
          سجّل
        </button>
      )}
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
// نموذج الخطة — مرتّبٌ على ترتيب القصّة لا على ترتيب الحقول: ما اشتريتَه، ثمّ ما
// دفعتَه أوّلاً، ثمّ ما عليك شهرياً. **لا خانة للسعر الإجمالي**: يُحسب من البنود
// ويُعرَض حيّاً، فلا يوجد ما يتعارض ولا تحذير تطابقٍ أصلاً.
function PlanForm({ initial, onDone }: { initial?: InstallmentPlan; onDone: () => void }) {
  const { categories, createInstallmentPlan, updateInstallmentPlan, addAsset } = useAppStore();
  const mains = categories.filter((c) => !c.parentId);
  const [name, setName] = useState(initial?.name ?? "");
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [downPayment, setDownPayment] = useState(initial?.downPayment ? String(initial.downPayment) : "");
  const [downDate, setDownDate] = useState(initial?.downDate ?? initial?.createdAt ?? today());
  const [installmentAmount, setInstallmentAmount] = useState(initial?.installmentAmount ? String(initial.installmentAmount) : "");
  const [count, setCount] = useState(initial?.count ? String(initial.count) : "");
  const [firstDueDate, setFirstDueDate] = useState(initial?.firstDueDate ?? nextMonth(today()));
  const [touchedDue, setTouchedDue] = useState(!!initial);
  const [finalPayment, setFinalPayment] = useState(initial?.finalPayment ? String(initial.finalPayment) : "");
  const [category, setCategory] = useState(initial?.category ?? mains[0]?.id ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  // الدفعة الأولى مصروفٌ حقيقيّ يُسجَّل تلقائياً — إلا إذا كان المالك سجّلها بيده.
  const [recordDown, setRecordDown] = useState(true);
  const [reminder, setReminder] = useState(true);
  // «هذا شيءٌ غالٍ يبقى معي» → يُضاف للأصول بثمنه الكامل ويبدأ إهلاكه اليوميّ.
  const [asAsset, setAsAsset] = useState(false);
  const [lifeDays, setLifeDays] = useState(730);
  const [errors, setErrors] = useState<string[]>([]);
  const [showExtras, setShowExtras] = useState(!!(initial?.finalPayment || initial?.note));

  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const down = num(downPayment);
  const inst = num(installmentAmount);
  const n = Math.floor(num(count));
  const fin = num(finalPayment);
  const total = partsTotal({ downPayment: down, installmentAmount: inst, count: n, finalPayment: fin || undefined });
  const ready = !!name.trim() && inst > 0 && n >= 1;

  // أوّل موعد قسطٍ = بعد شهرٍ من الدفعة الأولى ما لم يغيّره المالك — الافتراض
  // الصحيح في تسعة من عشرة عقود، فلا يبقى الحقل عبئاً.
  function handleDownDate(v: string) {
    setDownDate(v);
    if (!touchedDue && isValidDateKey(v)) setFirstDueDate(nextMonth(v));
  }

  // نواقص المسوّدة **حيّةً** أثناء الكتابة، لا بعد الضغط: زرٌّ يرفض الحفظ صامتاً
  // يبدو معطّلاً لا مانعاً. فالزرّ يُعطَّل ظاهراً ويُكتب سببه تحته.
  const problems: string[] = [];
  if (!name.trim()) problems.push("اكتب ما اشتريتَه");
  if (!(inst > 0)) problems.push("قيمة القسط الشهري مطلوبة");
  if (!(n >= 1)) problems.push("عدد الشهور لا يقلّ عن ١");
  else if (n > MAX_INSTALLMENT_COUNT) problems.push(`عدد الأقساط أكبر من المعقول (الحدّ ${MAX_INSTALLMENT_COUNT})`);
  if (down < 0) problems.push("الدفعة الأولى لا تكون سالبة");
  if (!isValidDateKey(firstDueDate)) problems.push("أول موعد قسط مطلوب");

  function handleSave() {
    if (problems.length) { setErrors(problems); return; }
    try {
      save();
    } catch (e) {
      // أيّ خللٍ في الحفظ يُعرَض نصّاً بدل أن يبتلعه المتصفّح فيبدو الزرّ ميتاً.
      setErrors([`تعذّر الحفظ: ${e instanceof Error ? e.message : String(e)}`]);
    }
  }

  function save() {

    if (initial) {
      // التعديل يعيد حساب الإجمالي من البنود — الجدول مشتقٌّ فلا نسخةَ قديمة تتخلّف.
      updateInstallmentPlan(initial.id, {
        name: name.trim(), provider: provider.trim(),
        downPayment: down, downDate,
        installmentAmount: inst, count: n, firstDueDate,
        finalPayment: fin || undefined,
        totalPrice: total,
        category: category || undefined,
        note: note.trim() || undefined,
      });
      onDone();
      return;
    }

    const planId = createInstallmentPlan({
      provider, name, downPayment: down, downDate,
      installmentAmount: inst, count: n, firstDueDate,
      finalPayment: fin || undefined,
      category: category || undefined,
      note: note.trim() || undefined,
      recordDown, reminder,
    });
    if (!planId) { setErrors(["تعذّر حفظ الخطة — راجِع الأرقام"]); return; }
    if (asAsset) {
      addAsset({
        id: uid(),
        name: name.trim(),
        purchaseDate: downDate,
        purchasePrice: total, // ما سيكلّفك فعلاً بالتقسيط، لا السعر النقديّ
        lifeDays,
        planId,
        createdAt: today(),
      });
    }
    onDone();
  }

  const field = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-finance/40";
  const step = "text-[10px] font-bold text-finance";

  return (
    <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 space-y-3 animate-fade-up">
      {/* ١ — وش اشتريت */}
      <div className="space-y-1.5">
        <div className={step}>١ · وش اشتريت؟</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="جوّال، أثاث، لابتوب…" className={field} autoFocus />
        <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="الجهة (تمارا، بنك، معرض…) — اختياري" className={field} />
      </div>

      {/* ٢ — الدفعة الأولى */}
      <div className="space-y-1.5">
        <div className={step}>٢ · كم دفعتَ أوّلاً؟</div>
        <div className="grid grid-cols-2 gap-2">
          <NumberInput value={downPayment} onChange={setDownPayment} placeholder="٠ إن ما دفعت" inputMode="decimal" className={field} />
          <input type="date" value={downDate} onChange={(e) => handleDownDate(e.target.value || downDate)} className={field} />
        </div>
        {down > 0 && !initial && (
          <label className="flex items-start gap-2 text-[10px] text-gray-500 leading-relaxed">
            <input type="checkbox" checked={recordDown} onChange={(e) => setRecordDown(e.target.checked)} className="mt-0.5 accent-[var(--theme-accent)]" />
            <span>سجّلها مصروفاً بتاريخها ({formatAmount(down)} ر.س) — أزِل العلامة إن كنتَ سجّلتَها بنفسك.</span>
          </label>
        )}
      </div>

      {/* ٣ — القسط الشهري */}
      <div className="space-y-1.5">
        <div className={step}>٣ · القسط الشهري وعدد الشهور</div>
        <div className="grid grid-cols-2 gap-2">
          <NumberInput value={installmentAmount} onChange={setInstallmentAmount} placeholder="مثلاً ٧٨٠" inputMode="decimal" className={field} />
          <NumberInput value={count} onChange={setCount} placeholder="مثلاً ٦ شهور" inputMode="numeric" min={1} max={MAX_INSTALLMENT_COUNT} className={field} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">أول موعد قسط</label>
          <input
            type="date"
            value={firstDueDate}
            // قيمةٌ فارغة من منتقي التاريخ (Safari بتقويمٍ هجريّ) كانت تُفقد الموعد
            // فيرفض الزرّ الحفظ صامتاً — نتمسّك بآخر تاريخٍ صالح.
            onChange={(e) => { setFirstDueDate(e.target.value || firstDueDate); setTouchedDue(true); }}
            className={field}
          />
        </div>
      </div>

      {/* الخلاصة الحيّة — الإجمالي يُحسب هنا، ولا يُطالَب به المالك */}
      {ready && (
        <div className="rounded-lg bg-finance/5 border border-finance/20 px-3 py-2 text-[11px] leading-relaxed text-gray-700 dark:text-gray-200">
          الإجمالي <strong className="tabular-nums">{formatAmount(total)} ر.س</strong>
          {down > 0 ? ` = ${formatAmount(down)} + ${formatAmount(inst)} × ${formatAmount(fin > 0 ? n - 1 : n)}` : ` = ${formatAmount(inst)} × ${formatAmount(fin > 0 ? n - 1 : n)}`}
          {fin > 0 ? ` + دفعة أخيرة ${formatAmount(fin)}` : ""}
          {isValidDateKey(firstDueDate) && (
            <span className="text-gray-400"> · آخر قسط {formatDateShort(lastDue(firstDueDate, n))}</span>
          )}
          {!initial && reminder && <span className="text-gray-400"> · تذكيرٌ شهريّ تلقائيّ</span>}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowExtras((v) => !v)}
        className="w-full flex items-center justify-between text-[11px] font-semibold text-gray-500 press"
      >
        <span>تفاصيل إضافية (التصنيف · دفعة أخيرة · ملاحظة{initial ? "" : " · أصل"})</span>
        <span className="text-gray-400">{showExtras ? "▲" : "▼"}</span>
      </button>

      {showExtras && (
        <div className="space-y-2.5">
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">تصنيف المدفوعات</label>
            <div className="grid grid-cols-3 gap-1.5">
              {mains.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-1.5 rounded-lg border text-[11px]",
                    category === cat.id ? "border-finance bg-finance/5 text-finance" : "border-gray-200 text-gray-500"
                  )}
                >
                  <span className="text-base">{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">دفعة أخيرة كبيرة (تستبدل آخر قسط)</label>
            <NumberInput value={finalPayment} onChange={setFinalPayment} placeholder="اختياري" inputMode="decimal" className={field} />
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" className={field} />
          {!initial && (
            <label className="flex items-start gap-2 text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed">
              <input type="checkbox" checked={asAsset} onChange={(e) => setAsAsset(e.target.checked)} className="mt-0.5" />
              <span>هذا شيءٌ غالٍ يبقى معي — تابِعه في «الأصول» واحسب استهلاكه اليوميّ.</span>
            </label>
          )}
          {!initial && asAsset && (
            <div className="flex gap-1.5 flex-wrap">
              {ASSET_LIFE_PRESETS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => setLifeDays(p.days)}
                  className={cn(
                    "text-[11px] rounded-full px-2.5 py-1 border press",
                    lifeDays === p.days ? "border-finance bg-finance/10 text-finance font-bold" : "border-gray-200 text-gray-500"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="text-[11px] text-red-500 space-y-0.5">
          {errors.map((e) => <li key={e}>• {e}</li>)}
        </ul>
      )}

      {/* سبب تعطّل الزرّ ظاهرٌ دائماً — فلا يُظنّ ميتاً وهو ممتنع. */}
      {problems.length > 0 && errors.length === 0 && (
        <p className="text-[11px] text-gray-400">لإتمام الحفظ: {problems[0]}</p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={problems.length > 0}
          className="flex-1 bg-finance hover:bg-finance/90"
        >
          {initial ? "حفظ التعديل" : "أضِف الخطة"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDone} className="gap-1">
          <X size={14} /> إلغاء
        </Button>
      </div>
    </div>
  );
}

// بعد شهرٍ من تاريخٍ، بيوم المرساة نفسه ما أمكن (٣١ يناير → ٢٨/٢٩ فبراير).
function nextMonth(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const dt = new Date(y, m, Math.min(d, lastDay));
  const p = (v: number) => String(v).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

// موعد آخر قسطٍ — من مولّد الجدول نفسه، فلا تختلف المعاينة عن الجدول المعروض.
function lastDue(first: string, count: number): string {
  const dues = installmentDueDates(first, count);
  return dues[dues.length - 1] ?? first;
}
