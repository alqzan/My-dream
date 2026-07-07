"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Loader2 } from "lucide-react";

// Cap length + bitrate so a note stays well under the ~1MB per-document limit
// of the cloud media store (base64 inflates bytes by ~1.33×).
const MAX_SECONDS = 3 * 60;
const AUDIO_BITS = 24000; // 24 kbps — plenty for a spoken memo

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
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Records a voice note and returns it as a base64 data URL. The sync layer
 * lifts it into its own cloud media document (like photos), so it never bloats
 * the main synced document. `value` may be a data URL — it plays inline.
 */
export function AudioRecorder({
  value,
  onChange,
}: {
  value?: string;
  onChange: (audio: string | undefined) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  };

  useEffect(() => cleanup, []);

  async function start() {
    setError("");
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
          onChange(reader.result as string);
          setBusy(false);
        };
        reader.readAsDataURL(blob);
        cleanup();
        setRecording(false);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((s) => {
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
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

  if (value) {
    return (
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={value} className="h-9 flex-1 min-w-0" />
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="p-2 text-gray-400 hover:text-red-500 rounded-lg press"
          aria-label="حذف الملاحظة الصوتية"
        >
          <Trash2 size={16} />
        </button>
      </div>
    );
  }

  return (
    <div>
      {recording ? (
        <button
          type="button"
          onClick={stop}
          className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors press"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
          <Square size={15} />
          إيقاف · {fmt(elapsed)}
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="flex items-center justify-center gap-2 w-full h-12 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 text-sm hover:border-journal/40 transition-colors press"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} className="text-journal" />}
          {busy ? "جارٍ الحفظ..." : "تسجيل ملاحظة صوتية"}
        </button>
      )}
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}
