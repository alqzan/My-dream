"use client";
import { useState, useEffect } from "react";
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

  // حكمٌ قصير مشتقّ من نفس المقارنة: هل حلقة الإنجاز متقدّمة على حلقة العام؟
  const verdict = done
    ? { text: "🎉 أنجزت هدفك!", cls: "text-finance" }
    : onTrack
    ? { text: "متقدّم على الخطة", cls: "text-finance" }
    : { text: "متأخّر عن الخطة", cls: "text-reading" };

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

      {/* سباق المدارين: حلقتان متراكزتان — الخارجية نصيب العام المنقضي، الداخلية
          نصيب الهدف المُنجَز. حين يسبق مؤشّر الداخلية مؤشّر الخارجية فأنت متقدّم. */}
      <div className="flex items-center gap-4">
        <GoalRace
          goalFrac={goal > 0 ? finishedThisYear / goal : 0}
          yearFrac={yearPct / 100}
          finished={finishedThisYear}
          goal={goal}
        />
        <div className="flex-1 min-w-0 space-y-2.5">
          <p className={`text-base font-bold leading-tight ${verdict.cls}`}>{verdict.text}</p>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-gray-500 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0 bg-reading" />
                <span className="truncate">أنجزت من الهدف</span>
              </span>
              <span className="font-bold text-gray-800 tabular-nums shrink-0">{pct}%</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-gray-500 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#c9852a" }} />
                <span className="truncate">مضى من العام</span>
              </span>
              <span className="font-bold text-gray-800 tabular-nums shrink-0">{yearPct}%</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            {done
              ? "كتابٌ إضافي هدية 🎁"
              : `باقٍ ${remaining} ${remaining === 1 ? "كتاب" : "كتب"} لبلوغ الهدف.`}
          </p>
        </div>
      </div>
    </Card>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// حلقتان متراكزتان بحدٍّ ذهبي/طوبيّ رفيع كأخوات الأداة (مدار الانضباط، مدار العام):
// الخارجية الذهبية = نسبة العام المنقضي، والداخلية الطوبيّة = نسبة الهدف المُنجَز.
// لكلٍّ مؤشّرٌ صغير عند طرف قوسها؛ فإن سبق الطوبيّ الذهبيَّ زاويةً فالقارئ متقدّم.
const VB = 120;
const CENTER = VB / 2;
const YEAR_R = 51; // الخارجية — العام
const GOAL_R = 38; // الداخلية — الهدف

function GoalRace({
  goalFrac,
  yearFrac,
  finished,
  goal,
}: {
  goalFrac: number;
  yearFrac: number;
  finished: number;
  goal: number;
}) {
  const reduce = prefersReducedMotion();
  const [on, setOn] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const t = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(t);
  }, [reduce]);

  const gf = Math.max(0, Math.min(1, goalFrac));
  const yf = Math.max(0, Math.min(1, yearFrac));
  const yearC = 2 * Math.PI * YEAR_R;
  const goalC = 2 * Math.PI * GOAL_R;
  const yearDash = (on ? yf : 0) * yearC;
  const goalDash = (on ? gf : 0) * goalC;

  const tip = (r: number, frac: number) => {
    const a = ((on ? frac : 0) * 360 - 90) * (Math.PI / 180);
    return { x: CENTER + r * Math.cos(a), y: CENTER + r * Math.sin(a) };
  };
  const yearTip = tip(YEAR_R, yf);
  const goalTip = tip(GOAL_R, gf);
  const dashTrans = reduce ? undefined : { transition: "stroke-dasharray 1.4s cubic-bezier(0.16,1,0.3,1)" };
  const tipTrans = reduce ? undefined : { transition: "cx 1.4s cubic-bezier(0.16,1,0.3,1), cy 1.4s cubic-bezier(0.16,1,0.3,1)" };

  return (
    <div className="relative shrink-0" style={{ width: 116, height: 116 }}>
      <svg viewBox={`0 0 ${VB} ${VB}`} width={116} height={116}>
        <defs>
          <linearGradient id="goalYearGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e8b15a" />
            <stop offset="100%" stopColor="#c9852a" />
          </linearGradient>
          <linearGradient id="goalReadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e8b15a" />
            <stop offset="100%" stopColor="#c1663f" />
          </linearGradient>
        </defs>
        <g style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}>
          {/* الخارجية: العام المنقضي (ذهبي) */}
          <circle cx={CENTER} cy={CENTER} r={YEAR_R} fill="none" stroke="currentColor" className="text-gray-200 dark:text-[#3a2e1e]" strokeWidth={4} />
          <circle
            cx={CENTER} cy={CENTER} r={YEAR_R} fill="none"
            stroke="url(#goalYearGold)" strokeWidth={4} strokeLinecap="round"
            strokeDasharray={`${yearDash} ${yearC}`} style={dashTrans}
          />
          {/* الداخلية: الهدف المُنجَز (طوبيّ) */}
          <circle cx={CENTER} cy={CENTER} r={GOAL_R} fill="none" stroke="currentColor" className="text-gray-200 dark:text-[#3a2e1e]" strokeWidth={5} />
          <circle
            cx={CENTER} cy={CENTER} r={GOAL_R} fill="none"
            stroke="url(#goalReadGrad)" strokeWidth={5} strokeLinecap="round"
            strokeDasharray={`${goalDash} ${goalC}`} style={dashTrans}
          />
        </g>
        {/* مؤشّرا الطرفين */}
        <circle cx={yearTip.x} cy={yearTip.y} r={2.6} fill="#c9852a" stroke="#fff" strokeWidth={1.2} style={tipTrans} />
        <circle cx={goalTip.x} cy={goalTip.y} r={3.4} fill="#c1663f" stroke="#fff" strokeWidth={1.4} style={tipTrans} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-reading tabular-nums leading-none">{finished}</span>
        <span className="text-[10px] text-gray-400 mt-0.5">/ {goal} كتاب</span>
      </div>
    </div>
  );
}
