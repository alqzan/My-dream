"use client";
import { useState, useEffect } from "react";
import { idToSurahAyah, describeRange, SURAHS } from "@/lib/quran/meta";
import { textsInRange } from "@/lib/quran/text";
import { mistakesForAyah, type Portion } from "@/lib/quran/hifz";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ, type HifzRating } from "@/lib/types";
import { X, Repeat, Eye, EyeOff, Check, ChevronLeft, Link2, CornerDownLeft, MousePointerClick } from "lucide-react";

const REPS_KEY = "madar-hifz-reps";

// المُدرّب الموجّه — يقود الحفظ آيةً آية: تكرارٌ بعددٍ تختاره، ثم تسميعٌ بتلقين
// الآية السابقة (تسمّع التالية من حفظك ثم تكشفها)، ثم «أتقنتها» للانتقال، وأخيراً
// مرحلة ربطٍ للمقطع كله. له وضعان:
// memorize (تكرار+تسميع) للورد، وrecall (تسميع فقط) للمراجعة.
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
  const ayat = textsInRange(text, portion.fromId, portion.toId).map((r) => ({
    id: r.id, no: idToSurahAyah(r.id).ayah, text: r.text,
  }));

  const [repTarget, setRepTarget] = useState(5);
  useEffect(() => {
    try { const v = parseInt(localStorage.getItem(REPS_KEY) || ""); if (v >= 1) setRepTarget(v); } catch {}
  }, []);
  function changeReps(n: number) {
    const v = Math.min(Math.max(n, 1), 20);
    setRepTarget(v);
    try { localStorage.setItem(REPS_KEY, String(v)); } catch {}
  }

  // memorize: نمرّ آيةً آية. recall: شاشة واحدة للمقطع كله.
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"repeat" | "recall" | "link">(mode === "recall" ? "recall" : "repeat");
  const [reps, setReps] = useState(0);
  const [revealed, setRevealed] = useState(mode === "recall" ? false : true);

  const cur = ayat[idx];
  const isLast = idx >= ayat.length - 1;

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
              <MousePointerClick size={12} /> اضغط أيّ كلمةٍ أخطأت فيها لتحديدها
            </div>
            <MarkableAyatBlock ayat={ayat} />
            <div className="mt-4">
              <div className="text-[11px] text-gray-500 text-center mb-1.5">كيف كانت مراجعتك؟</div>
              <RatingRow onRate={(r) => onDone(r)} />
            </div>
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
          <RepsDots reps={reps} target={repTarget} />
          <button
            onClick={() => setReps((r) => r + 1)}
            className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press"
          >
            <Repeat size={15} /> كرّرت ({reps}/{repTarget})
          </button>
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
              عدد التكرار:
              <button onClick={() => changeReps(repTarget - 1)} className="w-5 h-5 rounded bg-gray-100 dark:bg-[#382c1d] press">−</button>
              <span className="w-4 text-center font-bold text-gray-600">{repTarget}</span>
              <button onClick={() => changeReps(repTarget + 1)} className="w-5 h-5 rounded bg-gray-100 dark:bg-[#382c1d] press">+</button>
            </div>
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

// كتلة آياتٍ قابلة للتحديد: كلُّ كلمةٍ زرٌّ يبدّل وسمها كخطأ (تحمرّ وتُحفظ)، وكلُّ
// آيةٍ لها زرٌّ لوسمها كاملةً. الكلمات ذات الخطأ المفتوح سابقاً تظهر محمرّةً مسبقاً
// (تحذير) مع عدّاد التكرار — فتُعرَف مواطن الخطأ المتكرّر.
function MarkableAyatBlock({ ayat }: { ayat: { id: number; no: number; text: string }[] }) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  return (
    <div className="rounded-2xl border border-quran/15 bg-white dark:bg-[#241c12] p-5 min-h-[100px]">
      <p className="font-quran text-center font-bold text-gray-800 dark:text-gray-100 text-[21px] leading-[2.5]" dir="rtl">
        {ayat.map((a) => {
          const marks = mistakesForAyah(h, a.id);
          const ayahMark = marks.get("all");
          const words = a.text.split(/\s+/).filter(Boolean);
          return (
            <span key={a.id} className={ayahMark ? "rounded-md bg-red-500/10 ring-1 ring-red-400/50 px-0.5" : undefined}>
              {words.map((w, i) => {
                const mk = marks.get(i);
                const repeats = mk ? mk.hits.length : 0;
                return (
                  <span key={i}>
                    <button
                      type="button"
                      onClick={() => store.toggleMistakeWord(a.id, i, w)}
                      className={`press align-middle transition-colors ${mk ? "text-red-600 dark:text-red-400 underline decoration-red-400 decoration-2 underline-offset-4" : "hover:text-quran"}`}
                    >
                      {w}
                      {repeats >= 2 && (
                        <sup className="text-[10px] font-sans font-bold text-red-500 mx-0.5">{repeats}</sup>
                      )}
                    </button>{" "}
                  </span>
                );
              })}
              <button
                type="button"
                onClick={() => store.toggleMistakeWord(a.id, null)}
                title="وسم الآية كاملةً كخطأ"
                className={`inline-flex items-center justify-center text-[13px] mx-0.5 align-middle press ${ayahMark ? "text-red-500" : "text-quran"}`}
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

// تلقين: يعرض الآية التي قبل الهدف (targetId) كتذكيرٍ يبني عليه المستخدم؛ فإن
// كان الهدف أوّل آية في سورته عرض اسم السورة بدل آخر آية السورة السابقة.
function LeadPrompt({ text, targetId }: { text: string[]; targetId: number }) {
  const { surah, ayah } = idToSurahAyah(targetId);
  if (ayah === 1) {
    const name = SURAHS[surah - 1]?.name ?? "";
    return (
      <div className="rounded-xl bg-quran/[0.06] border border-quran/15 px-4 py-2.5 mb-2 text-center">
        <div className="text-[10px] text-gray-400 mb-0.5">ابدأ من أوّل السورة</div>
        <div className="text-sm font-bold text-quran">﴿ سورة {name} ﴾</div>
      </div>
    );
  }
  const prevText = text[targetId - 1] ?? "";
  return (
    <div className="rounded-xl bg-quran/[0.06] border border-quran/15 px-4 py-3 mb-2">
      <div className="text-[10px] text-gray-400 mb-1 text-center">…الآية السابقة (تلقين)</div>
      <p className="font-quran text-center text-[18px] leading-[2.2] font-bold text-gray-500 dark:text-gray-400" dir="rtl">
        {prevText}<span className="text-quran/60 text-[11px] align-middle mx-0.5">﴿{ayah - 1}﴾</span>
      </p>
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
