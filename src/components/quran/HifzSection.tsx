"use client";
import { useState, useEffect, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ, type HifzUnit, type HifzRating } from "@/lib/types";
import { SURAHS, surahAyahToId, describeRange } from "@/lib/quran/meta";
import { loadAyahText } from "@/lib/quran/text";
import { today } from "@/lib/utils";
import { plannedPortion, hifzProgress, smartTestPortion, UNIT_LABEL, type Portion } from "@/lib/quran/hifz";
import { INTENSITY_LABEL, intensityOf, presetOf } from "@/lib/quran/intensity";
import type { HifzIntensity } from "@/lib/types";
import { buildTodayPlan, type TodayPlan } from "@/lib/quran/session";
import { HifzCoach } from "@/components/quran/HifzCoach";
import { TodaySessionCard, TodaySessionFlow } from "@/components/quran/TodaySession";
import { MushafSheet, MushafStage } from "@/components/quran/MushafSheet";
import { HifzMap } from "@/components/quran/HifzMap";
import { HifzChart } from "@/components/quran/HifzChart";
import { HifzLog } from "@/components/quran/HifzLog";
import { QuranWeekReport } from "@/components/quran/QuranWeekReport";
import { MistakesPanel } from "@/components/quran/MistakesPanel";
import { MutashabihatAlert } from "@/components/quran/MutashabihatAlert";
import { NumberInput } from "@/components/ui/NumberInput";
import {
  Sprout, Check, Target, GraduationCap, Shuffle, Minus, Plus, SlidersHorizontal, RefreshCw,
} from "lucide-react";
import { arNum } from "@/lib/madar/format";

// نوع جلسة المُدرّب خارج «جلسة اليوم»: حفظٌ جديد (زِد حفظك)، تسميعٌ من الخريطة،
// أو اختبارٌ من زرّ «اختبرني الآن».
type CoachKind = "memorize" | "review" | "test";
const RECALL_TITLE: Record<Exclude<CoachKind, "memorize">, string> = {
  review: "سمّع مراجعتك", test: "اختبار",
};

const UNITS: HifzUnit[] = ["ayah", "quarter", "half", "page"];

export type HifzView = "today" | "map" | "drill";

export function HifzSection({ view = "today" }: { view?: HifzView } = {}) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const [text, setText] = useState<string[] | null>(null);
  useEffect(() => { loadAyahText().then(setText); }, []);

  if (!h.plan) return <PlanSetup onStart={store.startHifzPlan} />;
  return <HifzDashboard text={text} view={view} />;
}

