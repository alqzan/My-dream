"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Play, Square, Timer } from "lucide-react";
import { buzz } from "@/lib/utils";

const START_KEY = "madar-reading-start";

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

  return (
    <Card className="animate-fade-up border-reading/30 bg-reading/5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-reading/15 text-reading flex items-center justify-center shrink-0">
          <Timer size={20} className="animate-pulse" />
        </div>
        <div className="flex-1">
          <p className="text-[11px] text-gray-500">جلسة قراءة جارية</p>
          <p className="text-2xl font-black text-reading tabular-nums leading-tight" dir="ltr">
            {mm}:{ss}
          </p>
        </div>
        <button
          onClick={stop}
          className="flex items-center gap-1.5 bg-reading text-white text-sm font-bold rounded-xl px-4 py-2.5 press"
        >
          <Square size={14} fill="currentColor" /> أنهِ وسجّل
        </button>
      </div>
    </Card>
  );
}
