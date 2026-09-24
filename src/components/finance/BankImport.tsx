"use client";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { createSmsSourceId, parseBankSmsBulk, learnedCategory, type SmsParseEventResult } from "@/lib/bankParser";
import { today, getCategoryInfo, formatAmount, formatDate, toIndicDigits } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { CheckCircle, AlertCircle, Trash2, ClipboardPaste } from "lucide-react";
import { readClipboardText } from "@/lib/platform/clipboard";

const EXPENSE_KINDS = new Set<SmsParseEventResult["kind"]>([
  "purchase", "atm", "bill", "installment", "fee",
]);

function isExpensePreview(event: SmsParseEventResult): boolean {
  return event.direction === "out"
    && EXPENSE_KINDS.has(event.kind)
    && (event.expenseAmount ?? event.amount) > 0;
}

export function BankImport({ onClose, initialSms }: { onClose: () => void; initialSms?: string }) {
  const categories = useAppStore((s) => s.categories);
  const merchantRules = useAppStore((s) => s.merchantRules);
  const importInboxEvents = useAppStore((s) => s.importInboxEvents);
  // Preserve the parser's template/category decision. A learned merchant rule
  // is the only user override; re-running the generic keyword guess here could
  // erase a deliberate template classification.
  function classify(tx: SmsParseEventResult): SmsParseEventResult {
    return { ...tx, category: learnedCategory(tx.note ?? "", categories, merchantRules) ?? tx.category };
  }
  const [smsText, setSmsText] = useState(initialSms ?? "");
  const [date, setDate] = useState(today());
  const [preview, setPreview] = useState<SmsParseEventResult[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [importResult, setImportResult] = useState<{ saved: number; settlements: number; reviewed: number; duplicates: number } | null>(null);
  const sourceIdRef = useRef(createSmsSourceId());
  const lastParsedTextRef = useRef<string | null>(null);

  // Shared straight from the iOS Shortcut → parse immediately so the user
  // just reviews and confirms.
  useEffect(() => {
    if (initialSms && initialSms.trim()) handleSmsPreview(initialSms, sourceIdRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePasteClipboard() {
    setError("");
    try {
      const text = await readClipboardText();
      if (!text || !text.trim()) {
        setError("الحافظة فاضية — انسخ رسالة البنك أول ثم اضغط هنا.");
        return;
      }
      setSmsText(text);
      const sourceId = createSmsSourceId();
      sourceIdRef.current = sourceId;
      handleSmsPreview(text, sourceId);
    } catch {
      setError("ما قدرت أقرأ الحافظة. اسمح باللصق إذا طلب، أو الصق الرسالة يدوياً بالأعلى.");
    }
  }

  function handleSmsPreview(text: string = smsText, sourceId: string = sourceIdRef.current) {
    setError("");
    lastParsedTextRef.current = text;
    const { events: results, skippedIncome: skipped } = parseBankSmsBulk(text, date, { sourceId });
    if (!results.length) {
      setError(
        skipped > 0
        ? `لقيت ${skipped} رسالة واردة أو غير مصروفة — لم أحسبها صرفاً، ويمكنك مراجعتها من الوارد.`
          : "لم أستطع قراءة أي مبلغ. الصق رسائل البنك (تقدر تلصق عدة رسائل مرة وحدة)."
      );
      return;
    }
    const txs = results.map(classify);
    setPreview(txs);
  }

  function handleConfirm() {
    // Let the store route every row into its durable review queue — the
    // button says "save N items for review", so a manually pasted expense
    // must never skip that review just because the parser was confident
    // about its template. Only a *generic*-confidence expense is routed to
    // review by the store when unconfirmed, so downgrade the rest here
    // instead of asking the store to save them straight to the ledger.
    const forReview = preview.map((tx) => (EXPENSE_KINDS.has(tx.kind) && tx.confidence !== "generic"
      ? { ...tx, confidence: "generic" as const }
      : tx));
    const result = importInboxEvents(forReview, { confirmed: false });
    setImportResult(result);
    setDone(true);
  }

  function removePreview(id: string) {
    setPreview((p) => p.filter((t, index) => (t.eventId ?? `${t.sourceKey ?? "manual"}:${index}`) !== id));
  }

  if (done) {
    return (
      <div className="text-center py-8 space-y-3">
        <CheckCircle size={40} className="mx-auto text-finance" />
        <p className="font-bold text-gray-800">حُفظ {toIndicDigits(String(importResult?.saved ?? 0))} مصروفاً{importResult?.settlements ? ` و${toIndicDigits(String(importResult.settlements))} سداد` : ""}</p>
        {!!importResult?.reviewed && <p className="text-sm text-amber-700">وبقيت {toIndicDigits(String(importResult.reviewed))} رسالة للمراجعة — لم تُسجّل كصرف حتى تختار نوعها.</p>}
        {!!importResult?.duplicates && <p className="text-sm text-gray-500">وتم إبقاء {toIndicDigits(String(importResult.duplicates))} نسخة مشتبه بها للمراجعة.</p>}
        <Button onClick={onClose}>رائع ✓</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-700 leading-relaxed">
        <strong>الصق كل الرسائل دفعة وحدة 👇</strong><br />
        من تطبيق الرسائل، حدّد رسائل البنك وانسخها كلها مرة وحدة والصقها هنا — التطبيق يفصلها ويحفظ القرار لكل رسالة. الوارد والراتب لا يُحسبان صرفاً قبل مراجعتك.
      </div>
      <div>
        <label htmlFor="finance-bank-sms" className="block text-xs font-medium text-gray-500 mb-1">رسائل البنك (واحدة أو أكثر)</label>
        <textarea
          id="finance-bank-sms"
          value={smsText}
          onChange={(e) => setSmsText(e.target.value)}
          rows={7}
          placeholder={'الصق رسائلك هنا، مثال:\n\nشراء بقيمة 150.00 ريال من ماكدونالدز 30/06/2026\n\nشراء بقيمة 95.00 ريال من محطة وقود 29/06/2026\n\nإيداع راتب 12000 ريال'}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40 resize-none"
          lang="ar"
          dir="rtl"
        />
      </div>
      <div>
        <label htmlFor="finance-bank-default-date" className="block text-xs font-medium text-gray-500 mb-1">تاريخ افتراضي (للرسائل بدون تاريخ)</label>
        <input id="finance-bank-default-date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40" />
      </div>
      <Button onClick={() => {
        const sourceId = lastParsedTextRef.current === smsText ? sourceIdRef.current : createSmsSourceId();
        sourceIdRef.current = sourceId;
        handleSmsPreview(smsText, sourceId);
      }} className="w-full bg-finance hover:bg-finance/90" disabled={!smsText.trim()}>
        استخراج الكل تلقائياً 🤖
      </Button>
      <button
        type="button"
        onClick={handlePasteClipboard}
        className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-finance bg-finance/10 rounded-xl py-2.5 press"
      >
        <ClipboardPaste size={15} /> استورد من الحافظة
      </button>
      <p className="text-[11px] text-gray-400 text-center leading-relaxed">
        انسخ رسالة البنك من تطبيق الرسائل، ثم ارجع واضغط «استورد من الحافظة».
      </p>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-xl p-3 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {preview.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">
              معاينة ({toIndicDigits(String(preview.length))} عنصر)
            </p>
            <button type="button" onClick={() => setPreview([])} className="text-xs text-gray-400 hover:text-red-400">مسح</button>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500" aria-live="polite">
            <span>{toIndicDigits(String(preview.filter(isExpensePreview).length))} مصروف قابل للتصنيف</span>
            {preview.filter((tx) => tx.direction === "in").length > 0 && (
              <span className="text-finance">{toIndicDigits(String(preview.filter((tx) => tx.direction === "in").length))} وارد لا يُحسب صرفاً</span>
            )}
            {preview.filter((tx) => !isExpensePreview(tx) && tx.direction !== "in").length > 0 && (
              <span className="text-amber-700">{toIndicDigits(String(preview.filter((tx) => !isExpensePreview(tx) && tx.direction !== "in").length))} للمراجعة</span>
            )}
          </div>
          <div className="max-h-52 overflow-y-auto space-y-2">
            {preview.map((tx, index) => {
              const info = getCategoryInfo(categories, tx.category);
              const rowId = tx.eventId ?? `${tx.sourceKey ?? "manual"}:${index}`;
              const expense = isExpensePreview(tx);
              const incoming = tx.direction === "in";
              const displayAmount = expense ? (tx.expenseAmount ?? tx.amount) : tx.amount;
              const stateLabel = expense ? "مصروف" : incoming ? "وارد" : "للمراجعة";
              const amountLabel = displayAmount > 0
                ? `${expense ? "−" : incoming ? "+" : ""}${formatAmount(displayAmount)} ر.س`
                : "لا مبلغ";
              return (
                <div key={rowId} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5">
                  <span className="text-lg">{info.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-700 truncate">{tx.note || info.label}</div>
                    <div className="text-[10px] text-gray-400">{formatDate(tx.date)} · {stateLabel} · {info.label}</div>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${expense ? "text-red-500" : incoming ? "text-finance" : "text-amber-700"}`}>
                    {amountLabel}
                  </span>
                  <button type="button" aria-label={`إزالة ${stateLabel} ${tx.note || info.label}`} onClick={() => removePreview(rowId)} className="p-2 text-gray-300 hover:text-red-400 rounded-lg">
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleConfirm} className="flex-1 bg-finance hover:bg-finance/90">
              حفظ {toIndicDigits(String(preview.length))} عنصر للمراجعة ✓
            </Button>
            <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          </div>
        </div>
      )}
    </div>
  );
}
