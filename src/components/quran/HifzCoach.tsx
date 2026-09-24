"use client";
import { useState } from "react";
import { idToSurahAyah, idToPage, describeRange } from "@/lib/quran/meta";
import { textsInRange } from "@/lib/quran/text";
import {
  mistakesForAyah, explainGrade, countDays, gradeByPage, worstGrade, bridgeBefore,
  openMistakesInRange, markedToday,
  RATING_LABEL, type Portion, type RatedPart, type GradedPart,
} from "@/lib/quran/hifz";
import { presetOf } from "@/lib/quran/intensity";
import { nextDueDays } from "@/lib/quran/schedule";
import { leadOnPage } from "@/lib/quran/portionPage";
import { MutashabihatAlert } from "@/components/quran/MutashabihatAlert";
import { MushafSheet, AyahNumber, type SheetAyah, type SheetPart } from "@/components/quran/MushafSheet";
import { tokenizeRun } from "@/lib/quran/mushafLayout";
import { LeadPrompt } from "@/components/quran/LeadPrompt";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ, type HifzMistake, type HifzRating } from "@/lib/types";
import { today } from "@/lib/utils";
import {
  X, Repeat, Eye, EyeOff, Check, ChevronLeft, Link2, CornerDownLeft, MousePointerClick,
  CalendarClock, SlidersHorizontal, Undo2, Footprints, Headphones,
} from "lucide-react";
import { arNum } from "@/lib/madar/format";

// المُدرّب الموجّه — يقود الحفظ آيةً آية: تكرارٌ بعدد مرّاتٍ تحدّده شدّة التمرين،
// ثم تلميحٌ بأوائل الأسطر، ثم تسميعٌ بتلقين الآية السابقة، ثم «أتقنتها» للانتقال،
// ثم ربطٌ للمقطع كله، **ثمّ تسميعُه كاملاً مستوراً** يُشتقّ منه تقييمُ الورد. له
// وضعان: memorize للورد، وrecall (تسميع) للمراجعة.
//
// **كلّ نصٍّ هنا يُعرض في وجهه من المصحف** (`MushafSheet`): الآية في موضعها من
// اللوح، وحولها سياقُ وجهها، والوجهُ برقمه وجهته. الحفظ من آياتٍ مجرّدةٍ من
// وجهها يهدم الذاكرة التصويرية — وهي ما يستند إليه الحافظ حين يتعثّر: «الآية في
// أعلى اليمنى بعد آية كذا». والسترُ يُبقي أثر الآية في موضعها فلا تضيع الصورة
// أثناء الاسترجاع.
//
// لا نسأل «كيف كانت مراجعتك؟» بعد أن وسمتَ مواضع تعثّرك — بل يُشتقّ التقييم من
// عددها **لكلّ وجهٍ على حدة** ويُعرض سببُه وموعدُ المراجعة القادمة، ولك أن
// تخالفه. وكذا الورد الجديد (٠٫١٫٤٥٧): كان «أتقنتها» ضغطةً بلا اختبار، والتقييمُ
// في آخره اختيارياً بجانبه «أنهيت بلا تقييم» — فيدخل الجدولَ وجهٌ لم يُختبَر قطّ.
//
// **وقبل الورد جسرٌ** (`bridgeBefore`): تُسمَّع آخرُ آياتٍ محفوظة ثمّ تبدأ، ويُقرأ
// الربطُ موصولاً منها — فالحدّ بين ورد أمس واليوم هو أكثرُ مواضع الانقطاع.
type MemorizePhase = "bridge" | "repeat" | "cue" | "recall" | "link" | "final";

