"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { today, yearProgress } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { NumberInput } from "@/components/ui/NumberInput";
import { Button } from "@/components/ui/Button";
import { Target, Pencil, Check } from "lucide-react";

// هدف قراءة سنوي: عدد الكتب المُنهاة هذا العام مقابل هدف اخترته، مع مؤشر
// «هل أنت على الوتيرة؟» يقارن نسبة الإنجاز بنسبة العام المنقضية.
export function ReadingGoalCard() {
  const { books, readingGoal, setReadingGoal } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(readingGoal ? String(readingGoal) : "");

  const year = today().slice(0, 4);
  const finishedThisYear = books.filter(
    (b) => b.status === "أنهيت" && (!b.finishDate || b.finishDate.startsWith(year))
  ).length;

  function save() {
    setReadingGoal(parseInt(input) || null);
    setEditing(false);
  }

  // بلا هدف بعد — بطاقة تحفيزية بسيطة تدعو لتحديده.
  if (!readingGoal && !editing) {
    return (
      <Card className="animate-fade-up">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-reading" />
            <span className="text-sm font-semibold text-gray-700">هدف القراءة {year}</span>
          </div>
          <button
            onClick={() => { setInput(""); setEditing(true); }}
            className="text-xs font-bold text-reading bg-reading/10 hover:bg-reading/20 rounded-full px-3 py-1 press"
          >
            حدّد هدفاً
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          كم كتاباً تنوي إنهاءه هذه السنة؟ حدّد رقماً وتابع تقدّمك نحوه.
        </p>
      </Card>
    );
  }

  if (editing) {
    return (
      <Card className="animate-fade-up">
        <div className="flex items-center gap-2 mb-3">
          <Target size={16} className="text-reading" />
          <span className="text-sm font-semibold text-gray-700">هدف القراءة {year}</span>
        </div>
        <label className="block text-xs font-medium text-gray-500 mb-1">عدد الكتب المستهدف</label>
        <div className="flex gap-2">
          <NumberInput
            value={input}
            onChange={setInput}
            placeholder="مثلاً 12"
            inputMode="numeric"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-reading/40"
          />
          <Button onClick={save} className="bg-reading hover:bg-reading/90 gap-1.5">
            <Check size={15} /> حفظ
          </Button>
        </div>
        {readingGoal ? (
          <button
            onClick={() => { setReadingGoal(null); setEditing(false); }}
            className="text-xs text-red-500 hover:text-red-600 mt-3 press"
          >
            إزالة الهدف
          </button>
        ) : (
          <button onClick={() => setEditing(false)} className="text-xs text-gray-400 mt-3 press">
            إلغاء
          </button>
        )}
      </Card>
    );
  }

  const goal = readingGoal!;
  const pct = Math.min(100, Math.round((finishedThisYear / goal) * 100));
  const yearPct = yearProgress();
  // على الوتيرة إن كانت نسبة الإنجاز ≥ نسبة العام المنقضية (بهامش بسيط).
  const onTrack = pct >= yearPct - 5;
  const remaining = Math.max(0, goal - finishedThisYear);
  const done = finishedThisYear >= goal;

  return (
    <Card className="animate-fade-up">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-reading" />
          <span className="text-sm font-semibold text-gray-700">هدف القراءة {year}</span>
        </div>
        <button
          onClick={() => { setInput(String(goal)); setEditing(true); }}
          className="p-1.5 text-gray-400 hover:text-reading rounded-lg press"
          aria-label="تعديل الهدف"
        >
          <Pencil size={14} />
        </button>
      </div>

      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-3xl font-black text-reading tabular-nums">{finishedThisYear}</span>
        <span className="text-sm text-gray-400">/ {goal} كتاب</span>
      </div>

      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-l from-[#c1663f] to-[#e8b15a] transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-xs mt-2.5 leading-relaxed">
        {done ? (
          <span className="text-finance font-bold">🎉 أنجزت هدفك لهذا العام! كتاب إضافي هدية.</span>
        ) : onTrack ? (
          <span className="text-finance font-medium">على الوتيرة الصحيحة — باقٍ {remaining} {remaining === 1 ? "كتاب" : "كتب"}.</span>
        ) : (
          <span className="text-gray-500">باقٍ {remaining} {remaining === 1 ? "كتاب" : "كتب"} — مضى {yearPct}% من العام، شدّ الهمّة 📚</span>
        )}
      </p>
    </Card>
  );
}
