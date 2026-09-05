"use client";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ } from "@/lib/types";
import { hifzProgress, hifzStreak, posOf, UNIT_LABEL } from "@/lib/quran/hifz";
import { arNum } from "@/lib/madar/format";
import { BookOpen, Flame, Layers, Sprout } from "lucide-react";

// ===================== لوحُ القسم: أين أنت من المصحف =====================
// كان أعلى الصفحة زخرفةً (دعاءٌ وآية) يليه شريطُ أرقامٍ مسطّح يكرّر ما في بطاقة
// الجلسة تحته — فيقرأ الرأسُ ثلاث بطاقاتٍ متساوية الوزن قبل أن يصل إلى الفعل.
// هنا **معلومةٌ واحدة لا تتكرّر في أيّ بطاقةٍ أخرى**: موضعك من المصحف ونسبةُ
// خطّتك وسلسلتُك. وعملُ اليوم يبقى حيث يُعمل — في بطاقة الجلسة. والآيةُ رجعت
// إلى ذيل الصفحة ختاماً، فالزخرفة لا تتصدّر الفعل.
const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;

export function QuranHero() {
  const h = useAppStore((s) => s.quranHifz) ?? EMPTY_HIFZ;
  if (!h.plan) return null;

  const prog = hifzProgress(h);
  const streak = hifzStreak(h);
  const started = prog.spanPages > 0 && prog.at != null;
  const start = posOf(h.plan.startId);

  return (
    <section className="mdr-quran-hero" aria-label="موضعك من المصحف">
      <div className="mdr-quran-hero-ring" aria-hidden>
        <svg viewBox="0 0 72 72">
          <defs>
            <linearGradient id="quranHeroRing" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.65" />
              <stop offset="100%" stopColor="var(--gold)" />
            </linearGradient>
          </defs>
          <circle cx="36" cy="36" r={RING_R} fill="none" stroke="var(--line)" strokeWidth="6" />
          <circle
            cx="36" cy="36" r={RING_R} fill="none"
            stroke="url(#quranHeroRing)" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - Math.min(100, prog.pct) / 100)}
            transform="rotate(-90 36 36)"
          />
        </svg>
        <span className="mdr-quran-hero-ring-label">
          <strong>{arNum(prog.pct)}٪</strong>
          <small>من الخطة</small>
        </span>
      </div>

      <div className="mdr-quran-hero-body">
        <span className="mdr-quran-hero-kicker">
          {prog.done ? "أتممت خطتك" : started ? "بلغتَ في المصحف" : "خطّتك على وشك أن تبدأ"}
        </span>
        <strong className="mdr-quran-hero-place">
          {prog.at ? `${prog.at.surahName} · آية ${arNum(prog.at.ayah)}` : "لم تسجّل حفظاً بعد"}
        </strong>
        {/* الحبّاتُ لا تخلو أبداً: قبل أوّل جلسةٍ لا موضعَ ولا سلسلة، فتقول
            اللوحةُ ما اخترتَه — وردُك ونقطةُ بدايتك — بدل شريطٍ فارغٍ عريض. */}
        <div className="mdr-quran-hero-chips">
          {started ? (
            <>
              <span><BookOpen size={12} /> صفحة {arNum(prog.page)}</span>
              <span><Layers size={12} /> جزء {arNum(prog.juz)}</span>
              <span><Sprout size={12} /> {arNum(prog.spanPages)} وجه محفوظ</span>
            </>
          ) : (
            <>
              <span><Sprout size={12} /> وردك {arNum(h.plan.amount)} {UNIT_LABEL[h.plan.unit]}</span>
              <span><BookOpen size={12} /> تبدأ من {start.surahName}</span>
            </>
          )}
          {streak > 0 && (
            <span className="is-streak"><Flame size={12} /> {arNum(streak)} يوم متتابع</span>
          )}
        </div>
      </div>
    </section>
  );
}
