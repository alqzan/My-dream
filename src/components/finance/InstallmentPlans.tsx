"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { InstallmentPlan } from "@/lib/types";
import {
  planSummary, planExpectedTotal, validatePlanDraft, installmentsOverview,
  describeDueIn, daysBetween, INSTALLMENT_STATUS_LABEL, type ScheduleRow,
} from "@/lib/installments";
import { uid, today, formatAmount, formatDateShort, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { NumberInput } from "@/components/ui/NumberInput";
import { showUndo } from "@/components/ui/UndoToast";
import { Plus, Trash2, X, CalendarClock, CheckCircle2, AlertTriangle, Bell, Pencil, Ban, RotateCcw } from "lucide-react";

// «الأقساط» — قسمٌ داخل الخطة المالية فقط (لا بطاقة دائمة في واجهة اليوم).
// المبدأ المعروض للمالك: الخطة اتفاقٌ مكتوب، والقسط لا يُحتسب مدفوعاً إلا بتسجيل
// دفعةٍ حقيقية. لا رقم هنا يُخلق من تلقاء نفسه، ولا مصروفَ وهميّ لفرق سدادٍ مبكر.
export function InstallmentPlans() {
  const { installmentPlans, transactions, categories, cancelInstallmentPlan, reopenInstallmentPlan,
    deleteInstallmentPlan, addInstallmentPlan } = useAppStore();
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarClock size={16} className="text-finance shrink-0" />
          <span className="text-sm font-semibold text-gray-700">الأقساط</span>
          {overview.activeCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-finance/10 text-finance shrink-0">
              متبقٍّ {formatAmount(overview.remainingTotal)} ر.س
            </span>
          )}
          {overview.overdueCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white shrink-0">
              {formatAmount(overview.overdueCount)} متأخّر
            </span>
          )}
        </div>
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

      {plans.length === 0 && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="w-full py-5 rounded-xl border-2 border-dashed border-finance/30 text-finance text-sm font-medium hover:bg-finance/5 press"
        >
          🧾 سجّل خطة تقسيط — الجهة، الإجمالي، القسط وعدده
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
  const { transactions, recordInstallmentPayment, settleInstallmentPlan, linkInstallmentReminder } = useAppStore();
  const todayStr = today();
  const s = planSummary(plan, transactions, todayStr);
  const [settleAmount, setSettleAmount] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closed = plan.status !== "active";

  return (
    <div
      className={cn(
        "rounded-2xl border p-3 space-y-2.5",
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
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-bold tabular-nums text-gray-800 dark:text-gray-100">
              {formatAmount(s.paid)} / {formatAmount(plan.totalPrice)}
            </div>
            <div className="text-[10px] text-gray-400">{s.pct}٪</div>
          </div>
        </div>

        {/* شريط الإنجاز — نسبة المدفوع من الإجمالي */}
        <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden mt-2">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${s.pct}%`, backgroundColor: s.overdue > 0 ? "#e05555" : "#3d9640" }}
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

      {/* تحذيرٌ غير معطِّل: بنود الخطة لا تطابق السعر الإجمالي (المرجع الوحيد) */}
      {s.mismatch && (
        <div className="flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-2 py-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>
            بنود الخطة تجمع {formatAmount(s.mismatch.expected)} ر.س والإجمالي {formatAmount(plan.totalPrice)} ر.س
            {" "}(فرق {formatAmount(Math.abs(s.mismatch.diff))}). الإجمالي هو المرجع — راجِع الأرقام إن شئت.
          </span>
        </div>
      )}

      {open && (
        <div className="space-y-2.5 pt-1 border-t border-gray-100 dark:border-white/10">
          {/* الدفعة الأولى */}
          {plan.downPayment > 0 && (
            <div className="flex items-center justify-between bg-gray-50 dark:bg-white/5 rounded-lg px-2.5 py-2">
              <span className="text-[11px] text-gray-500">
                الدفعة الأولى · {formatAmount(plan.downPayment)} ر.س
              </span>
              {s.downPaid ? (
                <span className="text-[11px] font-bold text-finance flex items-center gap-1">
                  <CheckCircle2 size={12} /> سُجّلت
                </span>
              ) : (
                <button
                  onClick={() => recordInstallmentPayment(plan.id, { role: "down", amount: plan.downPayment })}
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
                    amount: row.amount,
                    installmentNo: row.no,
                    date: row.due <= todayStr ? row.due : todayStr,
                  })
                }
              />
            ))}
          </div>

          {/* الرسوم — توضيحية فقط */}
          {(plan.fees ?? 0) > 0 && (
            <p className="text-[10px] text-gray-400">
              رسوم مذكورة: {formatAmount(plan.fees!)} ر.س (توضيحية — لا تُضاف على الإجمالي)
            </p>
          )}
          {(plan.cashPrice ?? 0) > 0 && (
            <p className="text-[10px] text-gray-400">
              السعر النقدي {formatAmount(plan.cashPrice!)} ر.س · فرق التقسيط{" "}
              {formatAmount(Math.max(0, plan.totalPrice - plan.cashPrice!))} ر.س
            </p>
          )}
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
      </span>
      {row.paid ? (
        <span className="shrink-0 text-finance flex items-center gap-1">
          <CheckCircle2 size={12} /> مدفوع
        </span>
      ) : row.closedEarly ? (
        <span className="shrink-0 text-gray-400">—</span>
      ) : closed ? (
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
// نموذج الخطة (إضافة/تعديل). التعديل يعيد حساب الجدول تلقائياً — الجدول مشتقٌّ
// من البنود ولا يُحفظ، فلا نسخةَ جدولٍ قديمة تتخلّف عن الأرقام.
function PlanForm({ initial, onDone }: { initial?: InstallmentPlan; onDone: () => void }) {
  const { categories, addInstallmentPlan, updateInstallmentPlan } = useAppStore();
  const mains = categories.filter((c) => !c.parentId);
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [cashPrice, setCashPrice] = useState(initial?.cashPrice ? String(initial.cashPrice) : "");
  const [totalPrice, setTotalPrice] = useState(initial?.totalPrice ? String(initial.totalPrice) : "");
  const [downPayment, setDownPayment] = useState(initial?.downPayment ? String(initial.downPayment) : "");
  const [installmentAmount, setInstallmentAmount] = useState(initial?.installmentAmount ? String(initial.installmentAmount) : "");
  const [count, setCount] = useState(initial?.count ? String(initial.count) : "");
  const [firstDueDate, setFirstDueDate] = useState(initial?.firstDueDate ?? today());
  const [fees, setFees] = useState(initial?.fees ? String(initial.fees) : "");
  const [finalPayment, setFinalPayment] = useState(initial?.finalPayment ? String(initial.finalPayment) : "");
  const [category, setCategory] = useState(initial?.category ?? mains[0]?.id ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [errors, setErrors] = useState<string[]>([]);

  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const draft = {
    provider, name,
    totalPrice: num(totalPrice),
    downPayment: num(downPayment),
    installmentAmount: num(installmentAmount),
    count: Math.floor(num(count)),
    firstDueDate,
  };
  // معاينةٌ حيّة لعدم التطابق قبل الحفظ (تحذيرٌ لا يمنع).
  const preview: InstallmentPlan = {
    id: initial?.id ?? "preview",
    ...draft,
    fees: num(fees) || undefined,
    finalPayment: num(finalPayment) || undefined,
    status: initial?.status ?? "active",
    createdAt: initial?.createdAt ?? today(),
  };
  const expected = draft.count >= 1 && draft.installmentAmount > 0 ? planExpectedTotal(preview) : 0;
  const mismatch = expected > 0 && draft.totalPrice > 0 ? Math.round((expected - draft.totalPrice) * 100) / 100 : 0;

  function handleSave() {
    const errs = validatePlanDraft(draft);
    if (errs.length) { setErrors(errs); return; }
    const payload = {
      provider: provider.trim(),
      name: name.trim() || provider.trim(),
      cashPrice: num(cashPrice) || undefined,
      totalPrice: draft.totalPrice,
      downPayment: draft.downPayment,
      installmentAmount: draft.installmentAmount,
      count: draft.count,
      firstDueDate,
      fees: num(fees) || undefined,
      finalPayment: num(finalPayment) || undefined,
      category: category || undefined,
      note: note.trim() || undefined,
    };
    if (initial) {
      updateInstallmentPlan(initial.id, payload);
    } else {
      addInstallmentPlan({ ...payload, id: uid(), status: "active", createdAt: today() });
    }
    onDone();
  }

  const field = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-finance/40";

  return (
    <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 space-y-2.5 animate-fade-up">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">الجهة</label>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="تمارا، بنك، معرض..." className={field} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">اسم الالتزام</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="جوّال، أثاث..." className={field} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">السعر النقدي (اختياري)</label>
          <NumberInput value={cashPrice} onChange={setCashPrice} placeholder="للمقارنة فقط" inputMode="decimal" className={field} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">السعر الإجمالي</label>
          <NumberInput value={totalPrice} onChange={setTotalPrice} placeholder="المرجع الوحيد" inputMode="decimal" className={field} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">الدفعة الأولى</label>
          <NumberInput value={downPayment} onChange={setDownPayment} placeholder="0" inputMode="decimal" className={field} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">قيمة القسط</label>
          <NumberInput value={installmentAmount} onChange={setInstallmentAmount} placeholder="شهرياً" inputMode="decimal" className={field} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">عدد الأقساط</label>
          <NumberInput value={count} onChange={setCount} placeholder="مثلاً 12" inputMode="numeric" min={1} className={field} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">أول موعد استحقاق</label>
          <input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} className={field} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">الرسوم (توضيحية)</label>
          <NumberInput value={fees} onChange={setFees} placeholder="لا تُضاف على الإجمالي" inputMode="decimal" className={field} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">دفعة أخيرة كبيرة (اختياري)</label>
          <NumberInput value={finalPayment} onChange={setFinalPayment} placeholder="تستبدل آخر قسط" inputMode="decimal" className={field} />
        </div>
      </div>

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

      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" className={field} />

      {mismatch !== 0 && (
        <div className="flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-2 py-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>
            بنود الخطة تجمع {formatAmount(expected)} ر.س والإجمالي {formatAmount(draft.totalPrice)} ر.س
            {" "}(فرق {formatAmount(Math.abs(mismatch))}) — تحذيرٌ فقط، يمكنك الحفظ.
          </span>
        </div>
      )}

      {errors.length > 0 && (
        <ul className="text-[11px] text-red-500 space-y-0.5">
          {errors.map((e) => <li key={e}>• {e}</li>)}
        </ul>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} className="flex-1 bg-finance hover:bg-finance/90">
          {initial ? "حفظ التعديل" : "إضافة الخطة"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDone} className="gap-1">
          <X size={14} /> إلغاء
        </Button>
      </div>
    </div>
  );
}
