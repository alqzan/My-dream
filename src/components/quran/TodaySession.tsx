"use client";
import { useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ, type HifzRating } from "@/lib/types";
import { describeRange, idToSurahAyah } from "@/lib/quran/meta";
import { textsInRange } from "@/lib/quran/text";
import { today } from "@/lib/utils";
import { openMistakes, type Portion } from "@/lib/quran/hifz";
import { todaySession, type DuePage } from "@/lib/quran/schedule";
import { HifzCoach } from "@/components/quran/HifzCoach";
import { MutashabihatAlert } from "@/components/quran/MutashabihatAlert";
import {
  Sparkles, Sprout, RefreshCw, Layers, Wand2, Check, X,
  ChevronLeft, GraduationCap, Headphones, ShieldCheck, Timer, Play,
} from "lucide-react";

// ===================== هدف المراجعة اليومي (تفضيل جهازي) =====================
// كم وجهاً مستحقّاً نعرض في جلسة اليوم قبل تأجيل الباقي — تفضيلٌ محليٌّ للجهاز
// (لا يُزامَن)، فلا حاجة لتغيير AppData. الافتراضي 7.
const GOAL_KEY = "madar-hifz-review-goal";
function readGoal(): number {
  if (typeof window === "undefined") return 7;
  const n = Number(window.localStorage.getItem(GOAL_KEY));
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.round(n), 20) : 7;
}
function writeGoal(n: number) {
  if (typeof window !== "undefined") window.localStorage.setItem(GOAL_KEY, String(n));
}