export function HifzCoach({
  portion, text, mode, onDone, onClose, recallTitle = "سمّع مراجعتك",
}: {
  portion: Portion;
  text: string[];
  mode: "memorize" | "recall";
  /** ما يُسجَّل: قيدٌ لكلّ جزءٍ اختلف تقييمُه (راجع `gradeByPage`). */
  onDone: (parts: RatedPart[]) => void;
  onClose: () => void;
  recallTitle?: string; // عنوان شاشة التسميع (مراجعة/اختبار مفاجئ)
}) {
  const quranHifz = useAppStore((s) => s.quranHifz);
  const h = quranHifz ?? EMPTY_HIFZ;
  const ayat = textsInRange(text, portion.fromId, portion.toId).map((r) => ({
    id: r.id, no: idToSurahAyah(r.id).ayah, text: r.text,
  }));

  const repTarget = presetOf(h.plan).reps;
  // الجسرُ يُلتقط مرّةً عند الفتح: الجبهةُ تتقدّم عند التسجيل ولا يتزحزح الجسر.
  const [bridge] = useState(() => (mode === "memorize" ? bridgeBefore(h, portion) : null));

  // memorize: نمرّ آيةً آية. recall: شاشة واحدة للمقطع كله.
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<MemorizePhase>(bridge ? "bridge" : "repeat");
  const [reps, setReps] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const cur = ayat[idx];
  const isLast = idx >= ayat.length - 1;

  function nextAyah() {
    if (isLast) { setPhase("link"); return; }
    setIdx((i) => i + 1); setReps(0); setPhase("repeat"); setRevealed(false);
  }

  // ---- recall mode (مراجعة): تلقينٌ بالآية السابقة ثم سمّع المقطع ثم اكشف ----
  if (mode === "recall") {
    return (
      <Shell title={recallTitle} subtitle={describeRange(portion.fromId, portion.toId)} onClose={onClose}>
        <RecallStage portion={portion} text={text} onDone={onDone} />
      </Shell>
    );
  }

  // ---- memorize mode (ورد): جسرٌ ← آيةً آية ← ربطٌ ← تسميعٌ كامل ----
  const linkFrom = bridge?.fromId ?? portion.fromId;
  const progress = phase === "bridge" ? 0 : phase === "link" || phase === "final" ? 1 : idx / ayat.length;
  return (
    <Shell
      title="احفظ بطريقة موجّهة"
      subtitle={
        phase === "bridge" || phase === "link" || phase === "final"
          ? describeRange(portion.fromId, portion.toId)
          : `${describeRange(portion.fromId, portion.toId)} · آية ${arNum(idx + 1)}/${arNum(ayat.length)}`
      }
      onClose={onClose}
      progress={progress}
    >
      {phase === "bridge" && bridge ? (
        <>
          <PhaseLabel icon={<Footprints size={13} />}>صِل بما قبله</PhaseLabel>
          <p className="text-[11px] text-gray-400 text-center mb-3">سمّع آخرَ ما حفظت قبل أن تبدأ — الحدُّ بين الوردين أكثرُ مواضع الانقطاع.</p>
          <MushafSheet
            text={text}
            fromId={bridge.fromId}
            toId={bridge.toId}
            context={revealed ? "text" : "shape"}
            leadId={leadOnPage(bridge.fromId)}
            hidden={() => !revealed}
            className="hifz-mushaf-stage" expandable
          />
          <div className="flex gap-2 mt-4">
            <button onClick={() => setRevealed((v) => !v)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-quran/10 text-quran font-semibold press">
              {revealed ? <><EyeOff size={15} /> أخفِ</> : <><Eye size={15} /> تحقّق</>}
            </button>
            <button onClick={() => { setPhase("repeat"); setRevealed(false); }} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-quran text-white font-bold press">
              ابدأ الورد <ChevronLeft size={15} />
            </button>
          </div>
        </>
      ) : phase === "final" ? (
        <>
          <PhaseLabel icon={<Headphones size={13} />}>سمّع الورد كاملاً</PhaseLabel>
          <RecallStage portion={portion} text={text} onDone={onDone} memorize />
        </>
      ) : phase === "link" ? (
        <>
          <PhaseLabel icon={<Link2 size={13} />}>اربط المقطع كاملاً</PhaseLabel>
          <p className="text-[11px] text-gray-400 text-center mb-3">
            {bridge ? "اقرأه موصولاً بما قبله مرّةً لتثبيت الربط، ثمّ سمّعه من حفظك." : "اقرأ المقطع كله مرّةً موصولاً، ثمّ سمّعه من حفظك."}
          </p>
          <MushafSheet text={text} fromId={linkFrom} toId={portion.toId} className="hifz-mushaf-stage" expandable />
          <button onClick={() => setPhase("final")} className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press">
            <Headphones size={16} /> سمّع الورد كاملاً
          </button>
        </>
      ) : phase === "repeat" ? (
        <>
          <PhaseLabel icon={<Repeat size={13} />}>كرّر الآية حتى تألفها</PhaseLabel>
          {/* الآية مُبرَزةٌ في وجهها والباقي خافت: تحفظها وأنت ترى أين تقع من
              الوجه — لا مقتطعةً في صندوق. */}
          <MushafSheet text={text} fromId={cur.id} toId={cur.id} spotlightId={cur.id} className="hifz-mushaf-stage" expandable />
          <div className="mt-3"><MutashabihatAlert portion={{ fromId: cur.id, toId: cur.id }} compact /></div>
          <RepsDots reps={reps} target={repTarget} />
          <button
            onClick={() => setReps((r) => r + 1)}
            className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press"
          >
            <Repeat size={15} /> كرّرت ({arNum(reps)}/{arNum(repTarget)})
          </button>
          <div className="flex items-center justify-between mt-3">
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <SlidersHorizontal size={11} /> عدد التكرار من شدّة التمرين
            </span>
            <button
              onClick={() => setPhase("cue")}
              disabled={reps < repTarget}
              className="text-xs font-semibold text-quran disabled:opacity-40 press flex items-center gap-1"
            >
              اقرأ بالتلميح <ChevronLeft size={14} />
            </button>
          </div>
        </>
      ) : phase === "cue" ? (
        <>
          {/* الجسرُ بين النظر والاستظهار: أوّلُ كلمةٍ من كلّ سطرٍ ظاهرةٌ والباقي
              مستور في موضعه — تقرأ الآية من حفظك وصورةُ أسطرها أمامك. */}
          <PhaseLabel icon={<EyeOff size={13} />}>اقرأها بأوائل الأسطر</PhaseLabel>
          <MushafSheet
            text={text}
            fromId={cur.id}
            toId={cur.id}
            spotlightId={cur.id}
            renderAyah={revealed ? undefined : renderCue}
            className="hifz-mushaf-stage" expandable
          />
          <div className="flex gap-2 mt-4">
            <button onClick={() => setRevealed((v) => !v)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-quran/10 text-quran font-semibold press">
              {revealed ? <><EyeOff size={15} /> أخفِ</> : <><Eye size={15} /> اكشف</>}
            </button>
            <button onClick={() => { setPhase("recall"); setRevealed(false); }} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-quran text-white font-bold press">
              للتسميع <ChevronLeft size={15} />
            </button>
          </div>
        </>
      ) : (
        <>
          <PhaseLabel icon={<CornerDownLeft size={13} />}>سمّع الآية من حفظك</PhaseLabel>
          {leadOnPage(cur.id) == null && <LeadPrompt text={text} targetId={cur.id} />}
          {/* مستورةٌ في موضعها من الوجه — لا صندوقٌ فارغ خارج المصحف. */}
          <MushafSheet
            text={text}
            fromId={cur.id}
            toId={cur.id}
            spotlightId={cur.id}
            context={revealed ? "text" : "shape"}
            leadId={leadOnPage(cur.id)}
            hidden={() => !revealed}
            className="hifz-mushaf-stage" expandable
          />
          <div className="flex gap-2 mt-4">
            <button onClick={() => setRevealed((v) => !v)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-quran/10 text-quran font-semibold press">
              {revealed ? <><EyeOff size={15} /> أخفِ</> : <><Eye size={15} /> تحقّق</>}
            </button>
            <button onClick={nextAyah} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-quran text-white font-bold press">
              <Check size={15} /> {isLast ? "التالي — للربط" : "الآية التالية"}
            </button>
          </div>
        </>
      )}
    </Shell>
  );
}

function PhaseLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="hifz-phase-label text-center text-[11px] font-semibold text-quran mb-3 flex items-center justify-center gap-1">
      {icon} {children}
    </div>
  );
}

// أوّلُ كلمةٍ من كلّ سطرٍ تبقى، وما بعدها مستورٌ بعرضه (`mushaf-veil`) فلا يتزحزح
// السطر. `renderAyah` يُنادى لكلّ مقطعٍ من الآية على سطره، فـ«أوّل كلمةٍ في المقطع»
// هي أوّلُ كلمةٍ في السطر — إلا أن تبدأ الآيةُ وسطه، فهي أوّلُ كلمات الآية فيه.
function renderCue(_a: SheetAyah, part: SheetPart) {
  let shown = false;
  return tokenizeRun(part.text, part.wordOffset).map((t, k) => {
    if (t.index == null) return <span key={k}>{t.text}</span>;
    if (!shown) { shown = true; return <span key={k}>{t.text}</span>; }
    return <span key={k} className="mushaf-veil">{t.text}</span>;
  });
}

// ===================== التسميعُ المستور ثمّ الحكم =====================
// مشتركٌ بين المراجعة وآخرِ مراحل الحفظ: المقطع مستورٌ **في وجهه**، تسمّع، تكشف،
// تسِم مواضعَ تعثّرك على الكلمات، فيخرج الحكمُ لكلّ وجهٍ من مواضعه هو.
function RecallStage({
  portion, text, onDone, memorize = false,
}: {
  portion: Portion; text: string[]; onDone: (parts: RatedPart[]) => void; memorize?: boolean;
}) {
  const h = useAppStore((s) => s.quranHifz) ?? EMPTY_HIFZ;
  const resolveMistake = useAppStore((s) => s.resolveMistake);
  const toggleMistakeWord = useAppStore((s) => s.toggleMistakeWord);
  const [revealed, setRevealed] = useState(false);
  const todayStr = today();
  const recallLeadId = leadOnPage(portion.fromId);
  // مواضع المقطع المفتوحة، ومنها ما وُسم اليوم — مقروءةً من الحالة المحفوظة لا
  // من لقطةٍ في الذاكرة، فما تراه على النصّ هو نفسه ما يُشتقّ منه التقييم.
  const openHere = openMistakesInRange(h, portion.fromId, portion.toId);

  return (
    <>
      <div className="hifz-mode-intro">
        <span className="hifz-mode-intro-mark"><EyeOff size={13} /></span>
        <div>
          <strong>استرجاع من الذاكرة</strong>
          <span>سمّع أولًا، ثم اكشف وعلّم مواضع التعثّر.</span>
        </div>
      </div>
      {/* التلقين المرسوم يغني عن بطاقته: الآية السابقة ظاهرةٌ في موضعها من
          الوجه. فإن بدأ المقطعُ الوجهَ فلا سابقةَ على الورقة — فتُعرض. */}
      {recallLeadId == null && <LeadPrompt text={text} targetId={portion.fromId} />}
      {!revealed ? (
        <>
          <MushafSheet
            text={text}
            fromId={portion.fromId}
            toId={portion.toId}
            context="shape"
            leadId={recallLeadId}
            hidden={() => true}
            className="hifz-mushaf-stage" expandable
          />
          <p className="text-[11px] text-gray-400 text-center mt-2 flex items-center justify-center gap-1">
            <EyeOff size={12} /> سمّع المقطع من حفظك…
          </p>
          <button onClick={() => setRevealed(true)} className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press">
            <Eye size={16} /> اكشف للتحقّق
          </button>
        </>
      ) : (
        <>
          <div className="text-[11px] text-gray-400 text-center mb-2 flex items-center justify-center gap-1">
            <MousePointerClick size={12} /> اضغط أيّ كلمةٍ أخطأت فيها — واضغطها ثانيةً للتراجع
          </div>
          <MarkableSheet text={text} portion={portion} today={todayStr} onToggle={toggleMistakeWord} />
          <SpotStrip items={openHere} today={todayStr} onClear={resolveMistake} />
          <div className="mt-3">
            <MutashabihatAlert portion={portion} compact />
          </div>
          <GradeVerdict portion={portion} memorize={memorize} onDone={onDone} />
        </>
      )}
    </>
  );
}

function Shell({
  title, subtitle, onClose, progress, children,
}: {
  title: string; subtitle?: string; onClose: () => void; progress?: number; children: React.ReactNode;
}) {
  return (
    <div className="hifz-coach-shell fixed inset-0 z-[70] bg-[#f4eee2] dark:bg-[#171009] flex flex-col" dir="rtl">
      <div className="hifz-coach-header flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 dark:border-[#3a2e1e]">
        <div>
          <div className="text-sm font-bold text-gray-800 dark:text-gray-100">{title}</div>
          {subtitle && <div className="text-[11px] text-quran font-semibold mt-0.5">{subtitle}</div>}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 press" aria-label="إغلاق"><X size={20} /></button>
      </div>
      {progress != null && (
        <div className="hifz-coach-progress h-1 bg-gray-100 dark:bg-[#2c2318]">
          <div className="h-full bg-quran transition-all duration-500" style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} />
        </div>
      )}
      <div className="hifz-coach-body flex-1 overflow-y-auto px-4 pt-6 pb-8 w-full">
        <div className="hifz-coach-content">{children}</div>
      </div>
    </div>
  );
}

