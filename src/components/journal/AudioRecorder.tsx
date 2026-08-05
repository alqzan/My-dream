"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Loader2, Pause, Play } from "lucide-react";

// المدّة القصوى: **ساعة كاملة**. الثلاث دقائق القديمة كانت قيداً على زمنٍ مضى
// يوم كانت الوسائط تُحفظ داخل مستند Firestore (سقف 1MB للمستند). الصوت اليوم
// يُرفع ملفّاً مستقلاً إلى R2، وسقف الـWorker للصوت 32MB — والساعة عند 24 kbps
// تزن ~11MB، فتبقى دون السقف بمساحةٍ مريحة.
const MAX_SECONDS = 60 * 60;
const AUDIO_BITS = 24000; // 24 kbps — plenty for a spoken memo
// عدد المقاطع في المذكرة الواحدة.
export const MAX_AUDIO_NOTES = 10;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  });
}

function fmt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? m.toString().padStart(2, "0") : m.toString();
  return `${h > 0 ? `${h}:` : ""}${mm}:${s.toString().padStart(2, "0")}`;
}

// حجمٌ تقريبيّ من طول الـdata URL (base64 ينفخ البايتات ×4/3) — ليعرف المالك
// وزن المقطع الطويل قبل أن يتراكم.
function approxSize(dataUrl: string): string {
  const bytes = Math.max(0, (dataUrl.length - (dataUrl.indexOf(",") + 1)) * 0.75);
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
  return `${Math.round(bytes / 1024)} ك.ب`;
}

/**
 * Records voice notes and returns them as base64 data URLs. The sync layer
 * lifts each one into its own cloud media object (like photos), so they never
 * bloat the main synced document. `values` may hold data URLs — they play
 * inline. Up to `max` notes per entry, each up to an hour long.
 */
export function AudioRecorder({
  values,
  onChange,
  max = MAX_AUDIO_NOTES,
}: {
  values: string[];
  onChange: (audios: string[]) => void;
  max?: number;
}) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const pausedRef = useRef(false);
  // آخر قائمةٍ معروفة — يقرأها `onstop` بعد دقائق من بدء التسجيل، فلا يجوز أن
  // يغلق على نسخةٍ قديمة فيمحو مقطعاً أُضيف أثناءه.
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    pausedRef.current = false;
    setPaused(false);
  };

  useEffect(() => cleanup, []);

  async function start() {
    setError("");
    if (values.length >= max) return;
    const mimeType = pickMimeType();
    if (!mimeType) {
      setError("التسجيل الصوتي غير مدعوم في هذا المتصفح");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: AUDIO_BITS });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setBusy(true);
        const reader = new FileReader();
        reader.onloadend = () => {
          onChange([...valuesRef.current, reader.result as string].slice(0, max));
          setBusy(false);
        };
        reader.readAsDataURL(blob);
        cleanup();
        setRecording(false);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      elapsedRef.current = 0;
      setElapsed(0);
      timerRef.current = setInterval(() => {
        if (pausedRef.current) return; // الإيقاف المؤقّت يجمّد العدّاد كما يجمّد التسجيل
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
        if (elapsedRef.current >= MAX_SECONDS) stop();
      }, 1000);
    } catch {
      setError("تعذّر الوصول إلى الميكروفون. تأكّد من الإذن.");
      cleanup();
    }
  }

  function stop() {
    try {
      recorderRef.current?.stop();
    } catch {
      cleanup();
      setRecording(false);
    }
  }

  // إيقافٌ مؤقّت — ضرورةٌ عمليّة حين يمتدّ المقطع إلى ساعة: تلتقط أنفاسك ثمّ
  // تكمل في نفس الملف بدل أن تبدأ مقطعاً جديداً.
  function togglePause() {
    const rec = recorderRef.current;
    if (!rec) return;
    try {
      if (rec.state === "recording") {
        rec.pause();
        pausedRef.current = true;
        setPaused(true);
      } else if (rec.state === "paused") {
        rec.resume();
        pausedRef.current = false;
        setPaused(false);
      }
    } catch {
      /* متصفّح لا يدعم الإيقاف المؤقّت — يبقى التسجيل جارياً */
    }
  }

  const remaining = MAX_SECONDS - elapsed;

  return (
    <div className="space-y-2">
      {values.map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          {values.length > 1 && (
            <span className="text-[10px] text-gray-400 tabular-nums w-3 text-center shrink-0">{i + 1}</span>
          )}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls preload="metadata" src={a} className="h-9 flex-1 min-w-0" />
          <span className="text-[10px] text-gray-300 tabular-nums shrink-0">{approxSize(a)}</span>
          <button
            type="button"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="p-2 text-gray-400 hover:text-red-500 rounded-lg press shrink-0"
            aria-label={`حذف الملاحظة الصوتية ${i + 1}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}

      {recording ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={stop}
            className="flex items-center justify-center gap-2 flex-1 h-12 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors press"
          >
            <span className={`w-2.5 h-2.5 rounded-full bg-white ${paused ? "opacity-50" : "animate-pulse"}`} />
            <Square size={15} />
            إيقاف · {fmt(elapsed)}
          </button>
          <button
            type="button"
            onClick={togglePause}
            className="flex items-center justify-center w-12 h-12 rounded-xl border border-gray-200 text-gray-500 hover:border-journal/40 transition-colors press"
            aria-label={paused ? "متابعة التسجيل" : "إيقاف مؤقّت"}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
        </div>
      ) : values.length < max ? (
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="flex items-center justify-center gap-2 w-full h-12 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 text-sm hover:border-journal/40 transition-colors press"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} className="text-journal" />}
          {busy ? "جارٍ الحفظ..." : values.length ? "أضف مقطعاً آخر" : "تسجيل ملاحظة صوتية"}
        </button>
      ) : (
        <p className="text-[10px] text-gray-300 text-center">وصلت الحد الأقصى ({max} مقاطع)</p>
      )}

      {recording ? (
        <p className="text-[10px] text-gray-300 text-center">
          {paused ? "موقوف مؤقّتاً — " : ""}المتبقّي {fmt(remaining)} من ساعة
        </p>
      ) : (
        !busy &&
        values.length < max && (
          <p className="text-[10px] text-gray-300 text-center">حتى ساعة للمقطع الواحد · {max} مقاطع للمذكرة</p>
        )
      )}

      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}
