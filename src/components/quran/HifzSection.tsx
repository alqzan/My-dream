"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ, type HifzUnit, type HifzRating } from "@/lib/types";
import {
  SURAHS, surahAyahToId, idToSurahAyah, describeRange,
} from "@/lib/quran/meta";
import { loadAyahText, textsInRange } from "@/lib/quran/text";
import { today } from "@/lib/utils";
import {
  plannedPortion, hifzProgress, weakSpots, recentReviewBand, randomTestPage,
  testDue, reviewWindowPages, type Portion,
} from "@/lib/quran/hifz";
import { HifzCoach } from "@/components/quran/HifzCoach";
import { HifzMap } from "@/components/quran/HifzMap";
import { HifzChart } from "@/components/quran/HifzChart";
import { MistakesPanel } from "@/components/quran/MistakesPanel";
import { MutashabihatAlert } from "@/components/quran/MutashabihatAlert";
import { NumberInput } from "@/components/ui/NumberInput";
import {
  Sprout, RefreshCw, Check, Target, GraduationCap, Headphones, Shuffle, Layers, Minus, Plus,
} from "lucide-react";

// نوع جلسة المُدرّب: حفظٌ جديد، مراجعةٌ قريبة، مراجعةٌ مركّزة (ضعف)، أو اختبار مفاجئ.
type CoachKind = "memorize" | "review" | "weak" | "test";
const RECALL_TITLE: Record<Exclude<CoachKind, "memorize">, string> = {
  review: "سمّع مراجعتك", weak: "مراجعة مركّزة", test: "اختبار مفاجئ",
};

const UNIT_LABEL: Record<HifzUnit, string> = { ayah: "آية", quarter: "ربع وجه", half: "نصف وجه", page: "وجه" };
const UNITS: HifzUnit[] = ["ayah", "quarter", "half", "page"];

