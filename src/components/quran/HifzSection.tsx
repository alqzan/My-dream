"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ, type HifzUnit, type HifzRating } from "@/lib/types";
import {
  SURAHS, TOTAL_AYAT, TOTAL_PAGES, surahAyahToId, idToSurahAyah, idToPage, describeRange,
} from "@/lib/quran/meta";
import { loadAyahText, textsInRange } from "@/lib/quran/text";
import { today } from "@/lib/utils";
import {
  plannedPortion, hifzProgress, hifzPace, hifzStreak, smartReview, weakSpots, type Portion,
} from "@/lib/quran/hifz";
import { HifzCoach } from "@/components/quran/HifzCoach";
import { NumberInput } from "@/components/ui/NumberInput";
import {
  Sprout, RefreshCw, Flame, MapPin, Gauge, Check, Pencil, RotateCcw, Target, TriangleAlert, ChevronLeft, GraduationCap, Headphones,
} from "lucide-react";

const UNIT_LABEL: Record<HifzUnit, string> = { ayah: "آية", quarter: "ربع وجه", half: "نصف وجه", page: "وجه" };
const UNITS: HifzUnit[] = ["ayah", "quarter", "half", "page"];

export function HifzSection() {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const [text, setText] = useState<string[] | null>(null);
  useEffect(() => { loadAyahText().then(setText); }, []);

  if (!h.plan) return <PlanSetup onStart={store.startHifzPlan} />;
  return <HifzDashboard text={text} />;
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
function HifzDashboard({ text }: { text: string[] | null }) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const [editPos, setEditPos] = useState(false);
  const [editPlan, setEditPlan] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [showMore, setShowMore] = useState(false); // «زِد حفظك» بعد إتمام ورد اليوم
  // المُدرّب الموجّه — للورد (memorize) أو المراجعة (recall). advance يحرّك
  // مؤشّر الدورة (يُعطَّل لمراجعة الضعف).
  const [coach, setCoach] = useState<{ portion: Portion; mode: "memorize" | "recall"; advance?: boolean } | null>(null);

  const prog = hifzProgress(h);
  const pace = hifzPace(h);
  const streak = hifzStreak(h);
  const portion = plannedPortion(h);
  const review = smartReview(h);
  const weak = weakSpots(h);
  const plan = h.plan!;
  const todayStr = today();
  const wirdDoneToday = h.sessions.some((s) => s.date === todayStr);

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
          {text && (
            <button
              onClick={() => setCoach({ portion, mode: "memorize" })}
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

      {/* 2) المراجعة — تُقدّم مواطن الضعف على الدورة المتسلسلة */}
      {review && (() => {
        const rp = review.portion;
        const weakReview = review.reason === "weak";
        const advance = !weakReview; // مراجعة الضعف لا تحرّك مؤشّر الدورة
        return (
          <div className={`rounded-2xl border p-4 space-y-3 ${weakReview ? "border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10" : "border-gray-100 bg-white dark:bg-[#241c12]"}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <RefreshCw size={15} className={weakReview ? "text-amber-600" : "text-quran"} />
              <span className="text-sm font-bold text-gray-800">{weakReview ? "مراجعة مركّزة" : "المراجعة الدورية"}</span>
              {weakReview && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 rounded-full px-2 py-0.5">موطن ضعف</span>}
              <span className="text-[11px] text-quran font-semibold">{describeRange(rp.fromId, rp.toId)}</span>
            </div>
            <PortionText text={text} portion={rp} muted />
            {text && (
              <button
                onClick={() => setCoach({ portion: rp, mode: "recall", advance })}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran/10 hover:bg-quran/20 text-quran font-semibold press"
              >
                <Headphones size={16} /> سمّع موجّهاً
              </button>
            )}
            <div>
              <div className="text-[11px] text-gray-500 mb-1.5 text-center">أو قيّم مراجعتك مباشرةً:</div>
              <RatingRow onRate={(r) => store.recordReview(rp.fromId, rp.toId, r, advance)} />
              {!weakReview && (
                <button onClick={() => store.skipReview(rp.toId)} className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 press py-1.5">
                  مقطع آخر ←
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* 3) مؤشّر الحفظ — الموضع والتقدّم والوتيرة والخطة */}
      <div className="rounded-2xl border border-quran/20 bg-gradient-to-b from-quran/[0.07] to-transparent p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-gray-800">مؤشّر الحفظ</span>
          <div className="flex items-center gap-2">
            {streak > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600"><Flame size={12} /> {streak}</span>
            )}
            <button onClick={() => setEditPlan((v) => !v)} className="p-1 text-gray-400 hover:text-quran press" aria-label="تعديل الخطة"><Pencil size={13} /></button>
          </div>
        </div>

        {prog.at && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600 flex-wrap">
            <MapPin size={13} className="text-quran" />
            موضعك: <span className="font-bold text-gray-800">{prog.at.surahName} {prog.at.ayah}</span>
            <span className="text-gray-300">·</span> صفحة {prog.page}/{TOTAL_PAGES}
            <span className="text-gray-300">·</span> الجزء {prog.juz}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-gray-500">حفظت ≈ {prog.spanPages} وجه ({prog.spanAyat} آية)</span>
            <span className="font-bold text-quran tabular-nums">{prog.pct}%</span>
          </div>
          <div className="h-2.5 bg-gray-100 dark:bg-[#2c2318] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-l from-quran to-[#2f9c73] transition-all duration-700" style={{ width: `${prog.pct}%` }} />
          </div>
        </div>

        {pace.text && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Gauge size={12} className="text-quran" /> {pace.text}
          </div>
        )}

        {editPlan && (
          <div className="bg-gray-50 dark:bg-[#2c2318] rounded-xl p-3 space-y-2.5">
            <div className="text-[11px] font-semibold text-gray-500">عدّل الورد اليومي</div>
            <div className="flex gap-1.5 flex-wrap">
              {UNITS.map((u) => (
                <button key={u} onClick={() => store.updateHifzPlan({ unit: u })}
                  className={`text-xs font-semibold rounded-full px-3 py-1.5 press ${plan.unit === u ? "bg-quran text-white" : "bg-white dark:bg-[#241c12] text-gray-500 border border-gray-200"}`}>
                  {UNIT_LABEL[u]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400">كل يوم</span>
              <NumberInput value={String(plan.amount)} onChange={(v) => store.updateHifzPlan({ amount: parseInt(v) || 1 })} inputMode="numeric"
                className="w-16 text-sm text-center border border-gray-200 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-quran/40" />
              <span className="text-[11px] text-gray-400">{UNIT_LABEL[plan.unit]}</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <button onClick={() => setEditPos(true)} className="text-[11px] text-gray-500 hover:text-quran press flex items-center gap-1"><MapPin size={12} /> تعديل موضعي</button>
              {confirmNew ? (
                <span className="flex items-center gap-1.5 text-[11px]">
                  <button onClick={() => { store.clearHifz(); setConfirmNew(false); setEditPlan(false); }} className="text-red-500 font-semibold press">تأكيد المسح</button>
                  <button onClick={() => setConfirmNew(false)} className="text-gray-400 press">إلغاء</button>
                </span>
              ) : (
                <button onClick={() => setConfirmNew(true)} className="text-[11px] text-red-500 hover:text-red-600 press flex items-center gap-1"><RotateCcw size={12} /> خطة جديدة</button>
              )}
            </div>
          </div>
        )}
      </div>

      {editPos && <PositionEditor current={h.frontierId} onSave={(id) => { store.setFrontier(id); setEditPos(false); }} onCancel={() => setEditPos(false)} />}

      {/* 4) مواطن الضعف */}
      {weak.length > 0 && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TriangleAlert size={15} className="text-amber-600" />
            <span className="text-sm font-bold text-gray-800">مواطن تحتاج إتقاناً</span>
          </div>
          <div className="space-y-1.5">
            {weak.map((w, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <ChevronLeft size={13} className="text-amber-500 shrink-0" />
                <span className="font-semibold text-gray-700">{describeRange(w.fromId, w.toId)}</span>
                <span className="text-gray-400 text-[10px]">· صفحة {idToPage(w.fromId)}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">مقاطع قيّمتها «تحتاج إتقاناً» — راجعها من المصحف بتركيز.</p>
        </div>
      )}

      {coach && text && (
        <HifzCoach
          portion={coach.portion}
          text={text}
          mode={coach.mode}
          onClose={() => setCoach(null)}
          onDone={(rating?: HifzRating) => {
            if (coach.mode === "memorize") store.recordHifzSession(coach.portion.toId, rating);
            else store.recordReview(coach.portion.fromId, coach.portion.toId, rating, coach.advance ?? true);
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

function PositionEditor({ current, onSave, onCancel }: { current: number; onSave: (id: number) => void; onCancel: () => void }) {
  const init = current >= 1 ? idToSurahAyah(current) : { surah: 1, ayah: 1 };
  const [surah, setSurah] = useState(init.surah);
  const [ayah, setAyah] = useState(String(init.ayah));
  const maxAyah = SURAHS[surah - 1].ayat;
  const a = Math.min(Math.max(parseInt(ayah) || 1, 1), maxAyah);
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-[#2c2318] p-3 space-y-2.5">
      <div className="text-[11px] font-semibold text-gray-500">حدّد آخر آية حفظتها (موضعك الحالي)</div>
      <div className="flex gap-2 items-center">
        <select value={surah} onChange={(e) => setSurah(Number(e.target.value))}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2 focus:ring-quran/40">
          {SURAHS.map((s) => <option key={s.num} value={s.num}>{s.num}. {s.name}</option>)}
        </select>
        <span className="text-[11px] text-gray-400">آية</span>
        <NumberInput value={ayah} onChange={setAyah} inputMode="numeric"
          className="w-16 text-sm text-center border border-gray-200 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-quran/40" />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-sm text-gray-400 px-3 py-1.5 press">إلغاء</button>
        <button onClick={() => onSave(surahAyahToId(surah, a))} className="bg-quran text-white text-sm px-4 py-1.5 rounded-lg press">حفظ الموضع</button>
      </div>
    </div>
  );
}