// ---------------- إعداد الخطة ----------------
function PlanSetup({ onStart }: { onStart: (startId: number, unit: HifzUnit, amount: number) => void }) {
  const [surah, setSurah] = useState(1);
  const [unit, setUnit] = useState<HifzUnit>("ayah");
  const [amount, setAmount] = useState("1");

  const presets = [
    { label: "من الفاتحة", surah: 1 },
    { label: "من جزء عمّ", surah: 78 }, // سورة النبأ
    { label: "من البقرة", surah: 2 },
  ];

  return (
    <div className="rounded-2xl border border-quran/20 bg-quran/[0.05] p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Target size={17} className="text-quran" />
        <span className="text-sm font-bold text-gray-800">ارسم خطة حفظك</span>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">
        الحفظ متتابع: تبدأ من نقطة وتُكمل منها يوماً بيوم بلا قفز. اختر البداية ومقدار وردك اليومي — وكله مرن، تعدّله وقتما شئت.
      </p>

      <div>
        <div className="text-[11px] font-semibold text-gray-600 mb-1.5">نقطة البداية</div>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {presets.map((p) => (
            <button
              key={p.surah}
              onClick={() => setSurah(p.surah)}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 press ${surah === p.surah ? "bg-quran text-white" : "bg-white dark:bg-[#241c12] text-gray-500 border border-gray-200"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <select
          value={surah}
          onChange={(e) => setSurah(Number(e.target.value))}
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2 focus:ring-quran/40"
        >
          {SURAHS.map((s) => <option key={s.num} value={s.num}>ابدأ من سورة {s.name}</option>)}
        </select>
      </div>

      <div>
        <div className="text-[11px] font-semibold text-gray-600 mb-1.5">الورد اليومي</div>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {UNITS.map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 press ${unit === u ? "bg-quran text-white" : "bg-white dark:bg-[#241c12] text-gray-500 border border-gray-200"}`}
            >
              {UNIT_LABEL[u]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-600">كل يوم</span>
          <NumberInput
            value={amount}
            onChange={setAmount}
            inputMode="numeric"
            className="w-16 text-sm text-center border border-gray-200 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-quran/40"
          />
          <span className="text-[11px] text-gray-600">{UNIT_LABEL[unit]}{Number(amount) > 1 ? " (أو أكثر)" : ""}</span>
        </div>
      </div>

      <button
        onClick={() => onStart(surahAyahToId(surah, 1), unit, Math.max(1, parseInt(amount) || 1))}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press shadow-sm"
      >
        <Sprout size={16} /> ابدأ خطة الحفظ
      </button>
    </div>
  );
}

// ---------------- لوحة الحفظ ----------------
function HifzDashboard({ text, view }: { text: string[] | null; view: HifzView }) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const [showMore, setShowMore] = useState(false); // «زِد حفظك» بعد إتمام ورد اليوم
  // المُدرّب الموجّه خارج جلسة اليوم — للزيادة، أو للتسميع من الخريطة، أو للاختبار.
  const [coach, setCoach] = useState<{ portion: Portion; mode: "memorize" | "recall"; kind: CoachKind } | null>(null);
  const [flow, setFlow] = useState<{ resume: boolean } | null>(null); // تدفّق «جلسة اليوم» مفتوح؟
  // قراءةُ مقطعٍ من الخريطة في المصحف — وجهٌ يملأ الشاشة، لا تسميعَ ولا تسجيل.
  const [read, setRead] = useState<Portion | null>(null);

  const prog = hifzProgress(h);
  const portion = plannedPortion(h);
  const todayStr = today();
  // بناء خطّة اليوم يمرّ على كلّ وجهٍ محفوظ وسجلّه — نحسبها مرّةً لا في كلّ رسم.
  const plan = useMemo(() => buildTodayPlan(h, todayStr), [h, todayStr]);
  const hasSession = plan.steps.length > 0;
  const hasMemorized = h.frontierId >= (h.plan?.startId ?? 1);
  const wirdDoneToday = h.sessions.some((x) => x.date === todayStr);
  const showToday = view === "today";
  const showMap = view === "map";
  const showDrill = view === "drill";

  // اختبرني الآن: وجهٌ يُرجَّح بطول العهد والتعثّر (لا عشوائيٌّ بحت).
  const startTest = () => {
    const p = smartTestPortion(h, todayStr);
    if (p) setCoach({ portion: p, mode: "recall", kind: "test" });
  };
  // «جلسة مراجعة» بعد إتمام اليوم: الوجه نفسه المُرجَّح، لكنّه يُسجَّل مراجعةً
  // (فيدخل جدول المباعدة) لا اختباراً دورياً.
  const startExtraReview = () => {
    const p = smartTestPortion(h, todayStr);
    if (p) setCoach({ portion: p, mode: "recall", kind: "review" });
  };

  return (
    <div className={`mdr-hifz-dashboard mdr-hifz-dashboard--${view} space-y-4`}>
      {/* شريطُ الأرقام الثلاثة رُفع: كان يكرّر ما تقوله بطاقةُ الجلسة تحته
          بالحرف («٣ آيات جديدة · وجهان للمراجعة») ثمّ يُعيده رقماً مجرّداً بلا
          فعل. ما لا يُضيف معلومةً ولا زرّاً لا يستحقّ صفّاً في أعلى الشاشة. */}
      {/* 1) جلسة اليوم — المدخل الوحيد لعمل اليوم (سبق + مراجعة + اختبار أخطاء) */}
      {(showToday || showDrill) && hasSession ? (
        <>
          <TodaySessionCard onStart={(resume) => setFlow({ resume })} />
          {/* أتممتَ وردك لكن بقيت مراجعة؟ يبقى بابُ الزيادة مفتوحاً */}
          {wirdDoneToday && portion && !showMore && text && (
            <button
              onClick={() => setShowMore(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-quran hover:bg-quran/10 rounded-xl py-2 press"
            >
              <Sprout size={13} /> زِد حفظك اليوم
            </button>
          )}
        </>
      ) : (showToday || showDrill) && prog.done ? (
        <div className="rounded-2xl border border-quran/25 bg-quran/[0.06] p-4 text-center">
          <p className="text-sm font-bold text-quran">🎉 أتممت خطتك حتى آخر المصحف — تقبّل الله</p>
          <p className="text-xs text-gray-500 mt-1">يمكنك بدء خطة جديدة من «مؤشّر الحفظ ← خطة جديدة».</p>
        </div>
      ) : showToday ? (
        /* لا شيء مستحقٌّ اليوم: خِتامٌ صريح، وما بعده *بطلبك* لا اقتراحاً دائماً.
           كانت البطاقة تعود بعد إتمام الجلسة فلا يتبيّن للمستخدم أنّه أنهى
           يومه — راجع drillsToday وcoveredToday. */
        <div className="rounded-2xl border border-quran/25 bg-quran/[0.06] p-4 text-center space-y-2.5">
          <p className="text-sm font-bold text-quran">🌿 أتممت قرآن اليوم — تقبّل الله</p>
          {prog.at && <p className="text-xs text-gray-500">تقدّمت إلى {prog.at.surahName} {prog.at.ayah} · صفحة {prog.page}</p>}
          <p className="text-[11px] text-gray-600">لا مستحقَّ عليك اليوم. وإن أردت الزيادة فبطلبك:</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {portion && text && (
              <button onClick={() => setShowMore(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-quran bg-quran/10 hover:bg-quran/20 rounded-full px-4 py-2 press">
                <Sprout size={13} /> جلسة حفظ
              </button>
            )}
            {hasMemorized && text && (
              <button onClick={startExtraReview} className="inline-flex items-center gap-1.5 text-xs font-semibold text-quran bg-quran/10 hover:bg-quran/20 rounded-full px-4 py-2 press">
                <RefreshCw size={13} /> جلسة مراجعة
              </button>
            )}
          </div>
        </div>
      ) : null}

      {flow && text && (
        <TodaySessionFlow text={text} resume={flow.resume} onClose={() => setFlow(null)} />
      )}

      {/* 2) زيادة الحفظ خارج الجلسة — تُفتح بالطلب لا بالعرض الدائم */}
      {showToday && showMore && portion && (
        <div className="rounded-2xl border border-quran/25 bg-quran/[0.06] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sprout size={15} className="text-quran" />
            <span className="text-sm font-bold text-gray-800">زيادة الحفظ</span>
            <span className="text-[11px] text-quran font-semibold">{describeRange(portion.fromId, portion.toId)}</span>
          </div>
          <PortionText text={text} portion={portion} />
          <MutashabihatAlert portion={portion} />
          {text && (
            <button
              onClick={() => setCoach({ portion, mode: "memorize", kind: "memorize" })}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press shadow-sm"
            >
              <GraduationCap size={17} /> احفظ بطريقة موجّهة
            </button>
          )}
          <div>
            <div className="text-[11px] text-gray-500 mb-1.5 text-center">أو سجّل مباشرةً — قيّم حفظك:</div>
            <RatingRow onRate={(r) => { store.recordHifzSession(portion.toId, r); setShowMore(false); }} />
            <button onClick={() => { store.recordHifzSession(portion.toId); setShowMore(false); }} className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-quran bg-quran/10 hover:bg-quran/20 rounded-lg py-2 press">
              <Check size={14} /> أتممت بلا تقييم
            </button>
          </div>
        </div>
      )}

      {/* 3) اختبرني الآن — بطلبك متى شئت. يُخفى في حال «أتممت اليوم» لأنّ بطاقة
             الخِتام تعرض «جلسة مراجعة» أصلاً، فلا نزحم الشاشة بزرّين لعملٍ واحد. */}
      {showDrill && hasSession && hasMemorized && text && (
        <button
          onClick={startTest}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-semibold press"
        >
          <Shuffle size={16} /> اختبرني الآن على وجهٍ من محفوظي
        </button>
      )}

      {/* 4) أخطائي — عرضٌ لمواضع التعثّر مع اختبارٍ عليها */}
      {showDrill && <MistakesPanel />}

      {/* 5) شدّة التمرين — الإعداد الوحيد في القسم. في «اليوم» وحده: الإعداد
             يتبع الفعل، ولا يُعاد في كلّ تبويبٍ فيصير أثاثاً دائماً. */}
      {showToday && <IntensityCard plan={plan} />}

      {/* 6) خريطة الحفظ — لوحة كاملة: المحفوظ، المتقن، المحتاج للمراجعة، والضعف */}
      {showMap && (
        <HifzMap
          text={text}
          onReview={(p) => setCoach({ portion: p, mode: "recall", kind: "review" })}
          onRead={setRead}
        />
      )}

      {/* 7) حصيلة الأسبوع القرآنية — تقريرٌ موجز وخطوة الأسبوع القادم */}
      {showMap && <QuranWeekReport />}

      {/* 8) سجل الحفظ والمراجعة — تعديل/حذف/تراجع مع إعادة حساب الجبهة */}
      {showMap && <HifzLog />}

      {/* 9) رسم تقدّم الحفظ عبر الزمن */}
      {showMap && <HifzChart />}

      {read && text && (
        <MushafStage text={text} fromId={read.fromId} toId={read.toId} onClose={() => setRead(null)} />
      )}

      {coach && text && (
        <HifzCoach
          portion={coach.portion}
          text={text}
          mode={coach.mode}
          recallTitle={coach.kind === "memorize" ? undefined : RECALL_TITLE[coach.kind]}
          onClose={() => setCoach(null)}
          onDone={(rating?: HifzRating) => {
            const { portion: p, kind } = coach;
            if (kind === "memorize") { store.recordHifzSession(p.toId, rating); setShowMore(false); }
            else if (kind === "test") store.recordRandomTest(p.fromId, p.toId, rating);
            else store.recordReview(p.fromId, p.toId, rating);
            setCoach(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------- شدّة التمرين + مقدار الورد ----------------
// المكان الوحيد الذي يُضبَط فيه شيء في هذا القسم: ما مقدار ما تحفظه يومياً،
// وبأيّ إيقاعٍ تُراجع. كلّ الأرقام الأخرى (التكرار، النافذة، السقف، سلّم
// المباعدة) مشتقّةٌ من هذا الاختيار — راجع src/lib/quran/intensity.ts.
const INTENSITIES: HifzIntensity[] = ["light", "balanced", "intense"];

function IntensityCard({ plan }: { plan: TodayPlan }) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const [open, setOpen] = useState(false);
  const cur = intensityOf(h.plan);
  if (!h.plan) return null;
  const preset = presetOf(h.plan);

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-[#3a2e1e] bg-white dark:bg-[#241c12] p-4 space-y-3">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 press">
        <SlidersHorizontal size={15} className="text-gray-400" />
        <span className="text-sm font-bold text-gray-800">إعدادات الحفظ</span>
        <span className="ms-auto text-[11px] font-semibold text-quran">
          {arNum(h.plan.amount)} {UNIT_LABEL[h.plan.unit]} · {INTENSITY_LABEL[cur].name}
        </span>
      </button>

      {open && (
        <div className="space-y-4 pt-1">
          <div>
            <div className="text-[11px] font-semibold text-gray-600 mb-1.5">مقدار وردك اليومي</div>
            <div className="flex items-center justify-center gap-2 text-[11px] text-gray-500">
              <Target size={13} className="text-quran" />
              <button
                onClick={() => store.updateHifzPlan({ amount: h.plan!.amount - 1 })}
                disabled={h.plan.amount <= 1}
                className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-[#382c1d] press flex items-center justify-center disabled:opacity-40"
                aria-label="أنقص"
              ><Minus size={13} /></button>
              <span className="min-w-[72px] text-center font-bold text-gray-700 dark:text-gray-200 tabular-nums">
                {arNum(h.plan.amount)} {UNIT_LABEL[h.plan.unit]}
              </span>
              <button
                onClick={() => store.updateHifzPlan({ amount: h.plan!.amount + 1 })}
                className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-[#382c1d] press flex items-center justify-center"
                aria-label="زِد"
              ><Plus size={13} /></button>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-gray-600 mb-1.5">شدّة التمرين</div>
            <div className="flex gap-1.5">
              {INTENSITIES.map((v) => (
                <button
                  key={v}
                  onClick={() => store.setHifzIntensity(v)}
                  className={`flex-1 text-xs font-bold rounded-xl py-2 press ${
                    cur === v ? "bg-quran text-white shadow-sm" : "bg-gray-100 dark:bg-[#382c1d] text-gray-500"
                  }`}
                >
                  {INTENSITY_LABEL[v].name}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed mt-2">{INTENSITY_LABEL[cur].hint}</p>
            <p className="text-[10px] text-gray-400 leading-relaxed mt-1">
              يضبط عدد التكرار في الحفظ الموجّه · حجم المراجعة القريبة · كم وجهاً تراجع يومياً · تباعد المراجعات.
            </p>
          </div>

          {/* سقفُ اليوم لا يُقرأ من الشدّة وحدها بعد اليوم: يدور مع مواظبتك.
              نُظهره صريحاً — رقمٌ يتحرّك بلا تفسيرٍ يُقرأ عطلاً لا ذكاءً. */}
          <div className="mdr-quran-smart">
            <div className="mdr-quran-smart-row">
              <span>سقف مراجعة اليوم</span>
              <strong>{arNum(plan.dueCap)} وجه</strong>
            </div>
            <p>
              سقفُ «{INTENSITY_LABEL[cur].name}» {arNum(preset.dailyReviewPages)} وجه، ويدور بين ٧٠٪ و١٥٠٪ منه
              بحسب مواظبتك في آخر أسبوعين — فمن انقطع يعود إلى حملٍ ألطف، ومن واظب يلحق متأخّراته.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- عناصر مساعدة ----------------
// نصّ المقطع في وجهه من المصحف (لوحٌ واحد مشترك — راجع `MushafSheet`).
function PortionText({ text, portion }: { text: string[] | null; portion: Portion }) {
  return <MushafSheet text={text} fromId={portion.fromId} toId={portion.toId} maxHeight={340} expandable />;
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
        <button key={it.r} onClick={() => onRate(it.r)} className={`flex-1 text-xs font-bold rounded-lg py-2 press ${it.cls}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
