"use client";
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { spendWindow } from "@/lib/budgetCycle";
import type { Transaction, ReserveSplit } from "@/lib/types";
import { uid, today, formatAmount, getSubCategories, reserveBalance, cn } from "@/lib/utils";
import { budgetWarningFor } from "@/lib/budgetStatus";
import { planSummary, isPlanOpen, suggestPlanLink, suggestPlanByAmount, describeDueIn, daysBetween, INSTALLMENT_ROLE_LABEL, MAX_INSTALLMENT_COUNT, isValidDateKey } from "@/lib/installments";
import { suggestCategory } from "@/lib/bankParser";
import { showToast } from "@/components/ui/UndoToast";
import { Button } from "@/components/ui/Button";
import { NumberInput } from "@/components/ui/NumberInput";
import { PiggyBank, CalendarClock, Link2Off, ShieldOff } from "lucide-react";

interface TransactionFormProps {
  onClose: () => void;
  initial?: Transaction;
  // قيمٌ ابتدائية لمصروفٍ **جديد** (لا تعديل): يستعملها «الرفّ» حين ينضج شيءٌ
  // فيُشترى — فيصل المبلغُ والاسمُ جاهزين ويبقى **اختيارُ التصنيف بيد المالك**.
  // لا تخلطها بـ`initial`: تلك تعني تعديلَ معاملةٍ قائمة.
  prefill?: { amount?: number; note?: string };
  // يُنادى بالمعاملة بعد حفظها — ليربطها مصدرُها بمعرّفها (عنصرُ الرفّ بمعاملته).
  onSaved?: (tx: Transaction) => void;
}