// ===================== حُكم المراجعة المشتقّ =====================
// بدل سؤال «كيف كانت مراجعتك؟» نعرض ما استنتجناه من وسمك: التقييم، وسببه
// بجملةٍ صريحة، وموعد المراجعة القادمة إن سجّلتَه — مع «غيّر التقييم» لمن رأى
// أنّ تعثّره كان لحناً عابراً لا نسياناً.
//
// **والحكمُ لكلّ وجهٍ على حدة** (`gradeByPage`): العنوانُ أضعفُها، وتحته سطرٌ لكلّ
// جزءٍ اختلف تقييمه، ويُسجَّل كلٌّ بتقييمه. والمخالفةُ اليدوية قرارٌ صريحٌ منك
// على المقطع كلّه.
function GradeVerdict({
  portion, memorize, onDone,
}: {
  portion: Portion; memorize: boolean; onDone: (parts: RatedPart[]) => void;
}) {
  const h = useAppStore((s) => s.quranHifz) ?? EMPTY_HIFZ;
  const [override, setOverride] = useState<HifzRating | null>(null);
  const [editing, setEditing] = useState(false);
  const todayStr = today();
  const parts = gradeByPage(h, portion, todayStr);
  const derived = worstGrade(parts);
  const rating = override ?? derived;
  const weakest: Portion = override ? portion : parts.find((p) => p.rating === derived) ?? portion;
  const days = nextDueDays(h, weakest, rating, todayStr);
  const split = !override && parts.length > 1;

  const tone: Record<HifzRating, string> = {
    3: "border-quran/30 bg-quran/[0.07] text-quran",
    2: "border-amber-300 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-300",
    1: "border-red-300 dark:border-red-900/50 bg-red-50 dark:bg-red-900/15 text-red-600 dark:text-red-400",
  };

  function record() {
    onDone(override
      ? [{ fromId: portion.fromId, toId: portion.toId, rating: override }]
      : parts.map(({ fromId, toId, rating: r }) => ({ fromId, toId, rating: r })));
  }

  return (
    <div className="mt-4 space-y-2.5">
      <div className={`rounded-2xl border p-3.5 text-center space-y-1 ${tone[rating]}`}>
        <div className="text-base font-bold">{split ? `أضعفُه: ${RATING_LABEL[rating]}` : RATING_LABEL[rating]}</div>
        {split ? (
          <ul className="text-[11px] text-gray-600 dark:text-gray-300 space-y-0.5">
            {parts.map((p) => (
              <li key={p.fromId}>
                {pagesLabel(p)} · <strong>{RATING_LABEL[p.rating]}</strong> · {explainGrade(p.marks, p.ayat)}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            {override ? "تقييمك أنت" : explainGrade(parts[0]?.marks ?? 0, parts[0]?.ayat ?? 0)}
          </div>
        )}
        <div className="text-[11px] font-semibold flex items-center justify-center gap-1 pt-0.5">
          <CalendarClock size={12} />
          {memorize
            ? "يدخل المراجعةَ القريبة من الغد"
            : `${split ? "موعدُ أضعفِه" : "موعدها القادم"} ${countDays(days)}`}
        </div>
      </div>

      <button
        onClick={record}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press shadow-sm"
      >
        <Check size={16} /> {memorize ? "سجّل الحفظ" : "سجّل المراجعة"}
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

function pagesLabel(p: GradedPart): string {
  const a = idToPage(p.fromId), b = idToPage(p.toId);
  return a === b ? `وجه ${arNum(a)}` : `الأوجه ${arNum(a)}–${arNum(b)}`;
}

// لوحُ الوجه وآياتُ المقطع فيه **قابلة للتحديد**: كلُّ كلمةٍ زرٌّ يبدّل وسمها
// كخطأ، وكلُّ آيةٍ لها زرٌّ (رقمها) لوسمها كاملةً. الوسم يقع على الصورة التي
// حفظتَ عليها، فتبقى في ذهنك مقترنةً بموضعها من الوجه.
//
// اللونان مقصودان: الأحمرُ تعثُّرُ *اليوم*، والكهرمانيُّ الباهت وسمٌ سابق لم
// يُغلَق بعد. كان اللون واحداً فيظنّ المستخدم أنّ الوسم القديم خطأٌ سجّله الآن،
// ويضغطه ليُزيله — فتُضاف ضربةٌ جديدة (عكس المقصود) ويبقى ملوّناً، فيبدو أنّ
// الضغط لا يفعل شيئاً. الإزالة الصريحة صارت في SpotStrip أسفل النصّ.
function MarkableSheet({
  text, portion, today: todayStr, onToggle,
}: {
  text: string[];
  portion: Portion;
  today: string;
  onToggle: (ayahId: number, wordIndex: number | null, word?: string) => void;
}) {
  const h = useAppStore((s) => s.quranHifz) ?? EMPTY_HIFZ;

  // يُنادى لكلّ مقطعٍ من الآية على سطره من الوجه؛ وترتيبُ الكلمة يأتي من
  // `tokenizeRun` فيبقى ترتيبَها في الآية كاملةً وإن انكسرت على سطرين.
  const renderAyah = (a: SheetAyah, part: SheetPart) => {
    const marks = mistakesForAyah(h, a.id);
    const ayahMark = marks.get("all");
    const ayahNow = ayahMark != null && markedToday(ayahMark, todayStr);
    return (
      <span
        className={
          ayahMark
            ? ayahNow
              ? "rounded-md bg-red-500/10 ring-1 ring-red-400/60 box-decoration-clone"
              : "rounded-md bg-amber-400/10 ring-1 ring-amber-400/40 box-decoration-clone"
            : undefined
        }
      >
        {tokenizeRun(part.text, part.wordOffset).map((t, k) => {
          if (t.index == null) return <span key={k}>{t.text}</span>;
          const i = t.index;
          const mk = marks.get(i);
          const now = mk != null && markedToday(mk, todayStr);
          const repeats = mk ? mk.hits.length : 0;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onToggle(a.id, i, t.text)}
              aria-pressed={now}
              title={mk && !now ? "موضعٌ سابق لم يُغلق — اضغط إن تعثّرتَ فيه اليوم أيضاً" : undefined}
              className={`press transition-colors ${
                mk
                  ? now
                    ? "text-red-600 dark:text-red-400 underline decoration-red-400 decoration-2 underline-offset-4"
                    : "text-amber-700 dark:text-amber-400 underline decoration-amber-400/70 decoration-dotted decoration-2 underline-offset-4"
                  : "hover:text-quran"
              }`}
            >
              {t.text}
              {repeats >= 2 && (
                <sup className={`text-[10px] font-sans font-bold ${now ? "text-red-500" : "text-amber-600"}`}>{repeats}</sup>
              )}
            </button>
          );
        })}
      </span>
    );
  };

  const renderNumber = (a: SheetAyah) => {
    const marks = mistakesForAyah(h, a.id);
    const ayahMark = marks.get("all");
    const ayahNow = ayahMark != null && markedToday(ayahMark, todayStr);
    return (
      <button
        type="button"
        onClick={() => onToggle(a.id, null)}
        title="وسم الآية كاملةً كخطأ"
        className={`press ${ayahMark ? (ayahNow ? "text-red-500" : "text-amber-600") : "text-quran"}`}
      >
        <AyahNumber num={a.ayah} spacer />
      </button>
    );
  };

  return (
    <MushafSheet
      text={text}
      fromId={portion.fromId}
      toId={portion.toId}
      renderAyah={renderAyah}
      renderNumber={renderNumber}
      className="hifz-mushaf-stage"
      expandable
    />
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
              {m.hits.length >= 2 && <span className="font-sans font-bold opacity-70">×{arNum(m.hits.length)}</span>}
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
