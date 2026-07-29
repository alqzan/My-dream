"use client";
import { useState, useMemo, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ, type HifzRating } from "@/lib/types";
import { describeRange } from "@/lib/quran/meta";
import { today } from "@/lib/utils";
import { countPages, type Portion } from "@/lib/quran/hifz";
import {
  buildTodayPlan, loadSession, saveSession, clearSession, drillOverflow,
  STEP_LABEL, type SessionStep, type SessionTally,
} from "@/lib/quran/session";
import { HifzCoach } from "@/components/quran/HifzCoach";
import { MushafSheet } from "@/components/quran/MushafSheet";
import { MistakeDrill } from "@/components/quran/MistakeDrill";
import { MutashabihatAlert } from "@/components/quran/MutashabihatAlert";
import {
  Sparkles, Sprout, RefreshCw, Check, X, ChevronLeft,
  GraduationCap, Headphones, Timer, Play, Shuffle, RotateCcw,
} from "lucide-react";

// ===================== بطاقة «جلسة اليوم» =====================
// المدخل الوحيد لعمل اليوم: جملةٌ واحدة تقول ما ينتظرك، سلسلةُ خطواتٍ مرئية،
// ووقتٌ تقريبيّ — بزرٍّ واحد. لا مقابض ولا مساراتٍ موازية؛ كلّ ما كان موزّعاً
// على بطاقاتٍ متفرّقة صار خطواتٍ داخل هذه الجلسة.
export function TodaySessionCard({ onStart }: { onStart: (resume: boolean) => void }) {
  const h = useAppStore((s) => s.quranHifz) ?? EMPTY_HIFZ;
  const todayStr = today();
  const plan = useMemo(() => buildTodayPlan(h, todayStr), [h, todayStr]);
  // لقطة الاستئناف تعيش في localStorage، فلا تُقرأ أثناء الرسم الأوّل (الموقع
  // ثابتٌ مُصدَّر مسبقاً) — نقرؤها بعد التركيب فلا يختلف خادمٌ عن متصفّح.
  const [saved, setSaved] = useState<{ idx: number } | null>(null);
  useEffect(() => {
    const snap = loadSession(todayStr);
    setSaved(snap ? { idx: snap.idx } : null);
  }, [todayStr, h]);

  if (!plan.steps.length) return null; // لا شيء لليوم — لا نعرض بطاقةً فارغة

  const overflow = drillOverflow(plan);
  const resume = saved != null;
  const doneCount = saved?.idx ?? 0;

  return (
    <div className="rounded-2xl border border-quran/30 bg-gradient-to-b from-quran/[0.09] to-quran/[0.03] p-4 space-y-3.5">
      <div className="flex items-center gap-2">
        <Sparkles size={17} className="text-quran" />
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">جلسة اليوم</span>
        <span className="ms-auto inline-flex items-center gap-1 text-[11px] font-semibold text-quran">
          <Timer size={12} /> ~{plan.estMinutes} دقيقة
        </span>
      </div>

      {/* «ماذا ينتظرني» — سطرٌ واحد بلغةٍ واضحة بدل ثلاث بطاقات أرقام */}
      <div className="rounded-xl bg-white/70 dark:bg-[#241c12] border border-quran/10 px-3 py-2.5 text-center">
        <div className="text-[10px] text-gray-500 mb-0.5">ينتظرك اليوم</div>
        <div className="text-[13px] font-bold text-gray-800 dark:text-gray-100 leading-relaxed">{plan.summary}</div>
      </div>

      {/* سلسلة الخطوات — تعرف مسبقاً ما ستمرّ به وبأيّ ترتيب */}
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {plan.steps.map((st, i) => (
          <span
            key={i}
            className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
              i < doneCount
                ? "bg-quran/15 text-quran/50 line-through"
                : "bg-white/70 dark:bg-[#241c12] text-gray-500 border border-quran/10"
            }`}
          >
            {STEP_LABEL[st.kind]}
          </span>
        ))}
      </div>

      {(plan.dueHidden > 0 || overflow > 0) && (
        <p className="text-[11px] text-gray-500 text-center leading-relaxed">
          {plan.dueHidden > 0 && `${countPages(plan.dueHidden)} مؤجَّلة لغدٍ حتى لا تتراكم. `}
          {overflow > 0 && `و${overflow} موضع خطأٍ ينتظر دوره.`}
        </p>
      )}

      <button
        onClick={() => onStart(resume)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press shadow-sm"
      >
        {resume ? <><RotateCcw size={16} /> أكمل جلسة اليوم (خطوة {doneCount + 1})</> : <><Play size={16} /> ابدأ جلسة اليوم</>}
      </button>
    </div>
  );
}

// ===================== تدفّق «جلسة اليوم» المتدرّج =====================
// شاشةٌ واحدة تمشي بالخطوات بالترتيب. تُلتقط الخطوات مرّةً عند الفتح فلا تتزحزح
// أثناء الجلسة، وتُحفَظ لقطتُها على الجهاز فيُستأنف ما انقطع بدل البدء من الصفر.
export function TodaySessionFlow({ text, resume, onClose }: { text: string[]; resume: boolean; onClose: () => void }) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const todayStr = today();

  const [steps] = useState<SessionStep[]>(() => {
    const saved = resume ? loadSession(todayStr) : null;
    return saved ? saved.steps : buildTodayPlan(h, todayStr).steps;
  });
  const [idx, setIdx] = useState(() => (resume ? loadSession(todayStr)?.idx ?? 0 : 0));
  const [tally, setTally] = useState<SessionTally>(
    () => (resume ? loadSession(todayStr)?.tally : null) ?? { memorized: 0, reviewed: 0, mistakesClosed: 0 },
  );
  const [coach, setCoach] = useState<{ portion: Portion; mode: "memorize" | "recall"; title?: string; onDone: (r?: HifzRating) => void } | null>(null);

  const total = steps.length;
  const done = idx >= total;

  // كلّ تقدّمٍ يُثبَّت فوراً: إغلاق الشاشة أو الخروج من التطبيق لا يُضيّع الجلسة.
  function advance(nextTally?: SessionTally) {
    const t = nextTally ?? tally;
    const next = idx + 1;
    if (nextTally) setTally(nextTally);
    setIdx(next);
    if (next >= total) clearSession();
    else saveSession({ date: todayStr, steps, idx: next, tally: t });
  }

  function finish() {
    clearSession();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[65] bg-[#f4eee2] dark:bg-[#171009] flex flex-col" dir="rtl">
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

      {total > 0 && (
        <div className="h-1 bg-quran/10">
          <div className="h-full bg-quran transition-all" style={{ width: `${(Math.min(idx, total) / total) * 100}%` }} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-5">
        {done ? (
          <ResultScreen tally={tally} onClose={finish} />
        ) : (
          <StepView
            step={steps[idx]}
            text={text}
            onSkip={() => advance()}
            onGuided={(portion, mode, title, onDoneRating) => setCoach({ portion, mode, title, onDone: onDoneRating })}
            onMemorize={(portion, r) => { store.recordHifzSession(portion.toId, r); advance({ ...tally, memorized: tally.memorized + 1 }); }}
            onReview={(portion, r) => { store.recordReview(portion.fromId, portion.toId, r); advance({ ...tally, reviewed: tally.reviewed + 1 }); }}
            onTest={(portion, r) => { store.recordRandomTest(portion.fromId, portion.toId, r); advance({ ...tally, reviewed: tally.reviewed + 1 }); }}
            onDrill={(closed) => advance({ ...tally, mistakesClosed: tally.mistakesClosed + (closed ? 1 : 0) })}
          />
        )}
      </div>

      {coach && (
        <HifzCoach
          portion={coach.portion}
          text={text}
          mode={coach.mode}
          recallTitle={coach.title}
          onClose={() => setCoach(null)}
          onDone={(rating?: HifzRating) => { coach.onDone(rating); setCoach(null); }}
        />
      )}
    </div>
  );
}

const RECALL_META: Record<"recent" | "due" | "test", { title: string; hint: string; coachTitle: string }> = {
  recent: {
    title: "المراجعة القريبة",
    hint: "ثبّت آخر ما حفظت قبل أن يدخل جدول المباعدة.",
    coachTitle: "سمّع مراجعتك",
  },
  due: {
    title: "مراجعة مستحقّة",
    hint: "حان موعد هذا الوجه حسب جدولك — سمّعه ووسِم ما تعثّرت فيه.",
    coachTitle: "سمّع مراجعتك",
  },
  test: {
    title: "اختبار من القديم",
    hint: "وجهٌ طال عهدك به — نختبر ثباته لا أكثر.",
    coachTitle: "اختبار",
  },
};

function StepView({
  step, text, onSkip, onGuided, onMemorize, onReview, onTest, onDrill,
}: {
  step: SessionStep;
  text: string[];
  onSkip: () => void;
  onGuided: (portion: Portion, mode: "memorize" | "recall", title: string | undefined, onDone: (r?: HifzRating) => void) => void;
  onMemorize: (portion: Portion, r?: HifzRating) => void;
  onReview: (portion: Portion, r?: HifzRating) => void;
  onTest: (portion: Portion, r?: HifzRating) => void;
  onDrill: (closed: boolean) => void;
}) {
  if (step.kind === "drill") {
    return (
      <MistakeDrill
        key={step.mistakeId}
        mistakeId={step.mistakeId}
        ayahId={step.ayahId}
        wordIndex={step.wordIndex}
        word={step.word}
        text={text}
        onDone={(_ok, closed) => onDrill(closed)}
      />
    );
  }

  const { portion } = step;
  const isMemorize = step.kind === "memorize";
  const meta = isMemorize
    ? { title: "السَّبْق — حفظٌ جديد", hint: "احفظ وردك الجديد بتؤدة، ثمّ قيّم حفظك.", coachTitle: undefined as string | undefined }
    : RECALL_META[step.kind];
  const icon = isMemorize
    ? <Sprout size={16} className="text-quran" />
    : step.kind === "test"
    ? <Shuffle size={16} className="text-indigo-500" />
    : <RefreshCw size={16} className={step.kind === "due" ? "text-amber-600" : "text-quran"} />;

  const record = (r?: HifzRating) =>
    isMemorize ? onMemorize(portion, r) : step.kind === "test" ? onTest(portion, r) : onReview(portion, r);

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {icon}
        <span className="text-base font-bold text-gray-800 dark:text-gray-100">{meta.title}</span>
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
      <p className="text-xs text-gray-500 leading-relaxed">{meta.hint}</p>

      {/* في التسميع لا يُكشف النصّ — لكنّ الوجه يُعرض والمقطع مستورٌ في موضعه
          منه: ترى **أين** مراجعة اليوم من المصحف قبل أن تسمّع، وهو نصفُ
          التذكّر. الكشف يبقى داخل المُدرّب. */}
      {isMemorize ? (
        <PortionBlock text={text} portion={portion} />
      ) : (
        <MushafSheet text={text} fromId={portion.fromId} toId={portion.toId} hidden={() => true} maxHeight={280} />
      )}
      <MutashabihatAlert portion={portion} />

      <button
        onClick={() => onGuided(portion, isMemorize ? "memorize" : "recall", meta.coachTitle, record)}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold press shadow-sm ${isMemorize ? "bg-quran text-white" : "bg-quran text-white"}`}
      >
        {isMemorize ? <><GraduationCap size={17} /> احفظ بطريقة موجّهة</> : <><Headphones size={16} /> ابدأ التسميع</>}
      </button>

      {isMemorize && (
        <div>
          <div className="text-[11px] text-gray-500 mb-1.5 text-center">أو سجّل مباشرةً — قيّم حفظك:</div>
          <RatingRow onRate={(r) => onMemorize(portion, r)} />
        </div>
      )}

      <button onClick={onSkip} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 py-2 press">
        تخطَّ هذه الخطوة <ChevronLeft size={14} />
      </button>
    </div>
  );
}

function ResultScreen({ tally, onClose }: { tally: SessionTally; onClose: () => void }) {
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

// ورد اليوم يُعرض في وجهه من المصحف لا مقتطعاً في صندوق: تراه حيث ستراه في
// المصحف الورقيّ، فتبدأ الذاكرة التصويرية عملها من أوّل نظرة.
function PortionBlock({ text, portion }: { text: string[]; portion: Portion }) {
  return <MushafSheet text={text} fromId={portion.fromId} toId={portion.toId} maxHeight={320} />;
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