export function TransactionForm({ onClose, initial, prefill, onSaved }: TransactionFormProps) {
  const {
    categories, reserves, transactions, budgets, monthlyIncome, merchantRules, installmentPlans,
    addTransaction, updateTransaction, addCategory, rememberMerchant,
    linkTransactionToPlan, unlinkTransactionFromPlan, convertTransactionToPlan,
  } = useAppStore();
  const mains = categories.filter((c) => !c.parentId);

  // If editing a transaction whose category is a sub, pre-select its parent
  // as the main and the sub itself.
  const initialCat = categories.find((c) => c.id === initial?.category);
  const [mainCat, setMainCat] = useState<string>(
    initialCat?.parentId ?? initialCat?.id ?? mains[0]?.id ?? ""
  );
  const [subCat, setSubCat] = useState<string>(initialCat?.parentId ? initialCat.id : "");
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? prefill?.amount?.toString() ?? "");
  const [note, setNote] = useState(initial?.note ?? prefill?.note ?? "");
  const [date, setDate] = useState(initial?.date ?? today());
  const [splits, setSplits] = useState<ReserveSplit[]>(initial?.reserveSplits ?? []);
  const [addingSub, setAddingSub] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  // Once the user picks a category by hand we stop auto-suggesting from the note.
  const [touchedCat, setTouchedCat] = useState(false);
  // شبكة التصنيفات (مطويّة حتى يُكتب التاجر — ومفتوحةٌ إن جاء الاسم جاهزاً)
  const [showCats, setShowCats] = useState(!!initial || !!prefill);
  const [showDetails, setShowDetails] = useState(false); // التاريخ ومصدر الصرف
  // ربطُ هذا المصروف بخطة أقساط (الطريق اليوميّ: سجّل كالعادة ثمّ اربط بضغطة).
  const [linkPlan, setLinkPlan] = useState<string | null>(initial?.planId ?? null);
  // هل اختار المالك الخطة بيده؟ عندها نكفّ عن الاقتراح التلقائي (بما فيه إلغاؤه).
  const [touchedPlan, setTouchedPlan] = useState(false);
  const [showSplit, setShowSplit] = useState(false); // نموذج «قسّط هذا المصروف»
  // «تجاهله من الميزانيات»: مصروفٌ حقيقيّ لكنّه استثناءٌ لا يتكرّر (رسوم اختبار…)
  // فلا يستهلك اليومية ولا السقوف — ويبقى في السجل والإحصائيات كما هو.
  const [offBudget, setOffBudget] = useState(!!initial?.offBudget);

  // Auto-classify from the note while adding a new expense: learned merchant
  // rules first, then keyword guess. Silently pre-selects the section/sub so
  // it's تلقائي — the user can still tap another to override (which locks it).
  useEffect(() => {
    if (initial || touchedCat) return;
    const n = note.trim();
    if (!n) return;
    const id = suggestCategory(n, categories, merchantRules);
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    if (cat.parentId) {
      setMainCat(cat.parentId);
      setSubCat(cat.id);
    } else {
      setMainCat(cat.id);
      setSubCat("");
    }
  }, [note, initial, touchedCat, categories, merchantRules]);

  // **الربط التلقائي بالقسط**: مبلغٌ يطابق قسطاً مستحقّاً في موعده → تُختار خطته
  // من نفسها، فيسجّل المالك مصروفه كالعادة ويتقدّم جدول الأقساط بلا أن يبحث عن
  // شيء. لا يقع الاقتراح إلا حين لا يحتمل غير خطةٍ واحدة (suggestPlanLink)، ويبقى
  // مرئياً في بطاقة الربط أدناه فيستطيع إلغاءه.
  useEffect(() => {
    if (initial || touchedPlan) return;
    const hit = suggestPlanLink(
      { amount: parseFloat(amount) || 0, date },
      installmentPlans ?? [],
      transactions,
      today()
    );
    setLinkPlan(hit ? hit.plan.id : null);
  }, [amount, date, initial, touchedPlan, installmentPlans, transactions]);

  const selectedMain = categories.find((c) => c.id === mainCat);
  const subs = getSubCategories(categories, mainCat);
  const parsedAmount = parseFloat(amount) || 0;
  const reservedPct = Math.min(100, splits.reduce((s, sp) => s + sp.pct, 0));
  const dailyPct = 100 - reservedPct;

  const balances = useMemo(
    () => new Map(reserves.map((f) => [f.id, reserveBalance(f, transactions)])),
    [reserves, transactions]
  );

  // آخر 5 متاجر/ملاحظات مميّزة (اختصارات سريعة) وآخر مصروف (للتكرار).
  const sortedTx = useMemo(() => [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [transactions]);
  const recentMerchants = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of sortedTx) {
      const n = t.note?.trim();
      if (!n || seen.has(n)) continue;
      seen.add(n); out.push(n);
      if (out.length >= 5) break;
    }
    return out;
  }, [sortedTx]);
  const lastTx = sortedTx[0];

  // الخطط المفتوحة (نشطة ولم تكتمل) مع قسطها القادم — للربط بضغطة. نرتّبها
  // فيتقدّم ما يطابق المبلغ المكتوب (وصولُ رسالة البنك ثمّ تسجيلُها هو الحالة
  // اليومية، فالمطابقة تجعل الربط ضغطةً واحدة بلا بحث).
  const openPlans = useMemo(() => {
    const t = today();
    return (installmentPlans ?? [])
      .filter((p) => isPlanOpen(p, transactions, t))
      .map((p) => ({ plan: p, next: planSummary(p, transactions, t).next }))
      .sort((a, b) => {
        const am = a.next && Math.abs(a.next.amount - parsedAmount) < 0.01 ? 0 : 1;
        const bm = b.next && Math.abs(b.next.amount - parsedAmount) < 0.01 ? 0 : 1;
        return am - bm || (a.next?.due ?? "").localeCompare(b.next?.due ?? "");
      });
  }, [installmentPlans, transactions, parsedAmount]);
  const linkedPlan = (installmentPlans ?? []).find((p) => p.id === linkPlan);

  // **«يبدو أنه قسط»**: المبلغ يطابق قسطاً مستحقّاً لكن تاريخه بعيدٌ عن موعده،
  // فالربط التلقائي لا يقع (وهو محقّ: مطابقةُ رقمٍ ليست يقيناً). بدل أن يمرّ
  // مصروفاً عادياً ويتخلّف جدول الخطة، نسأل سؤالاً واحداً ونربط بضغطته.
  // لا يظهر بعد اختيارٍ يدويّ، ولا حين وقع الربط التلقائي أصلاً.
  const amountHint = useMemo(() => {
    if (initial || touchedPlan || linkPlan) return null;
    const t = today();
    const tx = { amount: parsedAmount, date };
    if (suggestPlanLink(tx, installmentPlans ?? [], transactions, t)) return null;
    return suggestPlanByAmount(tx, installmentPlans ?? [], transactions, t);
  }, [initial, touchedPlan, linkPlan, parsedAmount, date, installmentPlans, transactions]);

  function pickCategoryFor(catId: string) {
    const cat = categories.find((c) => c.id === catId);
    if (cat?.parentId) { setMainCat(cat.parentId); setSubCat(cat.id); }
    else { setMainCat(catId); setSubCat(""); }
  }
  // «كرّر آخر مصروف» — يملأ الحقول دون حفظٍ تلقائي.
  function repeatLast() {
    if (!lastTx) return;
    setAmount(String(lastTx.amount));
    setNote(lastTx.note ?? "");
    pickCategoryFor(lastTx.category);
    setTouchedCat(true);
    setSplits(lastTx.reserveSplits ?? []);
  }

  // اقتراح التصنيف من التاجر (يظهر بعد كتابته وقبل اختيارٍ يدوي).
  const suggestionLabel = (() => {
    if (initial || touchedCat || !note.trim() || !selectedMain) return null;
    const subLabel = subCat ? categories.find((c) => c.id === subCat)?.label : null;
    return subLabel ? `${selectedMain.label} ← ${subLabel}` : selectedMain.label;
  })();

  function setSplitPct(fundId: string, pct: number) {
    setSplits((prev) => {
      const others = prev.filter((s) => s.fundId !== fundId);
      const othersPct = others.reduce((s, sp) => s + sp.pct, 0);
      const clamped = Math.max(0, Math.min(pct, 100 - othersPct));
      return clamped === 0 ? others : [...others, { fundId, pct: clamped }];
    });
  }

  // Create a sub-category inline (under the selected main) and pick it
  // right away — no detour through "تصنيفاتي".
  function handleAddSub() {
    const label = newSubName.trim();
    if (!label || !selectedMain) return;
    const id = uid();
    addCategory({ id, label, icon: selectedMain.icon, color: selectedMain.color, parentId: selectedMain.id });
    setSubCat(id);
    setNewSubName("");
    setAddingSub(false);
  }

  function handleSave() {
    if (!parsedAmount || parsedAmount <= 0) return;
    const tx: Transaction = {
      id: initial?.id ?? uid(),
      date,
      amount: parsedAmount,
      category: subCat || mainCat,
      note,
      reserveSplits: splits.length ? splits : undefined,
      offBudget: offBudget || undefined,
    };
    if (initial) {
      updateTransaction(initial.id, tx);
    } else {
      addTransaction(tx);
    }
    // ربطُ الدفعة بخطتها (أو فكُّه) بعد الحفظ — المبلغ يُحتسب مرّةً واحدة: مصروفاً
    // عادياً كما هو، والخطة تقرأه فتتقدّم. «الأصل المؤجّل» لا يُربط من هنا (له
    // زرّه الخاص «قسّط هذا المصروف») فلا يُحوَّل مصروفٌ مدفوعٌ إلى مؤجّلٍ بالغلط.
    if (linkPlan && linkPlan !== initial?.planId) {
      const s = planSummary(
        (installmentPlans ?? []).find((p) => p.id === linkPlan)!,
        useAppStore.getState().transactions,
        today()
      );
      const row = s.next;
      linkTransactionToPlan(tx.id, {
        planId: linkPlan,
        role: row?.isFinal ? "final" : "installment",
        installmentNo: row?.no,
      });
    } else if (!linkPlan && initial?.planId) {
      unlinkTransactionFromPlan(tx.id);
    }
    // Learn this merchant → category so the next one is auto-classified.
    if (note.trim()) rememberMerchant(note, tx.category);
    // Live budget alert: warn the moment a category crosses 80% / its cap.
    const st = useAppStore.getState();
    const w = budgetWarningFor(
      tx.category, budgets, st.transactions, categories, monthlyIncome,
      spendWindow(st.budgetWindow, st.lastSalaryConfirm, st.salaryDay ?? 27, today())
    );
    if (w) {
      showToast(
        w.over ? `📛 تجاوزت سقف «${w.label}»` : `⚠️ وصلت ${w.pct}% من سقف «${w.label}»`,
        "warning"
      );
    }
    onSaved?.(tx);
    onClose();
  }

  return (
    <div className="space-y-4">
      {/* دفعةُ خطة أقساط: نوضّح الربط قبل التعديل — تغيير المبلغ يغيّر «المدفوع»
          في الخطة (مشتقٌّ من المعاملات)، ولا يُفكّ الربط بالحفظ. */}
      {initial?.planId && (
        <p className="text-[11px] text-gray-500 bg-gray-50 dark:bg-white/5 rounded-xl px-3 py-2 leading-relaxed">
          🧾 هذه دفعةٌ مرتبطة بخطة أقساط — تعديل مبلغها يُعيد حساب المدفوع والمتبقّي في الخطة.
        </p>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">المبلغ (ريال)</label>
        <NumberInput
          value={amount}
          onChange={setAmount}
          placeholder="0.00"
          // Land the cursor on the amount when the form opens — the task is to
          // type a number, not to hunt for the field (or focus the close button
          // the modal would otherwise focus first). Only when adding, so an edit
          // doesn't yank focus/scroll on mount.
          autoFocus={!initial}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-finance/40"
          inputMode="decimal"
        />
      </div>

      {/* المتجر/الملاحظة — ثانياً، ليخدم التصنيف التلقائي */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">المتجر أو الملاحظة</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="مثل: قهوة، بنزين، بقالة…"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
        />
        {/* اختصارات: آخر المتاجر + كرّر آخر مصروف */}
        {!initial && (recentMerchants.length > 0 || lastTx) && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {lastTx && (
              <button onClick={repeatLast} className="text-[11px] font-semibold text-finance bg-finance/10 hover:bg-finance/20 rounded-full px-2.5 py-1 press">
                ↻ كرّر آخر مصروف
              </button>
            )}
            {recentMerchants.map((m) => (
              <button key={m} onClick={() => { setNote(m); setTouchedCat(false); }} className="text-[11px] text-gray-500 bg-gray-100 dark:bg-[#382c1d] hover:bg-gray-200 rounded-full px-2.5 py-1 press truncate max-w-[8rem]">
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* اقتراح التصنيف بعد كتابة التاجر — قبولٌ أو تغيير */}
      {suggestionLabel && !showCats && (
        <div className="flex items-center gap-2 bg-finance/5 border border-finance/20 rounded-xl px-3 py-2.5">
          <span className="text-lg">{selectedMain?.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-gray-400">نقترح تصنيفه</div>
            <div className="text-sm font-bold text-finance truncate">{suggestionLabel}</div>
          </div>
          <button onClick={() => setTouchedCat(true)} className="text-[11px] font-bold text-white bg-finance rounded-lg px-2.5 py-1.5 press">أقبل</button>
          <button onClick={() => setShowCats(true)} className="text-[11px] font-semibold text-gray-500 press">غيّر</button>
        </div>
      )}

      {/* شبكة التصنيفات — متاحة دائماً، لكن لا تُجبر قبل كتابة التاجر */}
      {(showCats || !suggestionLabel) && (
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-gray-500">القسم الرئيسي</label>
          {suggestionLabel && (
            <button onClick={() => { setShowCats(false); setTouchedCat(false); }} className="text-[11px] text-gray-400 press">استخدم الاقتراح</button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {mains.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setMainCat(cat.id); setSubCat(""); setAddingSub(false); setTouchedCat(true); }}
              className={`flex flex-col items-center gap-1 py-2 px-2 rounded-xl border text-xs transition-colors ${
                mainCat === cat.id
                  ? "border-finance bg-finance/5 text-finance font-semibold"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              <span className="text-xl">{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {selectedMain?.allowSubs && (
          <div className="mt-2 bg-gray-50 rounded-xl p-2 animate-fade-up">
            <div className="text-[10px] font-medium text-gray-400 mb-1.5">القسم الفرعي (اختياري)</div>
            <div className="flex gap-1.5 flex-wrap items-center">
              <button
                onClick={() => { setSubCat(""); setTouchedCat(true); }}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  !subCat ? "border-finance bg-finance text-white font-semibold" : "border-gray-200 text-gray-500 bg-white"
                }`}
              >
                عام
              </button>
              {subs.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => { setSubCat(sub.id); setTouchedCat(true); }}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    subCat === sub.id ? "border-finance bg-finance text-white font-semibold" : "border-gray-200 text-gray-500 bg-white"
                  }`}
                >
                  {sub.icon} {sub.label}
                </button>
              ))}
              {!addingSub && (
                <button
                  onClick={() => setAddingSub(true)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-dashed border-finance/50 text-finance bg-white font-semibold"
                >
                  + فرعي جديد
                </button>
              )}
            </div>
            {addingSub && (
              <div className="flex gap-1.5 mt-2 animate-fade-up">
                <input
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  placeholder="اكتب اسم القسم الفرعي... (بنزين، فواتير)"
                  className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
                  onKeyDown={(e) => e.key === "Enter" && handleAddSub()}
                  autoFocus
                />
                <button
                  onClick={handleAddSub}
                  className="text-[11px] font-bold text-white bg-finance rounded-lg px-3 press shrink-0"
                >
                  إضافة
                </button>
                <button
                  onClick={() => { setAddingSub(false); setNewSubName(""); }}
                  className="text-[11px] text-gray-400 bg-gray-100 rounded-lg px-2 press shrink-0"
                >
                  إلغاء
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* ===== الأقساط: ربطٌ بضغطة أو «قسّط هذا المصروف» ===== */}
      {initial?.planRole === "principal" ? (
        // الأصل المؤجّل: نوضّح أنّه لا يُحتسب صرفاً، وأنّ الأقساط هي الصرف.
        <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-3 text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed space-y-1.5">
          <div className="font-bold">🧾 هذا «الأصل المؤجّل» لخطة أقساط</div>
          <p>الشراء لم يخرج من حسابك (مؤجّل)، فلا يُحتسب في الميزانية ولا السقوف — الأقساط هي الصرف الفعليّ.</p>
          <button
            type="button"
            onClick={() => { unlinkTransactionFromPlan(initial.id); onClose(); }}
            className="flex items-center gap-1 font-bold text-gray-500 hover:text-red-500 press"
          >
            <Link2Off size={12} /> فُكّ الربط واحسبه مصروفاً عادياً
          </button>
        </div>
      ) : openPlans.length > 0 ? (
        <div className="rounded-xl bg-finance/5 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-finance">
            <CalendarClock size={14} /> دفعة قسط؟
          </div>

          {/* تعرّفٌ بالمبلغ حين يبعد التاريخ عن الموعد — سؤالٌ لا حكم. */}
          {amountHint && (
            <div className="rounded-lg border border-finance/30 bg-white dark:bg-white/5 px-2.5 py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0 text-[11px] leading-relaxed">
                <div className="font-bold text-gray-800 dark:text-gray-100 truncate">
                  يبدو أنه القسط {formatAmount(amountHint.row.no)} من «{amountHint.plan.name || amountHint.plan.provider}»
                </div>
                <div className="text-gray-500">
                  مستحقٌّ {describeDueIn(daysBetween(today(), amountHint.row.due))} · بنفس المبلغ
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLinkPlan(amountHint.plan.id);
                  setTouchedPlan(true);
                  if (amountHint.plan.category) { pickCategoryFor(amountHint.plan.category); setTouchedCat(true); }
                }}
                className="shrink-0 text-[11px] font-bold text-white bg-finance rounded-lg px-2.5 py-1.5 press"
              >
                نعم، اربطه
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => { setLinkPlan(null); setTouchedPlan(true); }}
              className={cn(
                "text-[11px] font-semibold rounded-lg px-2.5 py-1.5 border transition-colors",
                !linkPlan ? "bg-finance text-white border-finance" : "bg-white text-gray-500 border-gray-200"
              )}
            >
              لا — مصروف عادي
            </button>
            {openPlans.map(({ plan, next }) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => {
                  setLinkPlan(plan.id);
                  setTouchedPlan(true);
                  // تعبئةٌ لطيفة: مبلغ القسط وتصنيف الخطة إن كان الحقل فارغاً.
                  if (next && !parsedAmount) setAmount(String(next.amount));
                  if (plan.category) { pickCategoryFor(plan.category); setTouchedCat(true); }
                }}
                className={cn(
                  "text-[11px] font-semibold rounded-lg px-2.5 py-1.5 border transition-colors",
                  linkPlan === plan.id ? "bg-finance text-white border-finance" : "bg-white text-gray-500 border-gray-200"
                )}
              >
                {plan.name || plan.provider}
                {next ? ` · ${formatAmount(next.amount)}` : ""}
              </button>
            ))}
          </div>
          {linkedPlan && (
            <p className="text-[10px] text-gray-500">
              {!touchedPlan && "رُبطت تلقائياً — "}
              ستُسجَّل كـ«{INSTALLMENT_ROLE_LABEL.installment}» في خطة «{linkedPlan.name || linkedPlan.provider}» — مصروفٌ واحدٌ لا يُحتسب مرّتين.
            </p>
          )}
        </div>
      ) : null}

      {/* «قسّط هذا المصروف»: الشراء كان مؤجّلاً لا كاش */}
      {initial && !initial.planId && (
        showSplit ? (
          <SplitToPlanForm
            amount={initial.amount}
            defaultProvider={initial.note}
            onCancel={() => setShowSplit(false)}
            onSubmit={(draft) => { convertTransactionToPlan(initial.id, draft); setShowSplit(false); onClose(); }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowSplit(true)}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-gray-500 bg-gray-100 dark:bg-white/10 rounded-xl py-2 press"
          >
            <CalendarClock size={13} /> شريته بالتقسيط (مؤجّل)؟ قسّطه
          </button>
        )
      )}

      {/* «تجاهله من الميزانيات» — للمصروف الاستثنائيّ الذي لا يتكرّر (رسوم اختبار،
          عمرة، حادث): يبقى مصروفاً حقيقياً في السجل والإحصائيات ومجموع الشهر،
          لكنّه لا يستهلك الميزانية اليومية ولا سقوف الأقسام فتبقى الميزانية
          مقياساً لصرفك المعتاد. لا يظهر للأصل المؤجّل — ذاك لا يُحتسب أصلاً. */}
      {initial?.planRole !== "principal" && (
        <button
          type="button"
          onClick={() => setOffBudget((v) => !v)}
          aria-pressed={offBudget}
          className={cn(
            "w-full flex items-center gap-2 rounded-xl border px-3 py-2.5 text-right press transition-colors",
            offBudget
              ? "border-finance bg-finance/5"
              : "border-gray-200 dark:border-white/10 bg-white dark:bg-white/5"
          )}
        >
          <span className={cn("shrink-0", offBudget ? "text-finance" : "text-gray-400")}>
            <ShieldOff size={16} />
          </span>
          <span className="flex-1 min-w-0">
            <span className={cn("block text-xs font-bold", offBudget ? "text-finance" : "text-gray-600 dark:text-gray-300")}>
              تجاهله من الميزانيات
            </span>
            <span className="block text-[10px] text-gray-400 leading-relaxed">
              {offBudget
                ? "مصروفٌ استثنائي — يظهر في السجل والإحصائيات ولا يخصم من اليومية ولا السقوف"
                : "لمصروفٍ لا يتكرّر (رسوم اختبار، سفر طارئ) حتى لا يخرّب حساب الميزانية"}
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors",
              offBudget ? "bg-finance" : "bg-gray-200 dark:bg-white/20"
            )}
          >
            <span className={cn("block w-4 h-4 rounded-full bg-white transition-transform", offBudget && "-translate-x-4")} />
          </span>
        </button>
      )}

      {/* تفاصيل: التاريخ ومصدر الصرف — مطويّة للمصروف العادي */}
      <button type="button" onClick={() => setShowDetails((v) => !v)} className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 press pt-1">
        <span>تفاصيل (التاريخ ومصدر الصرف)</span>
        <span className="text-gray-400">{showDetails ? "▲" : "▼"}</span>
      </button>

      {showDetails && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">التاريخ</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
          />
        </div>
      )}

      {showDetails && reserves.length > 0 && (
        <div className="bg-finance/5 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-finance">
              <PiggyBank size={14} /> مصدر الصرف
            </span>
            <span className={cn("text-[11px] font-bold", dailyPct === 100 ? "text-gray-400" : "text-finance")}>
              {dailyPct}% يومية · {reservedPct}% احتياطي
            </span>
          </div>

          {/* Visual split bar */}
          <div className="h-2 rounded-full overflow-hidden flex bg-gray-100">
            <div className="h-full bg-finance transition-all duration-300" style={{ width: `${dailyPct}%` }} />
            {splits.map((sp) => {
              const fund = reserves.find((f) => f.id === sp.fundId);
              return (
                <div
                  key={sp.fundId}
                  className="h-full transition-all duration-300"
                  style={{ width: `${sp.pct}%`, backgroundColor: fund?.color ?? "#1f7a6c" }}
                />
              );
            })}
          </div>

          <div className="space-y-1.5">
            {reserves.map((fund) => {
              const sp = splits.find((s) => s.fundId === fund.id);
              const pct = sp?.pct ?? 0;
              const share = (parsedAmount * pct) / 100;
              const bal = balances.get(fund.id) ?? 0;
              return (
                <div key={fund.id} className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ backgroundColor: fund.color + "1a" }}>
                    {fund.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-700 truncate">{fund.name}</div>
                    <div className="text-[9px] text-gray-400">
                      متاح {formatAmount(bal)} ر.س{pct > 0 && parsedAmount > 0 ? ` — يتحمّل ${formatAmount(share)} ر.س` : ""}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {[0, 25, 50, 100].map((p) => (
                      <button
                        key={p}
                        onClick={() => setSplitPct(fund.id, p)}
                        className={cn(
                          "text-[10px] font-bold rounded-lg px-1.5 py-1 border transition-colors",
                          pct === p
                            ? "bg-finance text-white border-finance"
                            : "bg-white text-gray-500 border-gray-200 hover:border-finance/40"
                        )}
                      >
                        {p === 0 ? "٠" : `${p}%`}
                      </button>
                    ))}
                    <NumberInput
                      value={pct || ""}
                      onChange={(v) => setSplitPct(fund.id, parseInt(v) || 0)}
                      placeholder="%"
                      inputMode="numeric"
                      className="w-11 text-[10px] text-center border border-gray-200 rounded-lg py-1 focus:outline-none focus:ring-1 focus:ring-finance/40"
                      aria-label={`نسبة ${fund.name}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 leading-relaxed">
            مثال: هدية ٥٠٪ من اليومية و٥٠٪ من احتياطي الهدايا — كل جزء يتخصم من مصدره.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={handleSave} className="flex-1 bg-finance hover:bg-finance/90">
          {initial ? "حفظ" : "إضافة"}
        </Button>
        <Button variant="secondary" onClick={onClose}>إلغاء</Button>
      </div>
    </div>
  );
}

// «قسّط هذا المصروف» — أصغرُ نموذجٍ ممكن: قيمة القسط وعددها وأول موعد. الإجمالي
// **هو مبلغ المعاملة نفسه** (لا يُكتب مرّتين)، والقسط يُشتقّ تلقائياً من القسمة
// فيكفي تعديلُه إن خالف اتفاق الجهة. لا حقل رسومٍ ولا دفعةٍ أخيرة هنا — تُضاف
// لاحقاً من قسم «الأقساط» عند الحاجة، فيبقى هذا الطريق ثلاث خانات لا أكثر.
function SplitToPlanForm({
  amount, defaultProvider, onCancel, onSubmit,
}: {
  amount: number;
  defaultProvider: string;
  onCancel: () => void;
  onSubmit: (d: { provider: string; name?: string; installmentAmount: number; count: number; firstDueDate: string }) => void;
}) {
  const [provider, setProvider] = useState(defaultProvider.trim());
  const [count, setCount] = useState("4");
  const [firstDue, setFirstDue] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1); // الافتراض الطبيعيّ: أول قسطٍ بعد شهر
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const n = Math.max(1, parseInt(count) || 1);
  const derived = Math.round((amount / n) * 100) / 100; // قسطٌ مشتقّ من الإجمالي
  const [installment, setInstallment] = useState("");
  const value = parseFloat(installment) || derived;
  const field = "w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-finance/40";
  // نفس حرّاس النموذج الرئيسي: عددٌ داخل الحدّ وتاريخٌ صالح — فطريقان لإنشاء خطةٍ
  // لا يقبل أحدهما ما يرفضه الآخر.
  const error =
    n > MAX_INSTALLMENT_COUNT ? `عدد الأقساط أكبر من المعقول (الحدّ ${MAX_INSTALLMENT_COUNT})`
    : !isValidDateKey(firstDue) ? "أول موعد استحقاق غير صالح"
    : !(value > 0) ? "قيمة القسط مطلوبة"
    : null;

  return (
    <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-3 space-y-2.5">
      <div className="text-xs font-semibold text-gray-600">
        تقسيط {formatAmount(amount)} ر.س — سيُعتبر الشراء مؤجّلاً، والأقساط هي الصرف.
      </div>
      <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="الجهة (تمارا، تابي...)" className={field} />
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">عدد الأقساط</label>
          <NumberInput value={count} onChange={setCount} inputMode="numeric" min={1} max={MAX_INSTALLMENT_COUNT} className={field} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">قيمة القسط</label>
          <NumberInput value={installment} onChange={setInstallment} placeholder={formatAmount(derived)} inputMode="decimal" className={field} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">أول موعد</label>
          <input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} className={field} />
        </div>
      </div>
      <p className="text-[10px] text-gray-400">
        {n} × {formatAmount(value)} = {formatAmount(Math.round(n * value * 100) / 100)} ر.س
        {Math.abs(n * value - amount) > 0.5 ? " (يخالف الإجمالي — تحذيرٌ فقط)" : ""}
      </p>
      {error && <p className="text-[11px] text-red-500">• {error}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!!error}
          className="flex-1 bg-finance hover:bg-finance/90"
          onClick={() => {
            if (error) return;
            onSubmit({ provider: provider.trim() || "تقسيط", installmentAmount: value, count: n, firstDueDate: firstDue });
          }}
        >
          أنشئ الخطة
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>إلغاء</Button>
      </div>
    </div>
  );
}
