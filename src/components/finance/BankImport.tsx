"use client";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { createSmsSourceId, parseBankSmsBulk, learnedCategory, type SmsParseEventResult } from "@/lib/bankParser";
import { today, getCategoryInfo, formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { CheckCircle, AlertCircle, Trash2, ClipboardPaste } from "lucide-react";

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
  const [skippedIncome, setSkippedIncome] = useState(0);
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
      const text = await navigator.clipboard.readText();
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
    setSkippedIncome(0);
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
    setSkippedIncome(skipped);
  }

  function handleConfirm() {
    // Let the store route generic/unknown rows into its durable review queue.
    // Confirming this preview must not silently discard a zero-amount event or
    // claim that every parsed row became a spending transaction.
    const result = importInboxEvents(preview);
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
        <p className="font-bold text-gray-800">حُفظ {importResult?.saved ?? 0} مصروفاً{importResult?.settlements ? ` و${importResult.settlements} سداد` : ""}</p>
        {!!importResult?.reviewed && <p className="text-sm text-amber-700">وبقيت {importResult.reviewed} رسالة للمراجعة — لم تُسجّل كصرف حتى تختار نوعها.</p>}
        {!!importResult?.duplicates && <p className="text-sm text-gray-500">وتم إبقاء {importResult.duplicates} نسخة مشتبه بها للمراجعة.</p>}
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
        <label className="block text-xs font-medium text-gray-500 mb-1">رسائل البنك (واحدة أو أكثر)</label>
        <textarea
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
        <label className="block text-xs font-medium text-gray-500 mb-1">تاريخ افتراضي (للرسائل بدون تاريخ)</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
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
            <p className="text-sm font-semibold text-gray-700">معاينة ({preview.length} معاملة)</p>
            <button onClick={() => setPreview([])} className="text-xs text-gray-400 hover:text-red-400">مسح</button>
          </div>
          {skippedIncome > 0 && (
            <p className="text-[11px] text-gray-400">
              (وجدت {skippedIncome} رسالة واردة أو غير مصروفة — محفوظة للمراجعة ولا تُحسب صرفاً)
            </p>
          )}
          <div className="max-h-52 overflow-y-auto space-y-2">
            {preview.map((tx, index) => {
              const info = getCategoryInfo(categories, tx.category);
              const rowId = tx.eventId ?? `${tx.sourceKey ?? "manual"}:${index}`;
              return (
                <div key={rowId} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5">
                  <span className="text-lg">{info.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-700 truncate">{tx.note || info.label}</div>
                    <div className="text-[10px] text-gray-400">{tx.date} · {info.label}</div>
                  </div>
                  <span className="text-sm font-bold shrink-0 text-red-500">
                    -{formatAmount(tx.amount)}
                  </span>
                  <button onClick={() => removePreview(rowId)} className="p-1 text-gray-300 hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleConfirm} className="flex-1 bg-finance hover:bg-finance/90">
              استيراد {preview.length} معاملة ✓
            </Button>
            <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          </div>
        </div>
      )}
    </div>
  );
}
