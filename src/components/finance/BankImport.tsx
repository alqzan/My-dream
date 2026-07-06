"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { parseBankSmsBulk, parseBankCsv, suggestCategory } from "@/lib/bankParser";
import { today, getCategoryInfo } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { Transaction } from "@/lib/types";
import { MessageSquare, FileText, CheckCircle, AlertCircle, Trash2 } from "lucide-react";

type Mode = "sms" | "csv";

export function BankImport({ onClose }: { onClose: () => void }) {
  const { categories, merchantRules, addTransaction } = useAppStore();

  // Re-classify a parsed row through the user's learned merchant rules
  // (falls back to the built-in keyword guess the parser already applied).
  function classify(tx: Transaction): Transaction {
    return { ...tx, category: suggestCategory(tx.note ?? "", categories, merchantRules) };
  }
  const [mode, setMode] = useState<Mode>("sms");
  const [smsText, setSmsText] = useState("");
  const [date, setDate] = useState(today());
  const [preview, setPreview] = useState<Transaction[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [skippedIncome, setSkippedIncome] = useState(0);

  function handleSmsPreview() {
    setError("");
    setSkippedIncome(0);
    const { transactions: results, skippedIncome: skipped } = parseBankSmsBulk(smsText, date);
    if (!results.length) {
      setError(
        skipped > 0
          ? `لقيت ${skipped} رسالة دخل وتجاهلتها (التطبيق للمصاريف بس) — ما فيه أي مصروف لأستورده.`
          : "لم أستطع قراءة أي مبلغ. الصق رسائل البنك (تقدر تلصق عدة رسائل مرة وحدة)."
      );
      return;
    }
    const txs: Transaction[] = results.map((r) =>
      classify({ id: Math.random().toString(36).slice(2), ...r })
    );
    setPreview(txs);
    setSkippedIncome(skipped);
  }

  function handleCsvFile(file: File) {
    setError("");
    setSkippedIncome(0);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const { transactions: txs, skippedIncome: skipped } = parseBankCsv(csv);
        if (!txs.length) {
          setError(
            skipped > 0
              ? `لقيت ${skipped} معاملة دخل وتجاهلتها (التطبيق للمصاريف بس) — ما فيه أي مصروف لأستورده.`
              : "لم أجد معاملات في الملف. تأكد أن الملف CSV صحيح."
          );
          return;
        }
        setPreview(txs.map(classify));
        setSkippedIncome(skipped);
      } catch {
        setError("خطأ في قراءة الملف");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function handleConfirm() {
    preview.forEach((tx) => addTransaction(tx));
    setDone(true);
  }

  function removePreview(id: string) {
    setPreview((p) => p.filter((t) => t.id !== id));
  }

  if (done) {
    return (
      <div className="text-center py-8 space-y-3">
        <CheckCircle size={40} className="mx-auto text-finance" />
        <p className="font-bold text-gray-800">تم استيراد {preview.length} معاملة</p>
        <Button onClick={onClose}>رائع ✓</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode Selector */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
        <button
          onClick={() => { setMode("sms"); setPreview([]); setError(""); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === "sms" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
        >
          <MessageSquare size={15} /> رسالة SMS
        </button>
        <button
          onClick={() => { setMode("csv"); setPreview([]); setError(""); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === "csv" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
        >
          <FileText size={15} /> ملف CSV بنكي
        </button>
      </div>

      {mode === "sms" && (
        <>
          <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-700 leading-relaxed">
            <strong>الصق كل الرسائل دفعة وحدة 👇</strong><br />
            من تطبيق الرسائل، حدّد رسائل البنك وانسخها كلها مرة وحدة والصقها هنا — التطبيق يفصلها ويسجّل المصاريف فيها تلقائياً (المبلغ + التصنيف + التاريخ)، ويتجاهل رسائل الإيداع/الراتب.
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">رسائل البنك (واحدة أو أكثر)</label>
            <textarea
              value={smsText}
              onChange={(e) => setSmsText(e.target.value)}
              rows={7}
              placeholder={'الصق رسائلك هنا، مثال:\n\nشراء بقيمة 150.00 ريال من ماكدونالدز 30/06/2026\n\nشراء بقيمة 95.00 ريال من محطة وقود 29/06/2026\n\nإيداع راتب 12000 ريال'}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40 resize-none"
              dir="auto"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">تاريخ افتراضي (للرسائل بدون تاريخ)</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40" />
          </div>
          <Button onClick={handleSmsPreview} className="w-full bg-finance hover:bg-finance/90" disabled={!smsText.trim()}>
            استخراج الكل تلقائياً 🤖
          </Button>
        </>
      )}

      {mode === "csv" && (
        <>
          <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 leading-relaxed">
            <strong>كيف تحصل على ملف CSV؟</strong><br />
            الراجحي: حساباتي ← كشف الحساب ← تصدير Excel/CSV<br />
            SNB: الخدمات الإلكترونية ← كشف الحساب ← تصدير
          </div>
          <label className="block border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center cursor-pointer hover:border-finance/40 transition-colors">
            <FileText size={28} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm font-medium text-gray-700">اختر ملف CSV</p>
            <p className="text-xs text-gray-400 mt-1">يدعم ملفات جميع البنوك السعودية</p>
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
          </label>
        </>
      )}

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
              (تجاهلت {skippedIncome} معاملة دخل — التطبيق للمصاريف بس)
            </p>
          )}
          <div className="max-h-52 overflow-y-auto space-y-2">
            {preview.map((tx) => {
              const info = getCategoryInfo(categories, tx.category);
              return (
                <div key={tx.id} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5">
                  <span className="text-lg">{info.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-700 truncate">{tx.note || info.label}</div>
                    <div className="text-[10px] text-gray-400">{tx.date} · {info.label}</div>
                  </div>
                  <span className="text-sm font-bold shrink-0 text-red-500">
                    -{tx.amount.toLocaleString("ar-SA")}
                  </span>
                  <button onClick={() => removePreview(tx.id)} className="p-1 text-gray-300 hover:text-red-400">
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