// ===================== بطاقة «جلسة اليوم» =====================
// المدخل الأساسي: مقدار الحفظ الجديد، الأوجه المستحقّة، الأخطاء المفتوحة، ووقتٌ
// تقريبيّ — بزرٍّ واحد. الأقسام المنفردة أدناه تبقى متاحة لمن أراد.
export function TodaySessionCard({ onStart }: { onStart: (goal: number) => void }) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const [goal, setGoal] = useState(readGoal);
  const todayStr = today();
  const s = useMemo(() => todaySession(h, todayStr, goal), [h, todayStr, goal]);

  const setG = (n: number) => { const v = Math.min(Math.max(n, 1), 20); setGoal(v); writeGoal(v); };
  const nothing = !s.newPortion && s.due.total === 0 && s.openMistakes === 0;
  if (nothing) return null; // لا شيء لليوم — لا نعرض بطاقةً فارغة

  return (
    <div className="rounded-2xl border border-quran/30 bg-gradient-to-b from-quran/[0.09] to-quran/[0.03] p-4 space-y-3.5">
      <div className="flex items-center gap-2">
        <Sparkles size={17} className="text-quran" />
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">جلسة اليوم</span>
        <span className="ms-auto inline-flex items-center gap-1 text-[11px] font-semibold text-quran">
          <Timer size={12} /> ~{s.estMinutes} دقيقة
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat
          icon={<Sprout size={14} className="text-quran" />}
          label="الحفظ الجديد"
          value={s.newPortion ? describeRange(s.newPortion.fromId, s.newPortion.toId) : "تمّ"}
          small
        />
        <Stat
          icon={<RefreshCw size={14} className="text-quran" />}
          label="مراجعة مستحقّة"
          value={s.due.total === 0 ? "لا شيء" : `${s.due.total} وجه`}
        />
        <Stat
          icon={<Wand2 size={14} className="text-amber-600" />}
          label="أخطاء مفتوحة"
          value={s.openMistakes === 0 ? "لا شيء" : String(s.openMistakes)}
        />
      </div>

      {s.due.hidden > 0 && (
        <p className="text-[11px] text-gray-500 text-center">
          عرضنا {goal} أوجه اليوم و{s.due.hidden} مؤجَّلة لغدٍ حتى لا تتراكم.
        </p>
      )}

      <button
        onClick={() => onStart(goal)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press shadow-sm"
      >
        <Play size={16} /> ابدأ جلسة اليوم
      </button>

      {/* ضبط هدف المراجعة اليومي */}
      <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400">
        <Layers size={12} /> هدف المراجعة اليومي:
        <button onClick={() => setG(goal - 1)} className="w-6 h-6 rounded-lg bg-white/70 dark:bg-[#382c1d] border border-gray-200 dark:border-transparent press flex items-center justify-center" aria-label="أنقص الهدف">−</button>
        <span className="w-10 text-center font-bold text-gray-600 dark:text-gray-300 tabular-nums">{goal} وجه</span>
        <button onClick={() => setG(goal + 1)} className="w-6 h-6 rounded-lg bg-white/70 dark:bg-[#382c1d] border border-gray-200 dark:border-transparent press flex items-center justify-center" aria-label="زِد الهدف">+</button>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, small }: { icon: React.ReactNode; label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl bg-white/70 dark:bg-[#241c12] border border-quran/10 px-2 py-2 text-center">
      <div className="flex items-center justify-center gap-1 text-[10px] text-gray-500 mb-1">{icon}<span>{label}</span></div>
      <div className={`font-bold text-gray-800 dark:text-gray-100 leading-tight ${small ? "text-[11px]" : "text-sm"}`}>{value}</div>
    </div>
  );
}

// ===================== تدفّق «جلسة اليوم» المتدرّج =====================
// شاشةٌ واحدة تمشي بالخطوات بالترتيب: السَّبْق ← القريبة ← المستحقّة ← الأخطاء ←
// النتيجة. تُلتقط الخطوات مرّةً عند الفتح فلا تتزحزح أثناء الجلسة.
type Step =
  | { kind: "memorize"; portion: Portion }
  | { kind: "recent"; portion: Portion }
  | { kind: "due"; portion: Portion; page: number; overdueDays: number; never: boolean }
  | { kind: "mistakes" };

export function TodaySessionFlow({ text, goal, onClose }: { text: string[]; goal: number; onClose: () => void }) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const todayStr = today();

  // لقطة الخطوات عند الفتح (لا تتغيّر أثناء الجلسة).
  const [steps] = useState<Step[]>(() => {
    const s = todaySession(h, todayStr, goal);
    const list: Step[] = [];
    if (s.newPortion) list.push({ kind: "memorize", portion: s.newPortion });
    if (s.recentBand) list.push({ kind: "recent", portion: s.recentBand });
    for (const d of s.due.pages as DuePage[]) {
      list.push({ kind: "due", portion: d.portion, page: d.page, overdueDays: d.overdueDays, never: d.neverReviewed });
    }
    if (s.openMistakes > 0) list.push({ kind: "mistakes" });
    return list;
  });

  const [idx, setIdx] = useState(0);
  const [coach, setCoach] = useState<{ portion: Portion; mode: "memorize" | "recall"; onDone: (r?: HifzRating) => void } | null>(null);
  const [tally, setTally] = useState({ memorized: 0, reviewed: 0, mistakesClosed: 0 });

  const next = () => setIdx((i) => i + 1);
  const done = idx >= steps.length;
  const total = steps.length;

  return (
    <div className="fixed inset-0 z-[65] bg-[#f4eee2] dark:bg-[#171009] flex flex-col" dir="rtl">
      {/* شريط علوي ثابت */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-quran/15 bg-[#f4eee2]/90 dark:bg-[#171009]/90 backdrop-blur">
        <Sparkles size={17} className="text-quran" />
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">جلسة اليوم</span>
        {!done && total > 0 && (
          <span className="text-[11px] text-gray-500 font-semibold">خطوة {Math.min(idx + 1, total)} من {total}</span>
        )}
        <button onClick={onClose} className="ms-auto w-8 h-8 rounded-lg press flex items-center justify-center text-gray-500 hover:bg-black/5 dark:hover:bg-white/5" aria-label="إغلاق">
          <X size={18} />
        </button>
      </div>

      {/* شريط تقدّم */}
      {total > 0 && (
        <div className="h-1 bg-quran/10">
          <div className="h-full bg-quran transition-all" style={{ width: `${(Math.min(idx, total) / total) * 100}%` }} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-5">
        {done ? (
          <ResultScreen tally={tally} onClose={onClose} />
        ) : (
          <StepView
            step={steps[idx]}
            text={text}
            todayStr={todayStr}
            onSkip={next}
            onGuided={(portion, mode, onDoneRating) => setCoach({ portion, mode, onDone: onDoneRating })}
            onMemorize={(portion, r) => { store.recordHifzSession(portion.toId, r); setTally((t) => ({ ...t, memorized: t.memorized + 1 })); next(); }}
            onReview={(portion, r) => { store.recordReview(portion.fromId, portion.toId, r, false); setTally((t) => ({ ...t, reviewed: t.reviewed + 1 })); next(); }}
            onMistakesDone={(closed) => { setTally((t) => ({ ...t, mistakesClosed: t.mistakesClosed + closed })); next(); }}
          />
        )}
      </div>

      {coach && (
        <HifzCoach
          portion={coach.portion}
          text={text}
          mode={coach.mode}
          recallTitle={coach.mode === "recall" ? "سمّع مراجعتك" : undefined}
          onClose={() => setCoach(null)}
          onDone={(rating?: HifzRating) => { coach.onDone(rating); setCoach(null); }}
        />
      )}
    </div>
  );
}

function StepView({
  step, text, todayStr, onSkip, onGuided, onMemorize, onReview, onMistakesDone,
}: {
  step: Step;
  text: string[];
  todayStr: string;
  onSkip: () => void;
  onGuided: (portion: Portion, mode: "memorize" | "recall", onDone: (r?: HifzRating) => void) => void;
  onMemorize: (portion: Portion, r?: HifzRating) => void;
  onReview: (portion: Portion, r?: HifzRating) => void;
  onMistakesDone: (closed: number) => void;
}) {
  if (step.kind === "mistakes") return <MistakesStep text={text} onDone={onMistakesDone} onSkip={onSkip} />;

  const { portion } = step;
  const meta: Record<Exclude<Step["kind"], "mistakes">, { icon: React.ReactNode; title: string; hint: string; recall: boolean }> = {
    memorize: { icon: <Sprout size={16} className="text-quran" />, title: "السَّبْق — حفظٌ جديد", hint: "احفظ وردك الجديد بتؤدة، ثمّ قيّم نفسك.", recall: false },
    recent: { icon: <RefreshCw size={16} className="text-quran" />, title: "المراجعة القريبة", hint: "ثبّت آخر ما حفظت.", recall: true },
    due: { icon: <RefreshCw size={16} className="text-amber-600" />, title: "مراجعة مستحقّة", hint: "حان موعد مراجعة هذا الوجه.", recall: true },
  };
  const m = meta[step.kind];
  const isMemorize = step.kind === "memorize";

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {m.icon}
        <span className="text-base font-bold text-gray-800 dark:text-gray-100">{m.title}</span>
        <span className="text-[11px] text-quran font-semibold">{describeRange(portion.fromId, portion.toId)}</span>
        {step.kind === "due" && step.overdueDays > 0 && (
          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 rounded-full px-2 py-0.5">
            متأخّر {step.overdueDays} يوم
          </span>
        )}
        {step.kind === "due" && step.never && (
          <span className="text-[10px] font-bold text-quran bg-quran/10 rounded-full px-2 py-0.5">لم يُراجَع بعد</span>
        )}
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{m.hint}</p>

      <PortionBlock text={text} portion={portion} muted={!isMemorize} />
      <MutashabihatAlert portion={portion} />

      <button
        onClick={() => onGuided(portion, isMemorize ? "memorize" : "recall", (r) => (isMemorize ? onMemorize(portion, r) : onReview(portion, r)))}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold press shadow-sm ${isMemorize ? "bg-quran text-white" : "bg-quran/10 hover:bg-quran/20 text-quran"}`}
      >
        {isMemorize ? <><GraduationCap size={17} /> احفظ بطريقة موجّهة</> : <><Headphones size={16} /> سمّع موجّهاً</>}
      </button>

      <div>
        <div className="text-[11px] text-gray-500 mb-1.5 text-center">أو قيّم مباشرةً:</div>
        <RatingRow onRate={(r) => (isMemorize ? onMemorize(portion, r) : onReview(portion, r))} />
      </div>

      <button onClick={onSkip} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 py-2 press">
        تخطَّ هذه الخطوة <ChevronLeft size={14} />
      </button>
    </div>
  );
}

// جلسة أخطائي القصيرة: كلّ خطأٍ مفتوح مع سياق آيته — «أتقنته» يُغلقه مع حفظ
// الإحصائية (لا يُحذف التاريخ)، و«سمّعه» يُسجَّل مراجعةً على وجه الآية.
function MistakesStep({ text, onDone, onSkip }: { text: string[]; onDone: (closed: number) => void; onSkip: () => void }) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const open = openMistakes(h);
  const [closed, setClosed] = useState(0);

  if (open.length === 0) { onSkip(); return null; }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Wand2 size={16} className="text-amber-600" />
        <span className="text-base font-bold text-gray-800 dark:text-gray-100">جلسة أخطائي</span>
        <span className="text-[11px] text-gray-500 font-semibold">{open.length} موضع مفتوح</span>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">راجِع مواضع تعثّرك — «أتقنته» يُغلق الموضع ويحتفظ بإحصائيته.</p>

      <div className="space-y-2.5">
        {open.map((mk) => {
          const { surah, ayah } = idToSurahAyah(mk.ayahId);
          const rows = textsInRange(text, mk.ayahId, mk.ayahId);
          return (
            <div key={mk.id} className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <span className="font-semibold text-amber-700">تكرّر {mk.hits.length}×</span>
                {mk.word && <span className="font-quran text-sm text-gray-700 dark:text-gray-200">«{mk.word}»</span>}
                <span className="ms-auto">آخر مرّة {mk.hits[mk.hits.length - 1]}</span>
              </div>
              <p className="font-quran text-center text-[18px] leading-[2.2] font-bold text-gray-700 dark:text-gray-200" dir="rtl">
                {rows.map((r) => <span key={r.id}>{r.text} <span className="text-quran text-[11px] align-middle">﴿{ayah}﴾</span></span>)}
              </p>
              <button
                onClick={() => { store.resolveMistake(mk.id); setClosed((c) => c + 1); }}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-quran rounded-lg py-2 press"
              >
                <ShieldCheck size={14} /> أتقنته — أغلق الموضع
              </button>
            </div>
          );
        })}
      </div>

      <button onClick={() => onDone(closed)} className="w-full flex items-center justify-center gap-1.5 text-sm font-bold text-quran bg-quran/10 hover:bg-quran/20 rounded-xl py-2.5 press">
        <Check size={15} /> أنهيت مراجعة الأخطاء
      </button>
    </div>
  );
}

function ResultScreen({ tally, onClose }: { tally: { memorized: number; reviewed: number; mistakesClosed: number }; onClose: () => void }) {
  const nothing = tally.memorized === 0 && tally.reviewed === 0 && tally.mistakesClosed === 0;
  return (
    <div className="max-w-sm mx-auto text-center space-y-4 pt-6">
      <div className="w-16 h-16 mx-auto rounded-full bg-quran/10 flex items-center justify-center">
        <Sparkles size={28} className="text-quran" />
      </div>
      <p className="text-lg font-bold text-quran">{nothing ? "إلى جلسةٍ قادمة بإذن الله" : "أتممت جلسة اليوم — تقبّل الله"}</p>
      {!nothing && (
        <div className="grid grid-cols-3 gap-2">
          <ResultStat label="حُفِظ" value={tally.memorized} />
          <ResultStat label="رُوجِع" value={tally.reviewed} />
          <ResultStat label="أُغلِق" value={tally.mistakesClosed} />
        </div>
      )}
      <button onClick={onClose} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press shadow-sm">
        <Check size={16} /> تمّت الجلسة
      </button>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/70 dark:bg-[#241c12] border border-quran/10 px-2 py-3">
      <div className="text-2xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function PortionBlock({ text, portion, muted }: { text: string[]; portion: Portion; muted?: boolean }) {
  const rows = textsInRange(text, portion.fromId, portion.toId);
  return (
    <div className="rounded-xl bg-white/60 dark:bg-[#2c2318] p-3 max-h-64 overflow-y-auto">
      <p className={`font-quran text-center text-[20px] leading-[2.4] font-bold ${muted ? "text-gray-600 dark:text-gray-300" : "text-gray-800 dark:text-gray-100"}`} dir="rtl">
        {rows.map((r) => {
          const { ayah } = idToSurahAyah(r.id);
          return <span key={r.id}>{r.text}<span className="text-quran text-[12px] align-middle mx-0.5">﴿{ayah}﴾</span>{" "}</span>;
        })}
      </p>
    </div>
  );
}

function RatingRow({ onRate }: { onRate: (r: HifzRating) => void }) {
  const items: { r: HifzRating; label: string; cls: string }[] = [
    { r: 3, label: "متقن", cls: "bg-quran text-white" },
    { r: 2, label: "جيّد", cls: "bg-amber-500 text-white" },
    { r: 1, label: "يحتاج إتقان", cls: "bg-red-500 text-white" },
  ];
  return (
    <div className="flex gap-2">
      {items.map((it) => (
        <button key={it.r} onClick={() => onRate(it.r)} className={`flex-1 text-xs font-bold rounded-lg py-2 press ${it.cls}`}>{it.label}</button>
      ))}
    </div>
  );
}
