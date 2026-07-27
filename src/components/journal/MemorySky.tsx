"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseDate, entryPhotos, formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { Photo } from "@/components/ui/Photo";
import { skyView, entryVoice, silentDates, type MonthCluster, type EntryVoice } from "@/lib/memorySky";
import type { JournalEntry } from "@/lib/types";
import { ChevronRight, X, PenLine } from "lucide-react";

// ===================== سماء الذكريات =====================
// A night-sky dome where every memory is a star, a sibling to PrayerOrbit's
// "instrument in the sky": data as marks on a celestial diagram. Position is
// deterministic — the angle comes from the entry's day-of-year (the YearOrbit
// day→angle idiom) and the radius from a stable hash of its id, so entries
// fan out to different heights instead of clumping on one ray. Star size and
// brightness encode whether a memory carries a photo and/or is starred. Today's
// «في مثل هذا اليوم» memory (if any) streaks in as a gold comet.

// Dome geometry: an ellipse anchored at the horizon (bottom-centre). Points
// spread across the upper half. rx/ry keep every star inside the 100×66 box.
const VB_W = 100;
const VB_H = 66;
const HX = 50; // horizon centre x
const HY = 64; // horizon centre y (near the bottom edge)
const RX = 47; // horizontal reach → x stays within ~3..97
const RY = 55; // vertical reach → y reaches up to ~9

