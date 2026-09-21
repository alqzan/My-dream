"use client";
import { useMemo, useState } from "react";
import { ClipboardCheck, ChevronLeft } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { arabicCount, cn, formatAmount, formatDate, today, uid } from "@/lib/utils";
import {
  RECONCILE_DAYS, holdings, reconcileDelta, reconcileStatus,
} from "@/lib/reconcile";
import { creditLedgerForState } from "@/lib/financeLedger";

// ===================== بطاقةُ المطابقة الربعية =====================
// «كلّ ثلاثة أشهر آخذ لي عشر دقائق: أفتح كشوفات حساباتي وأتأكّد — قد تكون فيه
// مصاريف ما رصدتها، وقد يكون كاش‌باك رجع لي ما اعترفت فيه — وأحطّ الفائض
// الحقيقي». هذه البطاقةُ هي تلك الوقفة.
//
// **والحسابُ كلُّه في `src/lib/reconcile.ts`** (نقيّ ومختبَر): هنا عرضٌ وإدخالٌ
// فقط. ولا معادلةَ واحدة في هذا الملف.
//
// **وحالتان في مكوّنٍ واحد** عمداً: حين تحين تُعرض دعوةً واضحة، وحين لا تحين
// تبقى سطراً هادئاً يقول متى كانت آخرُ مرّة — فيبقى البابُ مفتوحاً لمن أراد أن
// يطابق مبكّراً، ولا يصير في الصفحة موضعان لشيءٍ واحد.
export function ReconcileCard() {
  const reserves = useAppStore((s) => s.reserves);
  const transactions = useAppStore((s) => s.transactions);
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const reconciles = useAppStore((s) => s.reconciles);
  const settlements = useAppStore((s) => s.settlements ?? []);
  const accounts = useAppStore((s) => s.accounts ?? []);
  const settlementResolutions = useAppStore((s) => s.settlementResolutions ?? []);
  const cashbackEnabled = useAppStore((s) => s.cashbackEnabled ?? false);
  const cashbackEnvelopeId = useAppStore((s) => s.cashbackEnvelopeId);
  const recordReconcile = useAppStore((s) => s.recordReconcile);
  const resolveSettlement = useAppStore((s) => s.resolveSettlement);

  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [saved, setSaved] = useState<{ delta: number; actual: number } | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [resolutionKind, setResolutionKind] = useState<"opening_debt" | "missed_expense" | "prepaid_credit">("opening_debt");
  const [resolutionSettlementId, setResolutionSettlementId] = useState("");
  const [resolutionChargeId, setResolutionChargeId] = useState("");
  const [resolutionAmount, setResolutionAmount] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");

  const todayStr = today();
  const status = useMemo(
    () => reconcileStatus(reconciles, transactions, todayStr),
    [reconciles, transactions, todayStr]
  );
  const held = useMemo(
    () => holdings({
      reserves,
      transactions,
      dailyBudget,
      creditLedger: creditLedgerForState({ transactions, settlements, settlementResolutions, accounts }),
      cashbackEnabled,
      cashbackEnvelopeId,
    }),
    [reserves, transactions, dailyBudget, settlements, settlementResolutions, accounts, cashbackEnabled, cashbackEnvelopeId]
  );
  const ledger = useMemo(
    () => creditLedgerForState({ transactions, settlements, settlementResolutions, accounts }),
    [transactions, settlements, settlementResolutions, accounts]
  );
  const resolutionSettlement = settlements.find((item) => item.id === resolutionSettlementId || item.eventId === resolutionSettlementId);
  const resolutionCard = resolutionSettlement?.cardId ?? Object.keys(ledger.byCard).find((id) => (ledger.byCard[id]?.excessSettlement ?? 0) > 0) ?? "";
  const resolutionCharges = transactions.filter((transaction) => {
    if (!transaction.direction || transaction.direction !== "out" || !transaction.eventId) return false;
    const cardId = transaction.accountId ?? transaction.id;
    return cardId === resolutionCard && transaction.date < (resolutionSettlement?.date ?? todayStr);
  });

  // بلا مرساة (تطبيقٌ بلا معاملةٍ واحدة بعد) لا معنى لمطابقةٍ ولا لسطرٍ يذكرها.
  if (!status.anchor) return null;

  const typed = Number(raw.replace(/[^\d.-]/g, ""));
  const valid = raw.trim() !== "" && Number.isFinite(typed);
  const preview = valid ? reconcileDelta(held.expected, typed) : null;
  const first = status.last === null;

  function submit() {
    if (!valid) return;
    const rec = recordReconcile(typed);
    if (rec) {
      setSaved({ delta: rec.delta, actual: rec.actual });
      setBlockedMessage(null);
    } else if (held.blockedByExcess) {
      setBlockedMessage("لا يمكن تثبيت المطابقة قبل تفسير فائض سداد البطاقة في القسم أدناه.");
    }
    setRaw("");
  }

  function applyResolution() {
    if (!resolutionSettlementId || !resolutionCard) return;
    const amount = Number(resolutionAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    resolveSettlement({
      id: uid(),
      cardId: resolutionCard,
      kind: resolutionKind,
      amount,
      date: todayStr,
      note: resolutionNote.trim() || undefined,
      settlementIds: [resolutionSettlementId],
      appliedToEventIds: resolutionKind === "missed_expense" && resolutionChargeId ? [resolutionChargeId] : undefined,
    });
    setResolutionAmount("");
    setResolutionNote("");
    setResolutionChargeId("");
    setBlockedMessage(null);
  }

  function close() {
    setOpen(false);
    setSaved(null);
    setRaw("");
    setBlockedMessage(null);
    setResolutionAmount("");
    setResolutionNote("");
    setResolutionChargeId("");
    setResolutionSettlementId("");
  }

  return (
    <>
      {status.due ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mdr-reconcile-call w-full text-right rounded-2xl border p-4 press"
        >
          <div className="flex items-center gap-3">
            <ClipboardCheck size={22} className="shrink-0 text-finance" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
                {first ? "مطابقةٌ أولى مع كشوفك" : "حان وقتُ المطابقة"}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                عشرُ دقائق: افتح كشوفَ حساباتك، واكتب رقماً واحداً — فيُصحَّح ما يظنّه مدار أنّك تملك.
                {status.last && <> آخرُ مطابقة {formatDate(status.last)}.</>}
              </p>
            </div>
            <ChevronLeft size={16} className="shrink-0 text-gray-300" aria-hidden />
          </div>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full text-right flex items-center gap-2 px-1 py-1 press"
        >
          <ClipboardCheck size={13} className="shrink-0 text-gray-400" aria-hidden />
          <span className="flex-1 min-w-0 text-[11px] text-gray-400 truncate">
            {status.last
              ? <>آخرُ مطابقةٍ مع كشوفك {formatDate(status.last)} · القادمة بعد {arabicCount(status.daysLeft, { one: "يوم", two: "يومين", few: "أيام", many: "يوماً" })}</>
              : <>المطابقةُ مع كشوفك تبدأ بعد {arabicCount(status.daysLeft, { one: "يوم", two: "يومين", few: "أيام", many: "يوماً" })}</>}
          </span>
          <span className="shrink-0 text-[11px] text-finance font-semibold">طابِق الآن</span>
        </button>
      )}

      <Modal open={open} onClose={close} title="المطابقة مع كشوفك">
        {saved ? (
          <div className="space-y-3 py-2">
            <p className="text-4xl text-center">{saved.delta === 0 ? "✅" : "⚖️"}</p>
            {saved.delta === 0 ? (
              <p className="text-sm text-gray-700 leading-relaxed text-center">
                مطابق. أرقامُ مدار على قدر ما في حسابك — لا تسويةَ تُسجَّل.
                <br />المطابقةُ القادمة بعد {arabicCount(RECONCILE_DAYS, { one: "يوم", two: "يومين", few: "أيام", many: "يوماً" })}.
              </p>
            ) : (
              <p className="text-sm text-gray-700 leading-relaxed text-center">
                {saved.delta > 0 ? "عندك أكثر" : "عندك أقلّ"} ممّا يظنّ مدار بـ
                {" "}<b className="text-finance">{formatAmount(Math.abs(saved.delta))} ر.س</b>.
                <br />سُجّل الفرقُ تسويةً على «الفوائض»، فصار رقمُك هو الحقيقة.
              </p>
            )}
            <Button onClick={close} className="w-full bg-finance hover:bg-finance/90">تم ✓</Button>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <p className="text-xs text-gray-500 leading-relaxed">
              افتح كشوفَ حساباتك ومحافظك، واجمع أرصدتَها الآن. لا تُفصّل ولا تُصنّف — رقمٌ واحد يكفي.
            </p>

            {held.blockedByExcess && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
                <p className="text-xs font-bold text-amber-800">تحتاج تسويات البطاقات إلى تفسير</p>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  يوجد سداد لا يقابله مصروف ائتماني سابق. اختر سبباً واضحاً؛ لن يُستخدم هذا المبلغ تلقائياً لمصاريف لاحقة.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={resolutionSettlementId}
                    onChange={(event) => {
                      const id = event.target.value;
                      setResolutionSettlementId(id);
                      const item = settlements.find((settlement) => settlement.id === id || settlement.eventId === id);
                      if (item) setResolutionAmount(String(item.amount));
                    }}
                    aria-label="السداد المراد تفسيره"
                    className="rounded-lg border border-amber-200 bg-white px-2 py-2 text-[11px]"
                  >
                    <option value="">اختر السداد</option>
                    {settlements.map((settlement) => (
                      <option key={settlement.id} value={settlement.id}>
                        {settlement.cardId} · {formatAmount(settlement.amount)} ر.س
                      </option>
                    ))}
                  </select>
                  <select
                    value={resolutionKind}
                    onChange={(event) => setResolutionKind(event.target.value as typeof resolutionKind)}
                    aria-label="سبب التسوية"
                    className="rounded-lg border border-amber-200 bg-white px-2 py-2 text-[11px]"
                  >
                    <option value="opening_debt">دين افتتاحي</option>
                    <option value="missed_expense">مصروف فات</option>
                    <option value="prepaid_credit">رصيد مدفوع مقدماً</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    value={resolutionAmount}
                    onChange={(event) => setResolutionAmount(event.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    aria-label="مبلغ التسوية"
                    placeholder="المبلغ"
                    className="w-28 rounded-lg border border-amber-200 bg-white px-2 py-2 text-[11px]"
                  />
                  {resolutionKind === "missed_expense" && (
                    <select
                      value={resolutionChargeId}
                      onChange={(event) => setResolutionChargeId(event.target.value)}
                      aria-label="المصروف الفائت"
                      className="flex-1 rounded-lg border border-amber-200 bg-white px-2 py-2 text-[11px]"
                    >
                      <option value="">مصروف فات (اختياري)</option>
                      {resolutionCharges.map((transaction) => (
                        <option key={transaction.id} value={transaction.eventId ?? transaction.id}>
                          {transaction.note.slice(0, 24)} · {formatAmount(transaction.amount)} ر.س
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <input
                  value={resolutionNote}
                  onChange={(event) => setResolutionNote(event.target.value)}
                  aria-label="ملاحظة التسوية"
                  placeholder="ملاحظة اختيارية"
                  className="w-full rounded-lg border border-amber-200 bg-white px-2 py-2 text-[11px]"
                />
                <Button
                  onClick={applyResolution}
                  disabled={!resolutionSettlementId || !resolutionAmount || !resolutionCard}
                  className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-40"
                >
                  حفظ التفسير مرة واحدة
                </Button>
                {blockedMessage && <p className="text-[11px] font-semibold text-red-700">{blockedMessage}</p>}
              </div>
            )}

            {/* ما يظنّه مدار — مفصَّلاً حتى يعرف المالك ما الذي يقابله بالضبط. */}
            <div className="rounded-xl border border-[var(--border-subtle)] p-3 space-y-1.5">
              <p className="text-[11px] text-gray-400">ما يظنّه مدار أنّك تملك</p>
              {held.envelopes.map((e) => (
                <div key={e.id} className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-gray-500 truncate min-w-0">{e.icon} {e.name}</span>
                  <span dir="ltr" className="shrink-0 text-[11px] tabular-nums text-gray-600 dark:text-gray-300">
                    {formatAmount(e.balance)}
                  </span>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-gray-500">ما تبقّى من دورتك</span>
                <span dir="ltr" className="shrink-0 text-[11px] tabular-nums text-gray-600 dark:text-gray-300">
                  {formatAmount(held.cycleBalance)}
                </span>
              </div>
              <div className="pt-1.5 border-t border-[var(--border-subtle)] flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-200">المجموع</span>
                <span className="shrink-0 text-sm font-extrabold tabular-nums text-finance">
                  {formatAmount(held.expected)} ر.س
                </span>
              </div>
            </div>

            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">وكم عندك فعلاً؟</span>
              <input
                type="number"
                inputMode="decimal"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={String(Math.round(held.expected))}
                className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2.5 text-base font-bold tabular-nums"
              />
            </label>

            {preview && (
              <p className={cn(
                "text-[11px] rounded-xl px-3 py-2 leading-relaxed",
                preview.verdict === "match" ? "text-gray-500 bg-finance/5" : "text-gray-600 dark:text-gray-300 bg-finance/5"
              )}>
                {preview.verdict === "match"
                  ? "مطابق — لن تُسجَّل تسوية."
                  : preview.delta > 0
                  ? <>سيُضاف <b>{formatAmount(Math.abs(preview.delta))} ر.س</b> إلى «الفوائض»: دخلٌ أو ارتدادٌ لم يُسجَّل.</>
                  : <>سيُخصم <b>{formatAmount(Math.abs(preview.delta))} ر.س</b> من «الفوائض»: صرفٌ خرج ولم يُسجَّل.</>}
              </p>
            )}

            {first && (
              <p className="text-[11px] text-gray-500 bg-finance/5 rounded-xl px-3 py-2 leading-relaxed">
                🪧 <b>أوّلُ مطابقةٍ فرقُها كبيرٌ غالباً</b> — فيها كلُّ ما لم يُسجَّل منذ أوّل يوم. اقبَلها مرّةً
                واحدة، وبعدها يصير الفرقُ ربعَ سنةٍ فقط فيضيق حتى يكاد يختفي.
              </p>
            )}

            <Button onClick={submit} disabled={!valid} className="w-full bg-finance hover:bg-finance/90">
              سجّل المطابقة
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
