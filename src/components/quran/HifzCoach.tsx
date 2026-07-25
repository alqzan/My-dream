"use client";
import { useState, useMemo } from "react";
import { idToSurahAyah, describeRange } from "@/lib/quran/meta";
import { textsInRange } from "@/lib/quran/text";
import {
  mistakesForAyah, gradeFromMistakes, explainGrade, countDays,
  openMistakesInRange, marksTodayInRange, markedToday,
  RATING_LABEL, type Portion,
} from "@/lib/quran/hifz";
import { presetOf } from "@/lib/quran/intensity";
import { nextDueDays } from "@/lib/quran/schedule";
import { MutashabihatAlert } from "@/components/quran/MutashabihatAlert";
import { LeadPrompt } from "@/components/quran/LeadPrompt";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ, type HifzMistake, type HifzRating } from "@/lib/types";
import { today } from "@/lib/utils";
import {
  X, Repeat, Eye, EyeOff, Check, ChevronLeft, Link2, CornerDownLeft, MousePointerClick,
  CalendarClock, SlidersHorizontal, Undo2,
} from "lucide-react";

// المُدرّب الموجّه — يقود الحفظ آيةً آية: تكرارٌ بعدد مرّاتٍ تحدّده شدّة التمرين،
// ثم تسميعٌ بتلقين الآية السابقة، ثم «أتقنتها» للانتقال، وأخيراً مرحلة ربطٍ
// للمقطع كله. له وضعان: memorize (تكرار+تسميع) للورد، وrecall (تسميع) للمراجعة.
//
// في وضع التسميع لا نسأل «كيف كانت مراجعتك؟» بعد أن وسمتَ مواضع تعثّرك — بل
// يُشتقّ التقييم من عددها ويُعرض سببُه وموعدُ المراجعة القادمة، ولك أن تخالفه.
export function HifzCoach({
  portion, text, mode, onDone, onClose, recallTitle = "سمّع مراجعتك",
}: {
  portion: Portion;
  text: string[];
  mode: "memorize" | "recall";
  onDone: (rating?: HifzRating) => void;
  onClose: () => void;
  recallTitle?: string; // عنوان شاشة التسميع (مراجعة/اختبار مفاجئ)
}) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const ayat = textsInRange(text, portion.fromId, portion.toId).map((r) => ({
    id: r.id, no: idToSurahAyah(r.id).ayah, text: r.text,
  }));

  const repTarget = presetOf(h.plan).reps;

  // memorize: نمرّ آيةً آية. recall: شاشة واحدة للمقطع كله.
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"repeat" | "recall" | "link">(mode === "recall" ? "recall" : "repeat");
  const [reps, setReps] = useState(0);
  const [revealed, setRevealed] = useState(mode === "recall" ? false : true);

  const cur = ayat[idx];
  const isLast = idx >= ayat.length - 1;

  // مواضع المقطع المفتوحة، ومنها ما وُسم اليوم — مقروءةً من الحالة المحفوظة لا
  // من لقطةٍ في الذاكرة، فما تراه على النصّ هو نفسه ما يُشتقّ منه التقييم.
  const todayStr = today();
  const openHere = openMistakesInRange(h, portion.fromId, portion.toId);
  const marksToday = marksTodayInRange(h, portion.fromId, portion.toId, todayStr);

  function nextAyah() {
    if (isLast) { setPhase("link"); return; }
    setIdx((i) => i + 1); setReps(0); setPhase("repeat"); setRevealed(true);
  }

  // ---- recall mode (مراجعة): تلقينٌ بالآية السابقة ثم سمّع المقطع ثم اكشف ----
  // عند الكشف: الكلمات قابلة للضغط لتحديد مواضع الخطأ (تتلوّن بالأحمر وتُحفظ).
  if (mode === "recall") {
    return (
      <Shell title={recallTitle} subtitle={describeRange(portion.fromId, portion.toId)} onClose={onClose}>
        <LeadPrompt text={text} targetId={portion.fromId} />
        {!revealed ? (
          <>
            <HiddenBox label="سمّع المقطع من حفظك…" />
            <button onClick={() => setRevealed(true)} className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press">
              <Eye size={16} /> اكشف للتحقّق
            </button>
          </>
        ) : (
          <>
            <div className="text-[11px] text-gray-400 text-center mb-2 flex items-center justify-center gap-1">
              <MousePointerClick size={12} /> اضغط أيّ كلمةٍ أخطأت فيها — واضغطها ثانيةً للتراجع
            </div>
            <MarkableAyatBlock ayat={ayat} today={todayStr} onToggle={store.toggleMistakeWord} />
            <SpotStrip items={openHere} today={todayStr} onClear={store.resolveMistake} />
            <div className="mt-3">
              <MutashabihatAlert portion={portion} compact />
            </div>
            <GradeVerdict portion={portion} marks={marksToday} ayatCount={ayat.length} onDone={onDone} />
          </>
        )}
      </Shell>
    );
  }

  // ---- memorize mode (ورد): آيةً آية ----
  return (
    <Shell
      title="احفظ بطريقة موجّهة"
      subtitle={`${describeRange(portion.fromId, portion.toId)} · آية ${idx + 1}/${ayat.length}`}
      onClose={onClose}
      progress={(idx + (phase === "link" ? 1 : 0)) / ayat.length}
    >
      {phase === "link" ? (
        <>
          <div className="text-center text-[11px] font-semibold text-quran mb-2 flex items-center justify-center gap-1"><Link2 size={13} /> اربط المقطع كاملاً</div>
          <p className="text-[11px] text-gray-400 text-center mb-3">اقرأ المقطع كله مرّةً موصولاً لتثبيت الربط بين الآيات.</p>
          <AyatBlock ayat={ayat} />
          <div className="mt-4">
            <div className="text-[11px] text-gray-500 text-center mb-1.5">كيف تقيّم حفظك للورد؟</div>
            <RatingRow onRate={(r) => onDone(r)} />
            <button onClick={() => onDone()} className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 press py-1.5">أنهيت بلا تقييم</button>
          </div>
        </>
      ) : phase === "repeat" ? (
        <>
          <div className="text-center text-[11px] font-semibold text-quran mb-3 flex items-center justify-center gap-1"><Repeat size={13} /> كرّر الآية حتى تألفها</div>
          <AyatBlock ayat={[cur]} big />
          <div className="mt-3"><MutashabihatAlert portion={{ fromId: cur.id, toId: cur.id }} compact /></div>
          <RepsDots reps={reps} target={repTarget} />
          <button
            onClick={() => setReps((r) => r + 1)}
            className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press"
          >
            <Repeat size={15} /> كرّرت ({reps}/{repTarget})
          </button>
          <div className="flex items-center justify-between mt-3">
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <SlidersHorizontal size={11} /> عدد التكرار من شدّة التمرين
            </span>
            <button
              onClick={() => { setPhase("recall"); setRevealed(false); }}
              disabled={reps < repTarget}
              className="text-xs font-semibold text-quran disabled:opacity-40 press flex items-center gap-1"
            >
              انتقل للتسميع <ChevronLeft size={14} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="text-center text-[11px] font-semibold text-quran mb-3 flex items-center justify-center gap-1"><CornerDownLeft size={13} /> سمّع الآية التالية من حفظك</div>
          <LeadPrompt text={text} targetId={cur.id} />
          {revealed ? <AyatBlock ayat={[cur]} big /> : <HiddenBox label="سمّع من حفظك…" />}
          <div className="flex gap-2 mt-4">
            <button onClick={() => setRevealed((v) => !v)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-quran/10 text-quran font-semibold press">
              {revealed ? <><EyeOff size={15} /> أخفِ</> : <><Eye size={15} /> تحقّق</>}
            </button>
            <button onClick={nextAyah} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-quran text-white font-bold press">
              <Check size={15} /> {isLast ? "أتقنت — للربط" : "أتقنتها"}
            </button>
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({
  title, subtitle, onClose, progress, children,
}: {
  title: string; subtitle?: string; onClose: () => void; progress?: number; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] bg-[#f4eee2] dark:bg-[#171009] flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 dark:border-[#3a2e1e]">
        <div>
          <div className="text-sm font-bold text-gray-800">{title}</div>
          {subtitle && <div className="text-[11px] text-quran font-semibold mt-0.5">{subtitle}</div>}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 press" aria-label="إغلاق"><X size={20} /></button>
      </div>
      {progress != null && (
        <div className="h-1 bg-gray-100 dark:bg-[#2c2318]">
          <div className="h-full bg-quran transition-all duration-500" style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} />
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 pt-8 pb-6 max-w-lg w-full mx-auto">
        <div>{children}</div>
      </div>
    </div>
  );
}

function AyatBlock({ ayat, big }: { ayat: { id: number; no: number; text: string }[]; big?: boolean }) {
  return (
    <div className="rounded-2xl border border-quran/15 bg-white dark:bg-[#241c12] p-5 min-h-[100px] flex items-center justify-center">
      <p className={`font-quran text-center font-bold text-gray-800 dark:text-gray-100 ${big ? "text-[26px] leading-[2.5]" : "text-[21px] leading-[2.3]"}`} dir="rtl">
        {ayat.map((a) => (
          <span key={a.id}>{a.text}<span className="text-quran text-[13px] align-middle mx-0.5">﴿{a.no}﴾</span>{" "}</span>
        ))}
      </p>
    </div>
  );
}

// ===================== حُكم المراجعة المشتقّ =====================
// بدل سؤال «كيف كانت مراجعتك؟» نعرض ما استنتجناه من وسمك: التقييم، وسببه
// بجملةٍ صريحة، وموعد المراجعة القادمة إن سجّلتَه — مع «غيّر التقييم» لمن رأى
// أنّ تعثّره كان لحناً عابراً لا نسياناً.
function GradeVerdict({
  portion, marks, ayatCount, onDone,
}: {
  portion: Portion; marks: number; ayatCount: number; onDone: (r?: HifzRating) => void;
}) {
  const h = useAppStore((s) => s.quranHifz) ?? EMPTY_HIFZ;
  const [override, setOverride] = useState<HifzRating | null>(null);
  const [editing, setEditing] = useState(false);
  const derived = gradeFromMistakes(marks, ayatCount);
  const rating = override ?? derived;
  const todayStr = today();
  const days = useMemo(
    () => nextDueDays(h, portion, rating, todayStr),
    [h, portion, rating, todayStr],
  );

  const tone: Record<HifzRating, string> = {
    3: "border-quran/30 bg-quran/[0.07] text-quran",
    2: "border-amber-300 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-300",
    1: "border-red-300 dark:border-red-900/50 bg-red-50 dark:bg-red-900/15 text-red-600 dark:text-red-400",
  };

  return (
    <div className="mt-4 space-y-2.5">
      <div className={`rounded-2xl border p-3.5 text-center space-y-1 ${tone[rating]}`}>
        <div className="text-base font-bold">{RATING_LABEL[rating]}</div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400">
          {override ? "تقييمك أنت" : explainGrade(marks, ayatCount)}
        </div>
        <div className="text-[11px] font-semibold flex items-center justify-center gap-1 pt-0.5">
          <CalendarClock size={12} /> موعدها القادم {countDays(days)}
        </div>
      </div>

      <button
        onClick={() => onDone(rating)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press shadow-sm"
      >
        <Check size={16} /> سجّل المراجعة
      </button>

      {editing ? (
        <div>
          <div className="text-[11px] text-gray-500 text-center mb-1.5">اختر تقييمك:</div>
          <RatingRow onRate={(r) => { setOverride(r); setEditing(false); }} />
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="w-full text-[11px] text-gray-400 hover:text-gray-600 press py-1"
        >
          لستَ موافقاً؟ غيّر التقييم
        </button>
      )}
    </div>
  );
}

// كتلة آياتٍ قابلة للتحديد: كلُّ كلمةٍ زرٌّ يبدّل وسمها كخطأ، وكلُّ آيةٍ لها زرٌّ
// (رقمها) لوسمها كاملةً.
//
// اللونان مقصودان: الأحمرُ تعثُّرُ *اليوم*، والكهرمانيُّ الباهت وسمٌ سابق لم
// يُغلَق بعد. كان اللون واحداً فيظنّ المستخدم أنّ الوسم القديم خطأٌ سجّله الآن،
// ويضغطه ليُزيله — فتُضاف ضربةٌ جديدة (عكس المقصود) ويبقى ملوّناً، فيبدو أنّ
// الضغط لا يفعل شيئاً. الإزالة الصريحة صارت في SpotStrip أسفل النصّ.
function MarkableAyatBlock({
  ayat, today: todayStr, onToggle,
}: {
  ayat: { id: number; no: number; text: string }[];
  today: string;
  onToggle: (ayahId: number, wordIndex: number | null, word?: string) => void;
}) {
  const h = useAppStore((s) => s.quranHifz) ?? EMPTY_HIFZ;
  return (
    <div className="rounded-2xl border border-quran/15 bg-white dark:bg-[#241c12] p-5 min-h-[100px]">
      <p className="font-quran text-center font-bold text-gray-800 dark:text-gray-100 text-[21px] leading-[2.5]" dir="rtl">
        {ayat.map((a) => {
          const marks = mistakesForAyah(h, a.id);
          const ayahMark = marks.get("all");
          const ayahNow = ayahMark != null && markedToday(ayahMark, todayStr);
          const words = a.text.split(/\s+/).filter(Boolean);
          return (
            <span
              key={a.id}
              className={
                ayahMark
                  ? ayahNow
                    ? "rounded-md bg-red-500/10 ring-1 ring-red-400/60 px-0.5"
                    : "rounded-md bg-amber-400/10 ring-1 ring-amber-400/40 px-0.5"
                  : undefined
              }
            >
              {words.map((w, i) => {
                const mk = marks.get(i);
                const now = mk != null && markedToday(mk, todayStr);
                const repeats = mk ? mk.hits.length : 0;
                return (
                  <span key={i}>
                    <button
                      type="button"
                      onClick={() => onToggle(a.id, i, w)}
                      aria-pressed={now}
                      title={mk && !now ? "موضعٌ سابق لم يُغلق — اضغط إن تعثّرتَ فيه اليوم أيضاً" : undefined}
                      className={`press align-middle transition-colors ${
                        mk
                          ? now
                            ? "text-red-600 dark:text-red-400 underline decoration-red-400 decoration-2 underline-offset-4"
                            : "text-amber-700 dark:text-amber-400 underline decoration-amber-400/70 decoration-dotted decoration-2 underline-offset-4"
                          : "hover:text-quran"
                      }`}
                    >
                      {w}
                      {repeats >= 2 && (
                        <sup className={`text-[10px] font-sans font-bold mx-0.5 ${now ? "text-red-500" : "text-amber-600"}`}>{repeats}</sup>
                      )}
                    </button>{" "}
                  </span>
                );
              })}
              <button
                type="button"
                onClick={() => onToggle(a.id, null)}
                title="وسم الآية كاملةً كخطأ"
                className={`inline-flex items-center justify-center text-[13px] mx-0.5 align-middle press ${
                  ayahMark ? (ayahNow ? "text-red-500" : "text-amber-600") : "text-quran"
                }`}
              >
                ﴿{a.no}﴾
              </button>{" "}
            </span>
          );
        })}
      </p>
    </div>
  );
}

// ===================== مواضع هذا المقطع (وإزالتها) =====================
// كان الوسمُ القديم لا يُزال إلا من لوحة «أخطائي» في أسفل صفحةٍ أخرى — أمّا في
// شاشة التسميع فضغطُ الكلمة الملوّنة يُضيف ضربةً جديدة لا يُزيلها، فلا سبيل لمن
// وسَم موضعاً بالخطأ (أو أتقنه اليوم) أن يمحوه من حيث هو. هذه اللائحة تعرض كلَّ
// موضعٍ مفتوحٍ على المقطع الذي تسمّعه، ولكلٍّ زرُّ إزالة: «أتقنته» يُغلق الموضع
// فيختفي من التسميع ومن اختبار مواضع الخطأ، ويهبط عدد المواضع فيتحدّث التقييم
// المشتقّ فوراً. الإغلاق لا يمحو تاريخ التعثّر (يبقى في السجلّ) — لذا هو أسلمُ
// من الحذف النهائي، وهو الأصلحُ للمزامنة أيضاً.
function SpotStrip({
  items, today: todayStr, onClear,
}: {
  items: HifzMistake[]; today: string; onClear: (id: string) => void;
}) {
  if (!items.length) return null;
  const older = items.filter((m) => !markedToday(m, todayStr)).length;
  return (
    <div className="mt-3 rounded-2xl border border-gray-100 dark:border-[#3a2e1e] bg-white/70 dark:bg-[#241c12] p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">مواضع هذا المقطع</span>
        <span className="text-[10px] text-gray-400">
          {older > 0 ? "الأحمر تعثّرُ اليوم · الكهرمانيّ موضعٌ سابق لم يُغلق" : "اضغط «أتقنته» لإزالة موضع"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((m) => {
          const now = markedToday(m, todayStr);
          const { ayah } = idToSurahAyah(m.ayahId);
          return (
            <span
              key={m.id}
              className={`inline-flex items-center gap-1 rounded-full ps-2 pe-1 py-1 border text-[11px] ${
                now
                  ? "border-red-300 dark:border-red-900/50 bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-300"
                  : "border-amber-300 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/15 text-amber-800 dark:text-amber-300"
              }`}
            >
              <span className="font-semibold">
                {m.wordIndex == null ? `آية ${ayah} كاملة` : <span className="font-quran text-[13px]">{m.word || `آية ${ayah}`}</span>}
              </span>
              {m.hits.length >= 2 && <span className="font-sans font-bold opacity-70">×{m.hits.length}</span>}
              <button
                type="button"
                onClick={() => onClear(m.id)}
                title="أتقنته — أزِل هذا الموضع"
                aria-label={`أتقنته — أزِل موضع ${m.wordIndex == null ? `آية ${ayah}` : m.word ?? ""}`}
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold press bg-white/70 dark:bg-white/5 hover:bg-white"
              >
                <Undo2 size={11} /> أتقنته
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// صندوق مكان الآية المخفيّة أثناء التسميع.
function HiddenBox({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-quran/30 bg-quran/[0.03] p-5 min-h-[100px] flex items-center justify-center">
      <span className="text-sm text-gray-400 flex items-center gap-1.5"><EyeOff size={15} /> {label}</span>
    </div>
  );
}

function RepsDots({ reps, target }: { reps: number; target: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mt-3">
      {Array.from({ length: target }, (_, i) => (
        <span key={i} className={`w-2 h-2 rounded-full transition-colors ${i < reps ? "bg-quran" : "bg-gray-200 dark:bg-[#3a2e1e]"}`} />
      ))}
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
        <button key={it.r} onClick={() => onRate(it.r)} className={`flex-1 text-xs font-bold rounded-lg py-2.5 press ${it.cls}`}>{it.label}</button>
      ))}
    </div>
  );
}
