"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Play, Square } from "lucide-react";
import { buzz } from "@/lib/utils";

const START_KEY = "madar-reading-start";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// مؤقّت جلسة قراءة: يبدأ العدّ ويحفظ لحظة البدء في localStorage، فلو أغلقت
// التطبيق أو تنقّلت بين الصفحات يظل محسوباً. عند الإنهاء يمرّر الدقائق المنقضية
// لنموذج التسجيل ليملأ حقل «دقائق القراءة» تلقائياً بدل إدخاله يدوياً.
export function ReadingTimer({ onFinish }: { onFinish: (minutes: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0); // seconds
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  // استعادة جلسة جارية عند فتح الصفحة (المؤقّت يعمل من لحظة بدئه الحقيقية).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(START_KEY);
      if (raw) {
        const ts = parseInt(raw);
        if (ts > 0 && ts <= Date.now()) setStartedAt(ts);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (startedAt === null) {
      setElapsed(0);
      return;
    }
    const update = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    update();
    tick.current = setInterval(update, 1000);
    return () => { if (tick.current) clearInterval(tick.current); };
  }, [startedAt]);

  function start() {
    const now = Date.now();
    try { localStorage.setItem(START_KEY, String(now)); } catch { /* ignore */ }
    setStartedAt(now);
    buzz();
  }

  function stop() {
    const minutes = Math.max(1, Math.round(elapsed / 60));
    try { localStorage.removeItem(START_KEY); } catch { /* ignore */ }
    setStartedAt(null);
    buzz(18);
    onFinish(minutes);
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  if (startedAt === null) {
    return (
      <button
        onClick={start}
        className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-2xl py-3 text-sm font-medium text-gray-600 hover:border-reading/40 transition-colors press"
      >
        <Play size={16} className="text-reading" fill="currentColor" />
        ابدأ مؤقّت قراءة
      </button>
    );
  }

  // الحلقة الحيّة: تمتلئ حبّةً حبّة مع كل ثانية وتدور دورةً كاملة في كل دقيقة —
  // كساعةٍ رمليّة تتدفّق. تُقاد من نفس عدّاد elapsed (لا مؤقّت جديد). عند تفضيل
  // تقليل الحركة تُعرَض حلقةً ثابتة (إطار) دون كنسٍ أو نبض.
  const reduce = prefersReducedMotion();
  const R = 40;
  const RING_C = 2 * Math.PI * R;
  const frac = (elapsed % 60) / 60; // نصيب الدقيقة الجارية
  const ringDash = (reduce ? 1 : frac) * RING_C;
  const tipAngle = (frac * 360 - 90) * (Math.PI / 180);
  const tipX = 50 + R * Math.cos(tipAngle);
  const tipY = 50 + R * Math.sin(tipAngle);

  return (
    <Card className="animate-fade-up border-reading/30 bg-reading/5">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0" style={{ width: 84, height: 84 }}>
          <svg viewBox="0 0 100 100" width={84} height={84} className="overflow-visible">
            <defs>
              <linearGradient id="timerSand" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e8b15a" />
                <stop offset="100%" stopColor="#c1663f" />
              </linearGradient>
            </defs>
            <g style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}>
              <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" className="text-reading/15 dark:text-[#3a2e1e]" strokeWidth={5} />
              <circle
                cx="50" cy="50" r={R} fill="none"
                stroke="url(#timerSand)" strokeWidth={5} strokeLinecap="round"
                strokeDasharray={`${ringDash} ${RING_C}`}
              />
            </g>
            {!reduce && (
              <circle cx={tipX} cy={tipY} r={3} fill="#e8b15a" stroke="#fff" strokeWidth={1.2}>
                <animate attributeName="opacity" values="0.4;1;0.4" dur="1.6s" repeatCount="indefinite" />
              </circle>
            )}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-black text-reading tabular-nums leading-none" dir="ltr">
              {mm}:{ss}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-500">جلسة قراءة جارية</p>
          <p className="text-sm font-semibold text-reading leading-snug">تتراكم كحبّات الرمل…</p>
        </div>
        <button
          onClick={stop}
          className="flex items-center gap-1.5 bg-reading text-white text-sm font-bold rounded-xl px-4 py-2.5 press shrink-0"
        >
          <Square size={14} fill="currentColor" /> أنهِ وسجّل
        </button>
      </div>
    </Card>
  );
}
