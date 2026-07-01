"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { RecurringTransaction, RecurringUnit } from "@/lib/types";
import { RECURRING_PRESETS } from "@/lib/types";
import { uid, today, getCategoryInfo } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Plus, Trash2, Power, Gem } from "lucide-react";

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function describeFrequency(unit: RecurringUnit, every: number): string {
  const preset = RECURRING_PRESETS.find((p) => p.unit === unit && p.every === every);
  if (preset) return preset.label;
  const noun = unit === "شهري" ? "أشهر" : "أسابيع";
  return `كل ${every} ${noun}`;
}

export function RecurringManager({ onClose }: { onClose: () => void }) {
  const { categories, recurring, addRecurring, deleteRecurring, updateRecurring, runRecurring } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<string>(categories[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [unit, setUnit] = useState<RecurringUnit>("شهري");
  const [every, setEvery] = useState(1);
  const [customEvery, setCustomEvery] = useState(false);
  const [dayOfMonth, setDayOfMonth] = useState(1); // day-of-month (شهري) or weekday index (أسبوعي)
  const [big, setBig] = useState(false);

  function handleAdd() {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;
    const r: RecurringTransaction = {
      id: uid(),
      amount: parsed,
      category,
      note,
      unit,
      every: Math.max(1, every || 1),
      dayOfMonth,
      anchorDate: today(),
      active: true,
      big,
    };
    addRecurring(r);
    // Immediately generate any due instance
    setTimeout(() => runRecurring(), 0);
    setAdding(false);
    setAmount(""); setNote(""); setBig(false);
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 leading-relaxed">
        المصاريف المتكررة تُضاف <strong>تلقائياً</strong> في موعدها — إيجار، اشتراكات، تأمين سنوي، أي التزام دوري. اختر أي وتيرة تناسبك، حتى كل ٦ أشهر أو أكثر.
      </div>

      {/* List */}
      <div className="space-y-2">
        {recurring.length === 0 && !adding && (
          <p className="text-center text-sm text-gray-400 py-4">لا توجد مصاريف متكررة</p>
        )}
        {recurring.map((r) => {
          const info = getCategoryInfo(categories, r.category);
          return (
            <div key={r.id} className={`flex items-center gap-2 rounded-xl p-3 border ${r.active ? "bg-white border-gray-100" : "bg-gray-50 border-gray-100 opacity-60"}`}>
              <span className="text-lg">{info.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm font-semibold text-gray-700 truncate">{r.note || info.label}</div>
                  {r.big && <Gem size={11} className="text-brand-600 shrink-0" />}
                </div>
                <div className="text-[11px] text-gray-400">
                  {describeFrequency(r.unit, r.every)} · {info.label}
                </div>
              </div>
              <span className="text-sm font-bold text-red-500">
                -{r.amount.toLocaleString("ar-SA")}
              </span>
              <button
                onClick={() => updateRecurring(r.id, { active: !r.active })}
                className={`p-1 rounded-lg ${r.active ? "text-finance" : "text-gray-300"}`}
                title={r.active ? "إيقاف" : "تفعيل"}
              >
                <Power size={15} />
              </button>
              <button onClick={() => deleteRecurring(r.id)} className="p-1 text-gray-300 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add form */}
      {adding ? (
        <div className="bg-gray-50 rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg border text-[11px] ${category === cat.id ? "border-finance bg-finance/5 text-finance" : "border-gray-200 text-gray-500"}`}
              >
                <span className="text-base">{cat.icon}</span>
                {cat.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="المبلغ"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
            />
            <input
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="الوصف (إيجار...)"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
            />
          </div>

          {/* Frequency presets */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">الوتيرة</label>
            <div className="flex flex-wrap gap-1.5">
              {RECURRING_PRESETS.map((p) => {
                const isActive = !customEvery && unit === p.unit && every === p.every;
                return (
                  <button
                    key={p.label}
                    onClick={() => { setUnit(p.unit); setEvery(p.every); setCustomEvery(false); }}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                      isActive ? "border-finance bg-finance/5 text-finance" : "border-gray-200 text-gray-500"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
              <button
                onClick={() => setCustomEvery(true)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                  customEvery ? "border-finance bg-finance/5 text-finance" : "border-gray-200 text-gray-500"
                }`}
              >
                مخصص…
              </button>
            </div>
          </div>

          {customEvery && (
            <div className="flex items-center gap-2 bg-white rounded-lg p-2 border border-gray-200">
              <span className="text-xs text-gray-500 shrink-0">كل</span>
              <input
                type="number" min={1} value={every}
                onChange={(e) => setEvery(parseInt(e.target.value) || 1)}
                className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-finance/40"
              />
              <div className="flex gap-1 flex-1">
                {(["شهري", "أسبوعي"] as RecurringUnit[]).map((u) => (
                  <button
                    key={u}
                    onClick={() => setUnit(u)}
                    className={`flex-1 py-1 rounded-md text-[11px] font-medium ${unit === u ? "bg-finance/10 text-finance" : "text-gray-400"}`}
                  >
                    {u === "شهري" ? "شهر" : "أسبوع"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Anchor day: weekday picker for أسبوعي, day-of-month for شهري */}
          {unit === "أسبوعي" ? (
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1.5">يوم الأسبوع</label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((w, i) => (
                  <button
                    key={w}
                    onClick={() => setDayOfMonth(i)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border ${
                      dayOfMonth === i ? "border-finance bg-finance/5 text-finance" : "border-gray-200 text-gray-500"
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1.5">يوم الشهر</label>
              <input
                type="number" min={1} max={28} value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Math.min(28, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-finance/40"
              />
            </div>
          )}

          <label className="flex items-center gap-2.5 bg-amber-50 rounded-xl p-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={big}
              onChange={(e) => setBig(e.target.checked)}
              className="w-4 h-4 accent-brand-600"
            />
            <span className="text-[11px] text-amber-700 leading-relaxed">
              <strong>التزام كبير</strong> (إيجار مرتفع...) — ما يأثر على ميزانيتك اليومية
            </span>
          </label>

          <div className="flex gap-2">
            <Button onClick={handleAdd} className="flex-1 bg-finance hover:bg-finance/90" size="sm">حفظ</Button>
            <Button variant="secondary" size="sm" onClick={() => setAdding(false)}>إلغاء</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setAdding(true)} variant="secondary" className="w-full gap-1.5">
          <Plus size={16} /> إضافة مصروف متكرر
        </Button>
      )}

      <Button onClick={onClose} className="w-full">تم</Button>
    </div>
  );
}