// day-of-year (0..365) in LOCAL time — never toISOString(). Only month/day
// matter for placement, so the year the entry belongs to is irrelevant.
function dayOfYear(dateStr: string): number {
  const d = parseDate(dateStr);
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

// FNV-ish string hash → a stable fraction in [0,1). Two seeds give two
// independent deterministic values per entry (radius + angle jitter).
function hashFrac(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// day-of-year → angle over the dome. Early days sit on the RIGHT (read first
// in RTL), late days on the LEFT. Kept clear of the horizon corners.
function baseAngle(doy: number): number {
  return 12 + (doy / 366) * 156; // 12°(right) … 168°(left)
}

function domePoint(angleDeg: number, f: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: HX + f * RX * Math.cos(rad), y: HY - f * RY * Math.sin(rad) };
}

interface Star {
  entry: JournalEntry;
  x: number;
  y: number;
  r: number; // visible star radius (viewBox units)
  o: number; // brightness (opacity)
  gold: boolean; // starred → gold, else pale white
  halo: boolean; // photo or starred → soft glow
  voice: EntryVoice; // نصّ / بلا كلمات (صورة أو صوت) / خالية
  delay: number; // twinkle stagger
}

// A handful of faint, non-interactive background stars for atmosphere. Kept
// deliberately tiny and dim so they never read as real (tappable) memories.
interface BgStar { x: number; y: number; r: number; o: number; }

interface MemorySkyProps {
  entries: JournalEntry[];
  // On-this-day memories from previous years (page already computes these),
  // most-recent first. Drives the comet.
  memories: JournalEntry[];
  onOpen: (entry: JournalEntry) => void;
  // فتح يومٍ صامت (لا مذكرة فيه) — لعرض اليوم والكتابة فيه.
  onPickDate?: (date: string) => void;
  // آخر يومٍ يُحسب ضمن «الأيام الصامتة» (اليوم عادةً) — يُمرَّر للاختبار.
  todayStr?: string;
}

export function MemorySky({ entries, memories, onOpen, onPickDate, todayStr }: MemorySkyProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    setReduceMotion(
      typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  // العرض التكيّفي: نجومٌ فردية عند القِلّة، وكوكباتٌ شهرية عند الكثرة.
  const view = useMemo(() => skyView(entries), [entries]);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [preview, setPreview] = useState<JournalEntry | null>(null);
  // مؤشّر التركيز المتنقّل (roving) — نجمةٌ واحدة قابلة للتركيز في كل لحظة.
  const [focusIdx, setFocusIdx] = useState(0);
  const nodeRefs = useRef<(SVGGElement | null)[]>([]);

  // الكوكبات (عند الكثرة) والشهر المفتوح للتنقّل داخله.
  const clusters = useMemo<MonthCluster[]>(() => (view.mode === "constellations" ? view.clusters : []), [view]);
  const activeMonth = useMemo(() => (openMonth ? clusters.find((c) => c.key === openMonth) ?? null : null), [openMonth, clusters]);
  // النجوم المعروضة الآن: كامل الأرشيف الصغير، أو نجوم الشهر المفتوح.
  const starEntries = useMemo(
    () => (view.mode === "stars" ? entries : activeMonth ? activeMonth.entries : []),
    [view, entries, activeMonth]
  );
  const showConstellations = view.mode === "constellations" && !activeMonth;

  // ===== الأيام الصامتة =====
  // الأيام التي لم تُكتب فيها مذكرة داخل المدى المعروض — تُرسم كحلقاتٍ خافتة
  // («مدارات خالية») على القبّة، ولمسها يفتح ذلك اليوم للكتابة فيه. اختياريّة
  // بمفتاحٍ صغير حتى لا تُثقل السماء إلا حين يطلبها المالك.
  const [showSilent, setShowSilent] = useState(false);
  const [silentPick, setSilentPick] = useState<string | null>(null);
  const now = todayStr ?? (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const silent = useMemo(() => {
    const scope = activeMonth ? activeMonth.entries : starEntries;
    if (!scope.length) return [] as string[];
    const dates = scope.map((e) => e.date).sort();
    const from = activeMonth ? `${activeMonth.key}-01` : dates[0];
    const latest = activeMonth
      ? [`${activeMonth.key}-31`, now].sort()[0] // آخر الشهر أو اليوم، أيّهما أسبق
      : dates[dates.length - 1];
    // نمدّ المدى إلى اليوم فقط داخل الشهر الجاري — تصفّح سنةٍ قديمة لا يعني
    // أنّ كل الأيام حتى اليوم «صامتة».
    const to = !activeMonth && latest < now && latest.slice(0, 7) === now.slice(0, 7) ? now : latest;
    return silentDates(scope, from, to);
  }, [activeMonth, starEntries, now]);
  const silentMarks = useMemo(
    () =>
      silent.map((date) => {
        const doy = dayOfYear(date);
        const jitter = (hashFrac(date, 0x45d9f3b) - 0.5) * 6;
        const angle = Math.max(8, Math.min(172, baseAngle(doy) + jitter));
        const f = 0.3 + hashFrac(date, 0x27d4eb2f) * 0.66;
        return { date, ...domePoint(angle, f) };
      }),
    [silent]
  );
  const showSilentMarks = showSilent && !showConstellations && silentMarks.length > 0;

  // إعادة ضبط التركيز عند تبدّل ما يُعرض.
  useEffect(() => { setFocusIdx(0); nodeRefs.current = []; setSilentPick(null); }, [openMonth, view.mode]);

  const interactiveCount = showConstellations ? clusters.length : starEntries.length;
  function moveFocus(delta: number) {
    if (interactiveCount === 0) return;
    const next = (focusIdx + delta + interactiveCount) % interactiveCount;
    setFocusIdx(next);
    nodeRefs.current[next]?.focus();
  }
  function onNodeKey(e: React.KeyboardEvent, activate: () => void) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); moveFocus(1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); moveFocus(-1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
  }

  const stars = useMemo<Star[]>(() => {
    return starEntries.map((entry) => {
      const key = entry.id || entry.date;
      const doy = dayOfYear(entry.date);
      const jitter = (hashFrac(key, 0x811c9dc5) - 0.5) * 7; // ±3.5°
      const angle = Math.max(8, Math.min(172, baseAngle(doy) + jitter));
      const f = 0.36 + hashFrac(key, 0x1000193) * 0.64; // radius fraction
      const { x, y } = domePoint(angle, f);
      const voice = entryVoice(entry);
      const hasPhoto = entryPhotos(entry).length > 0;
      const starred = !!entry.starred;
      const r = 0.5 + (hasPhoto ? 0.35 : 0) + (starred ? 0.35 : 0);
      const o = starred ? 0.98 : hasPhoto ? 0.85 : 0.55;
      return {
        entry, x, y, r, o, voice,
        gold: starred,
        halo: starred || hasPhoto,
        delay: hashFrac(key, 0x2a) * 3.6,
      };
    });
  }, [starEntries]);

  // مواقع الكوكبات الشهرية على القبّة (زاويتها من منتصف الشهر، وارتفاعها من هاش).
  const constellations = useMemo(() => {
    return clusters.map((c) => {
      const doy = dayOfYear(`${c.key}-15`);
      const f = 0.42 + hashFrac(c.key, 0x51ed) * 0.5;
      const { x, y } = domePoint(baseAngle(doy), f);
      const size = 1.4 + Math.min(1.6, Math.log2(c.count + 1) * 0.5);
      return { cluster: c, x, y, size };
    });
  }, [clusters]);

  // Deterministic decorative dust — seeded so the sky is stable across renders.
  const bgStars = useMemo<BgStar[]>(() => {
    const out: BgStar[] = [];
    let s = 0x9e3779b1;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
    for (let i = 0; i < 40; i++) {
      const angle = 6 + rnd() * 168;
      const f = 0.15 + rnd() * 0.9;
      const { x, y } = domePoint(angle, f);
      out.push({ x, y, r: 0.16 + rnd() * 0.22, o: 0.12 + rnd() * 0.22 });
    }
    return out;
  }, []);

  // Comet: today's on-this-day memory (most recent prior year) streaking toward
  // today's position on the dome. No on-this-day memory → no comet.
  const comet = useMemo(() => {
    if (!memories.length) return null;
    const target = memories[0];
    const doy = dayOfYear(target.date);
    const head = domePoint(baseAngle(doy), 0.9);
    // Tail trails down-and-inward so it (and its label) always stay inside the
    // dome regardless of where today falls on the ring. The head is the bright
    // end (current-day position); the tail fades out behind it.
    const tail = { x: head.x + 15, y: head.y + 13 };
    return { target, head, tail };
  }, [memories]);

  // فارغةٌ فقط حين لا مذكرات أصلاً. لا نعتمد على stars.length لأنّه صفرٌ في وضع
  // الكوكبات قبل فتح شهر (starEntries حينها = []) فكانت «السماء الخالية» تُغطّي
  // الكوكبات عند تجاوز الحدّ (>120 مذكرة).
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl overflow-hidden card-shadow" style={SKY_BG}>
        <div className="px-4 py-2">
          <EmptyState
            emoji="✦"
            title="سماؤك ما زالت خالية"
            subtitle="كل مذكرة تكتبها تصير نجمة في سمائك"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden card-shadow" style={SKY_BG}>
      {/* عنوان خافت أعلى اليمين — خط ثُمانية (serif) */}
      <div className="absolute top-3 right-4 z-10 text-right">
        <p className="text-[13px] font-bold text-[#e8c99a] leading-tight">
          {activeMonth ? activeMonth.label : "سماء الذكريات ✦"}
        </p>
        <p className="text-[10px] text-[#b9a8d6]/80 mt-0.5">
          {showConstellations
            ? `${clusters.length} كوكبة · ${entries.length} ذكرى`
            : activeMonth
              ? `${activeMonth.count} ذكرى`
              : `${stars.length} نجمة · المس نجمةً للمعاينة`}
        </p>
      </div>

      {/* رجوعٌ من سماء الشهر إلى الكوكبات */}
      {activeMonth && (
        <button
          onClick={() => { setOpenMonth(null); setPreview(null); }}
          className="absolute top-3 left-3 z-10 inline-flex items-center gap-1 text-[11px] font-semibold text-[#e8c99a] bg-white/10 hover:bg-white/20 rounded-full px-2.5 py-1 press"
        >
          <ChevronRight size={13} /> الكوكبات
        </button>
      )}

      {/* minHeight احتياطٌ لمتصفّحات لا تدعم aspect-ratio (Safari قديم على iOS/iPad):
          دونها ينهار ارتفاع الحاوية إلى صفر فتختفي السماء بالكامل. */}
      <div className="relative w-full" style={{ aspectRatio: `${VB_W} / ${VB_H}`, minHeight: 180 }}>
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="absolute inset-0 w-full h-full overflow-visible">
          <defs>
            <radialGradient id="skyHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff8e6" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#fff8e6" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="skyHaloGold" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f0c674" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#f0c674" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="cometTail" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f4d488" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#f4d488" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* غبار نجميّ خافت — للأجواء فقط، غير قابل للضغط */}
          <g style={{ pointerEvents: "none" }}>
            {bgStars.map((b, i) => (
              <circle key={i} cx={b.x} cy={b.y} r={b.r} fill="#e9e3f5" opacity={b.o} />
            ))}
          </g>

          {/* المذنّب — «في مثل هذا اليوم» (في السماء العليا فقط) */}
          {comet && !activeMonth && (
            <g
              role="button"
              tabIndex={0}
              aria-label="في مثل هذا اليوم — افتح الذكرى"
              onClick={() => onOpen(comet.target)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(comet.target); }}
              style={{ cursor: "pointer" }}
            >
              <path
                d={`M ${comet.tail.x} ${comet.tail.y} L ${comet.head.x} ${comet.head.y}`}
                stroke="url(#cometTail)"
                strokeWidth="2.4"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx={comet.head.x} cy={comet.head.y} r="3.4" fill="url(#skyHaloGold)" />
              <circle
                cx={comet.head.x} cy={comet.head.y} r="1.35" fill="#fff3d6"
                className={reduceMotion ? undefined : "sky-comet-head"}
                style={{ transformBox: "fill-box" }}
              />
              {/* منطقة ضغط أوسع */}
              <circle cx={comet.head.x} cy={comet.head.y} r="4.5" fill="transparent" />
            </g>
          )}

          {/* الكوكبات الشهرية (عند الكثرة) — تركيزٌ متنقّل */}
          {showConstellations && constellations.map((c, i) => (
            <g
              key={c.cluster.key}
              ref={(el) => { nodeRefs.current[i] = el; }}
              role="button"
              tabIndex={i === focusIdx ? 0 : -1}
              aria-label={`${c.cluster.label} — ${c.cluster.count} ذكرى`}
              onFocus={() => setFocusIdx(i)}
              onClick={() => { setOpenMonth(c.cluster.key); setPreview(null); }}
              onKeyDown={(e) => onNodeKey(e, () => { setOpenMonth(c.cluster.key); setPreview(null); })}
              style={{ cursor: "pointer" }}
            >
              <circle cx={c.x} cy={c.y} r={c.size * 2.6} fill="url(#skyHalo)" opacity={0.5} />
              {/* عنقودٌ صغير من النجيمات يوحي بكوكبة */}
              {[[0, 0], [0.8, -0.6], [-0.7, 0.5], [0.6, 0.8], [-0.9, -0.4]].map(([dx, dy], k) => (
                <circle key={k} cx={c.x + dx * c.size} cy={c.y + dy * c.size} r={c.size * (k === 0 ? 0.5 : 0.3)} fill="#fdfbf5" opacity={0.9 - k * 0.12} />
              ))}
              {i === focusIdx && <circle cx={c.x} cy={c.y} r={c.size * 3} fill="none" stroke="#f4d488" strokeOpacity="0.8" strokeWidth="0.5" />}
              <circle cx={c.x} cy={c.y} r={Math.max(4, c.size * 3)} fill="transparent" />
            </g>
          ))}

          {/* الأيام الصامتة — حلقاتٌ خافتة، لمسها يفتح اليوم للكتابة */}
          {showSilentMarks && silentMarks.map((m) => (
            <g
              key={`silent-${m.date}`}
              role="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => { setPreview(null); setSilentPick(m.date); }}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={m.x} cy={m.y} r={0.85}
                fill="none" stroke="#b9a8d6"
                strokeWidth={silentPick === m.date ? 0.5 : 0.28}
                strokeOpacity={silentPick === m.date ? 0.95 : 0.4}
              />
              <circle cx={m.x} cy={m.y} r={2.8} fill="transparent" />
            </g>
          ))}

          {/* نجوم الذكريات — تركيزٌ متنقّل ومعاينةٌ عند اللمس */}
          {!showConstellations && stars.map((st, i) => (
            <g
              key={st.entry.id}
              ref={(el) => { nodeRefs.current[i] = el; }}
              role="button"
              tabIndex={i === focusIdx ? 0 : -1}
              aria-label={st.entry.title ? `${st.entry.title} — ${formatDate(st.entry.date)}` : formatDate(st.entry.date)}
              onFocus={() => setFocusIdx(i)}
              onClick={() => { setSilentPick(null); setPreview(st.entry); }}
              onKeyDown={(e) => onNodeKey(e, () => setPreview(st.entry))}
              style={{ cursor: "pointer" }}
            >
              {st.halo && (
                <circle cx={st.x} cy={st.y} r={st.r * 3.2} fill={st.gold ? "url(#skyHaloGold)" : "url(#skyHalo)"} />
              )}
              {/* مذكرةٌ بلا كلمات (صورة أو صوت فقط) تُرسم حلقةً مضيئة بدل قرصٍ
                  مصمت — تُقرأ من السماء دون فتحها. */}
              <circle
                cx={st.x} cy={st.y} r={st.voice === "text" ? st.r : st.r + 0.35}
                fill={st.voice === "text" ? (st.gold ? "#f4d488" : "#fdfbf5") : "none"}
                stroke={st.voice === "text" ? undefined : st.gold ? "#f4d488" : "#cfe3ff"}
                strokeWidth={st.voice === "text" ? undefined : 0.42}
                className={reduceMotion ? undefined : "sky-star"}
                style={reduceMotion ? { opacity: st.o } : ({ "--star-o": st.o, animationDelay: `${st.delay}s` } as React.CSSProperties)}
              />
              {preview?.id === st.entry.id && (
                <circle cx={st.x} cy={st.y} r={st.r + 1.6} fill="none" stroke="#f4d488" strokeOpacity="0.85" strokeWidth="0.6" />
              )}
              {/* منطقة ضغط أوسع للنجوم الصغيرة */}
              <circle cx={st.x} cy={st.y} r={3.2} fill="transparent" />
            </g>
          ))}
        </svg>

        {/* تسمية المذنّب — بمحاذاة RTL قرب رأسه */}
        {comet && !activeMonth && (
          <div
            className="absolute z-10 pointer-events-none"
            style={{
              left: `${(comet.head.x / VB_W) * 100}%`,
              top: `${(comet.head.y / VB_H) * 100}%`,
              transform: "translate(-98%, 58%)",
            }}
          >
            <span className="whitespace-nowrap text-[10px] font-bold text-[#f4d488]">في مثل هذا اليوم 🕰️</span>
          </div>
        )}
      </div>

      {/* بطاقة اليوم الصامت — يومٌ بلا مذكرة، ودعوةٌ للكتابة فيه */}
      {silentPick && (
        <div className="absolute inset-x-3 bottom-3 z-20 bg-[#1c1435]/95 border border-[#b9a8d6]/25 rounded-2xl p-3 backdrop-blur animate-fade-up">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-[#b9a8d6]/30 flex items-center justify-center text-lg shrink-0">🌑</div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-[#b9a8d6]">{formatDate(silentPick)}</div>
              <p className="text-sm font-bold text-[#f4ead6]">يومٌ صامت</p>
              <p className="text-[11px] text-[#cfc4e6] mt-0.5">ما كتبت فيه شيئاً — تحبّ تضيء نجمته الآن؟</p>
            </div>
            <button onClick={() => setSilentPick(null)} aria-label="إغلاق" className="shrink-0 text-[#b9a8d6] hover:text-white press">
              <X size={16} />
            </button>
          </div>
          {onPickDate && (
            <button
              onClick={() => { const d = silentPick; setSilentPick(null); onPickDate(d); }}
              className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold text-[#1c1435] bg-[#e8c99a] hover:brightness-105 rounded-lg py-2 press"
            >
              <PenLine size={13} /> افتح هذا اليوم
            </button>
          )}
        </div>
      )}

      {/* بطاقة معاينة النجمة — تاريخ، عنوان، سطر، صورة، وزر فتح */}
      {preview && (
        <div className="absolute inset-x-3 bottom-3 z-20 bg-[#1c1435]/95 border border-[#e8c99a]/25 rounded-2xl p-3 backdrop-blur animate-fade-up">
          <div className="flex items-start gap-3">
            {entryPhotos(preview).length > 0 && (
              <Photo images={entryPhotos(preview)} index={0} className="w-14 h-14 rounded-xl object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-[#b9a8d6]">{formatDate(preview.date)}</div>
              {preview.title && <div className="text-sm font-bold text-[#f4ead6] truncate">{preview.title}</div>}
              <p className="text-[11px] text-[#cfc4e6] line-clamp-2 mt-0.5">{preview.content}</p>
            </div>
            <button onClick={() => setPreview(null)} aria-label="إغلاق المعاينة" className="shrink-0 text-[#b9a8d6] hover:text-white press">
              <X size={16} />
            </button>
          </div>
          <button
            onClick={() => { const e = preview; setPreview(null); onOpen(e); }}
            className="mt-2.5 w-full text-xs font-bold text-[#1c1435] bg-[#e8c99a] hover:brightness-105 rounded-lg py-2 press"
          >
            افتح المذكرة
          </button>
        </div>
      )}

      {/* أسطورة خفيفة أسفل السماء + مفتاح الأيام الصامتة */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 pb-3 pt-0.5 text-[10px] text-[#b9a8d6]/80">
        <span className="flex items-center gap-1"><span className="text-[#f4d488]">✦</span> مفضّلة</span>
        <span className="flex items-center gap-1"><span className="text-white">✦</span> بصورة</span>
        <span className="flex items-center gap-1"><span className="text-white/50 text-[8px]">✦</span> مذكرة</span>
        <span className="flex items-center gap-1"><span className="text-[#cfe3ff]">◌</span> بلا كلمات</span>
        {!showConstellations && silentMarks.length > 0 && (
          <button
            onClick={() => { setShowSilent((v) => !v); setSilentPick(null); }}
            aria-pressed={showSilent}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border press transition-colors ${
              showSilent
                ? "border-[#e8c99a]/60 text-[#e8c99a] bg-white/10"
                : "border-white/15 text-[#b9a8d6]/80 hover:border-white/30"
            }`}
          >
            🌑 الأيام الصامتة ({silentMarks.length})
          </button>
        )}
      </div>
    </div>
  );
}

// Deep journal-purple night, drifting to near-black toward the horizon. A
// deliberately dark surface in BOTH themes — like a real night sky — so it
// doesn't follow the .dark parchment remap.
const SKY_BG: React.CSSProperties = {
  background:
    "radial-gradient(120% 90% at 50% 100%, #2a1c47 0%, #1c1435 42%, #0f0a1f 74%, #080510 100%)",
};