export function HifzSection({ onRead }: { onRead: (surah: number) => void }) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const [text, setText] = useState<string[] | null>(null);
  useEffect(() => { loadAyahText().then(setText); }, []);

  if (!h.plan) return <PlanSetup onStart={store.startHifzPlan} />;
  return <HifzDashboard text={text} onRead={onRead} />;
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
      <p className="text-xs text-gray-500 leading-relaxed">
        الحفظ متتابع: تبدأ من نقطة وتُكمل منها يوماً بيوم بلا قفز. اختر البداية ومقدار وردك اليومي — وكله مرن، تعدّله وقتما شئت.
      </p>

      <div>
        <div className="text-[11px] font-semibold text-gray-500 mb-1.5">نقطة البداية</div>
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
        <div className="text-[11px] font-semibold text-gray-500 mb-1.5">الورد اليومي</div>
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
          <span className="text-[11px] text-gray-400">كل يوم</span>
          <NumberInput
            value={amount}
            onChange={setAmount}
            inputMode="numeric"
            className="w-16 text-sm text-center border border-gray-200 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-quran/40"
          />
          <span className="text-[11px] text-gray-400">{UNIT_LABEL[unit]}{Number(amount) > 1 ? " (أو أكثر)" : ""}</span>
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
function HifzDashboard({ text, onRead }: { text: string[] | null; onRead: (surah: number) => void }) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const [showMore, setShowMore] = useState(false); // «زِد حفظك» بعد إتمام ورد اليوم
  // المُدرّب الموجّه — للورد (memorize) أو للتسميع (recall) بأنواعه.
  const [coach, setCoach] = useState<{ portion: Portion; mode: "memorize" | "recall"; kind: CoachKind } | null>(null);

  const prog = hifzProgress(h);
  const portion = plannedPortion(h);
  const weak = weakSpots(h);
  const weakTop = weak[0] ?? null;
  const band = recentReviewBand(h);
  const winPages = reviewWindowPages(h);
  const todayStr = today();
  const showTest = testDue(h, todayStr);
  const wirdDoneToday = h.sessions.some((s) => s.date === todayStr);

  // اختبار مفاجئ: يختار وجهاً عشوائياً من كامل المحفوظ ويفتح التسميع عليه.
  const startTest = () => {
    const p = randomTestPage(h);
    if (p) setCoach({ portion: p, mode: "recall", kind: "test" });
  };

  return (
    <div className="space-y-4">
      {/* 1) ورد اليوم — الفعل اليومي الأول */}
      {prog.done ? (
        <div className="rounded-2xl border border-quran/25 bg-quran/[0.06] p-4 text-center">
          <p className="text-sm font-bold text-quran">🎉 أتممت خطتك حتى آخر المصحف — تقبّل الله</p>
          <p className="text-xs text-gray-500 mt-1">يمكنك بدء خطة جديدة من «مؤشّر الحفظ ← خطة جديدة».</p>
        </div>
      ) : portion && wirdDoneToday && !showMore ? (
        <div className="rounded-2xl border border-quran/25 bg-quran/[0.06] p-4 text-center space-y-1.5">
          <p className="text-sm font-bold text-quran">🌿 أتممت ورد اليوم — تقبّل الله</p>
          {prog.at && <p className="text-xs text-gray-500">تقدّمت إلى {prog.at.surahName} {prog.at.ayah} · صفحة {prog.page}</p>}
          <button onClick={() => setShowMore(true)} className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-quran bg-quran/10 hover:bg-quran/20 rounded-full px-4 py-1.5 press">
            <Sprout size={13} /> زِد حفظك اليوم
          </button>
        </div>
      ) : portion && (
        <div className="rounded-2xl border border-quran/25 bg-quran/[0.06] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sprout size={15} className="text-quran" />
            <span className="text-sm font-bold text-gray-800">ورد اليوم</span>
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

      {/* 2) ورد المراجعة — النافذة المتحرّكة «آخر N وجه» */}
      {band && (
        <div className="rounded-2xl border border-gray-100 bg-white dark:bg-[#241c12] p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <RefreshCw size={15} className="text-quran" />
            <span className="text-sm font-bold text-gray-800">المراجعة القريبة</span>
            <span className="text-[10px] font-bold text-quran bg-quran/10 rounded-full px-2 py-0.5">آخر {winPages} وجه</span>
            <span className="text-[11px] text-quran font-semibold">{describeRange(band.fromId, band.toId)}</span>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            راجِع آخر ما حفظتَ باستمرار — كلّما تقدّمتَ في الحفظ انزلقت النافذة تلقائياً فخرج الأقدم.
          </p>
          <PortionText text={text} portion={band} muted />
          <MutashabihatAlert portion={band} />
          {text && (
            <button
              onClick={() => setCoach({ portion: band, mode: "recall", kind: "review" })}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran/10 hover:bg-quran/20 text-quran font-semibold press"
            >
              <Headphones size={16} /> سمّع موجّهاً
            </button>
          )}
          <div>
            <div className="text-[11px] text-gray-500 mb-1.5 text-center">أو قيّم مراجعتك مباشرةً:</div>
            <RatingRow onRate={(r) => store.recordReview(band.fromId, band.toId, r, false)} />
          </div>
          {/* ضبط حجم النافذة */}
          <div className="flex items-center justify-center gap-2 pt-1 text-[11px] text-gray-400">
            <Layers size={13} /> حجم نافذة المراجعة:
            <button onClick={() => store.setReviewWindow(winPages - 1)} className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-[#382c1d] press flex items-center justify-center" aria-label="أنقص"><Minus size={13} /></button>
            <span className="w-8 text-center font-bold text-gray-600 dark:text-gray-300 tabular-nums">{winPages} وجه</span>
            <button onClick={() => store.setReviewWindow(winPages + 1)} className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-[#382c1d] press flex items-center justify-center" aria-label="زِد"><Plus size={13} /></button>
          </div>
        </div>
      )}

      {/* 3) اختبار مفاجئ — وجهٌ عشوائيٌّ من كامل المحفوظ (دوريّاً أو يدويّاً) */}
      {band && (
        <div className={`rounded-2xl border p-4 space-y-2.5 ${showTest ? "border-indigo-200 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-900/10" : "border-gray-100 bg-white dark:bg-[#241c12]"}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <Shuffle size={15} className="text-indigo-500" />
            <span className="text-sm font-bold text-gray-800">اختبار مفاجئ</span>
            {showTest && <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 dark:bg-indigo-900/30 rounded-full px-2 py-0.5">حان وقته</span>}
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            {showTest
              ? "اختبر ثباتَ حفظك على وجهٍ عشوائيّ من كل ما حفظت."
              : "متى شئتَ، اختبر نفسك على وجهٍ عشوائيّ من محفوظك."}
          </p>
          <button
            onClick={startTest}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold press ${showTest ? "bg-indigo-500 text-white shadow-sm" : "bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600"}`}
          >
            <Shuffle size={16} /> اختبرني الآن
          </button>
        </div>
      )}

      {/* 4) مراجعة مركّزة — أحوج مواطن الضعف (لم تُتقَن بعد) */}
      {weakTop && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <RefreshCw size={15} className="text-amber-600" />
            <span className="text-sm font-bold text-gray-800">مراجعة مركّزة</span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 rounded-full px-2 py-0.5">موطن ضعف</span>
            <span className="text-[11px] text-quran font-semibold">{describeRange(weakTop.fromId, weakTop.toId)}</span>
          </div>
          <PortionText text={text} portion={weakTop} muted />
          <MutashabihatAlert portion={{ fromId: weakTop.fromId, toId: weakTop.toId }} />
          {text && (
            <button
              onClick={() => setCoach({ portion: { fromId: weakTop.fromId, toId: weakTop.toId }, mode: "recall", kind: "weak" })}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran/10 hover:bg-quran/20 text-quran font-semibold press"
            >
              <Headphones size={16} /> سمّع موجّهاً
            </button>
          )}
          <div>
            <div className="text-[11px] text-gray-500 mb-1.5 text-center">أو قيّم مراجعتك مباشرةً:</div>
            <RatingRow onRate={(r) => store.recordReview(weakTop.fromId, weakTop.toId, r, false)} />
          </div>
        </div>
      )}

      {/* 5) أخطائي — مواضع الأخطاء المُحدَّدة أثناء المراجعة */}
      <MistakesPanel onReview={(p) => setCoach({ portion: p, mode: "recall", kind: "review" })} />

      {/* 6) خريطة الحفظ — لوحة كاملة: المحفوظ، المتقن، المحتاج للمراجعة، والضعف */}
      <HifzMap
        text={text}
        onReview={(p) => setCoach({ portion: p, mode: "recall", kind: "review" })}
        onRead={onRead}
      />

      {/* 4) رسم تقدّم الحفظ عبر الزمن */}
      <HifzChart />

      {coach && text && (
        <HifzCoach
          portion={coach.portion}
          text={text}
          mode={coach.mode}
          recallTitle={coach.kind === "memorize" ? undefined : RECALL_TITLE[coach.kind]}
          onClose={() => setCoach(null)}
          onDone={(rating?: HifzRating) => {
            const { portion, kind } = coach;
            if (kind === "memorize") store.recordHifzSession(portion.toId, rating);
            else if (kind === "test") store.recordRandomTest(portion.fromId, portion.toId, rating);
            else store.recordReview(portion.fromId, portion.toId, rating, false);
            setCoach(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------- عناصر مساعدة ----------------
function PortionText({ text, portion, muted }: { text: string[] | null; portion: Portion; muted?: boolean }) {
  if (!text) return <p className="text-xs text-gray-400 text-center py-4">…جارٍ تحميل المصحف</p>;
  const rows = textsInRange(text, portion.fromId, portion.toId);
  return (
    <div className="rounded-xl bg-white/60 dark:bg-[#2c2318] p-3 max-h-56 overflow-y-auto">
      <p className={`font-quran text-center text-[20px] leading-[2.4] font-bold ${muted ? "text-gray-600 dark:text-gray-300" : "text-gray-800 dark:text-gray-100"}`} dir="rtl">
        {rows.map((r) => {
          const { ayah } = idToSurahAyah(r.id);
          return (
            <span key={r.id}>
              {r.text}
              <span className="text-quran text-[12px] align-middle mx-0.5">﴿{ayah}﴾</span>{" "}
            </span>
          );
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
        <button key={it.r} onClick={() => onRate(it.r)} className={`flex-1 text-xs font-bold rounded-lg py-2 press ${it.cls}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

