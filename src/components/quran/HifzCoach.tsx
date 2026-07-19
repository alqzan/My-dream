"use client";
import { useState, useEffect } from "react";
import { idToSurahAyah, describeRange } from "@/lib/quran/meta";
import { textsInRange } from "@/lib/quran/text";
import type { Portion } from "@/lib/quran/hifz";
import type { HifzRating } from "@/lib/types";
import { X, Repeat, Eye, EyeOff, Check, ChevronLeft, Link2 } from "lucide-react";

const REPS_KEY = "madar-hifz-reps";

// المُدرّب الموجّه — يقود الحفظ آيةً آية: تكرارٌ بعددٍ تختاره، ثم تسميعٌ بإخفاء
// الآية، ثم «أتقنتها» للانتقال، وأخيراً مرحلة ربطٍ للمقطع كله. له وضعان:
// memorize (تكرار+تسميع) للورد، وrecall (تسميع فقط) للمراجعة.
export function HifzCoach({
  portion, text, mode, onDone, onClose,
}: {
  portion: Portion;
  text: string[];
  mode: "memorize" | "recall";
  onDone: (rating?: HifzRating) => void;
  onClose: () => void;
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

  // ---- recall mode (مراجعة): المقطع كله، إخفاء ثم كشف ثم تقييم ----
  if (mode === "recall") {
    return (
      <Shell title="سمّع مراجعتك" subtitle={describeRange(portion.fromId, portion.toId)} onClose={onClose}>
        <p className="text-[11px] text-gray-400 text-center mb-3">سمّع المقطع من حفظك ثم اكشفه لتتحقّق.</p>
        <AyatBlock ayat={ayat} hidden={!revealed} />
        {!revealed ? (
          <button onClick={() => setRevealed(true)} className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press">
            <Eye size={16} /> اكشف للتحقّق
          </button>
        ) : (
          <div className="mt-4">
            <div className="text-[11px] text-gray-500 text-center mb-1.5">كيف كانت مراجعتك؟</div>
            <RatingRow onRate={(r) => onDone(r)} />
          </div>
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
          <AyatBlock ayat={ayat} hidden={false} />
          <div className="mt-4">
            <div className="text-[11px] text-gray-500 text-center mb-1.5">كيف تقيّم حفظك للورد؟</div>
            <RatingRow onRate={(r) => onDone(r)} />
            <button onClick={() => onDone()} className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 press py-1.5">أنهيت بلا تقييم</button>
          </div>
        </>
      ) : phase === "repeat" ? (
        <>
          <div className="text-center text-[11px] font-semibold text-quran mb-3 flex items-center justify-center gap-1"><Repeat size={13} /> كرّر الآية حتى تألفها</div>
          <AyatBlock ayat={[cur]} hidden={false} big />
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
          <div className="text-center text-[11px] font-semibold text-quran mb-3 flex items-center justify-center gap-1"><EyeOff size={13} /> سمّعها من حفظك</div>
          <AyatBlock ayat={[cur]} hidden={!revealed} big />
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

function AyatBlock({ ayat, hidden, big }: { ayat: { id: number; no: number; text: string }[]; hidden: boolean; big?: boolean }) {
  return (
    <div className="rounded-2xl border border-quran/15 bg-white dark:bg-[#241c12] p-5 min-h-[100px] flex items-center justify-center">
      <p className={`font-quran text-center font-bold text-gray-800 dark:text-gray-100 ${big ? "text-[26px] leading-[2.5]" : "text-[21px] leading-[2.3]"} ${hidden ? "blur-md select-none" : ""}`} dir="rtl">
        {ayat.map((a) => (
          <span key={a.id}>{a.text}<span className="text-quran text-[13px] align-middle mx-0.5">﴿{a.no}﴾</span>{" "}</span>
        ))}
      </p>
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
