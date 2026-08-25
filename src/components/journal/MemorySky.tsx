"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseDate, formatDate, arabicMonthName, toIndicDigits } from "@/lib/utils";
import { plainTitle } from "@/lib/markdown";
import { entryPhotoSources, hasPhoto as entryHasPhoto } from "@/lib/mediaSources";
import { useMediaCacheVersion, resolveMedia } from "@/components/ui/useMedia";
import { EmptyState } from "@/components/ui/EmptyState";
import { Photo } from "@/components/ui/Photo";
import {
  clusterByYear,
  clusterByDay,
  entryVoice,
  silentDates,
  type DayPlanet,
  type EntryVoice,
  type MonthCluster,
  type YearGalaxy,
} from "@/lib/memorySky";
import { MOOD_SKY } from "@/lib/memoryDome";
import type { JournalEntry } from "@/lib/types";
import { ChevronRight, X, PenLine } from "lucide-react";

// ===================== سماء الذكريات =====================
// خريطةٌ سماويةٌ هرمية: مجرّةٌ لكل سنة، ونجمةٌ لكل شهر داخل السنة، ثم كوكبٌ
// لكل يوم داخل الشهر. المواضع شبه عشوائية لكنها حتمية ومتباعدة، فلا تقفز عند
// كل فتح ولا تتراصّ الأشهر المتشابهة فوق مسارٍ واحد.

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

interface SkyPoint { x: number; y: number; }

// Best-candidate scatter: لكل عنصر مجموعة مرشحين ثابتة من الهاش، ونختار أبعدها
// عن النقاط الموضوعة. النتيجة تبدو طبيعية ومتفرقة من دون عشوائية متبدلة.
function scatterPoints(
  keys: string[],
  seed: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): Map<string, SkyPoint> {
  const out = new Map<string, SkyPoint>();
  const placed: SkyPoint[] = [];
  for (const key of [...keys].sort()) {
    let best: SkyPoint | null = null;
    let bestScore = -1;
    for (let i = 0; i < 96; i++) {
      const x = bounds.minX + hashFrac(key + ":" + i + ":x", seed) * (bounds.maxX - bounds.minX);
      const y = bounds.minY + hashFrac(key + ":" + i + ":y", seed ^ 0x9e3779b9) * (bounds.maxY - bounds.minY);
      const edge = Math.min(x - bounds.minX, bounds.maxX - x, y - bounds.minY, bounds.maxY - y);
      const distance = placed.length
        ? Math.min(...placed.map((p) => (p.x - x) ** 2 + (p.y - y) ** 2))
        : edge * edge;
      const score = distance + edge * 0.08;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    if (best) { out.set(key, best); placed.push(best); }
  }
  return out;
}

const GALAXY_DOTS = Array.from({ length: 26 }, (_, i) => {
  const t = i / 25;
  const arm = i % 2;
  const a = t * Math.PI * 3.4 + arm * Math.PI;
  const radius = 0.25 + t * 3.6;
  return {
    x: Math.cos(a) * radius,
    y: Math.sin(a) * radius * 0.42,
    r: 0.13 + (1 - t) * 0.16,
    o: 0.42 + (1 - t) * 0.5,
  };
});

interface GalaxyMark {
  galaxy: YearGalaxy;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color: string;
}

interface MonthStarMark {
  cluster: MonthCluster;
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
}

interface PlanetMark {
  day: DayPlanet;
  x: number;
  y: number;
  r: number;
  color: string;
  gold: boolean;
  hasPhoto: boolean;
  voice: EntryVoice;
  delay: number;
}

// A handful of faint, non-interactive background stars for atmosphere. Kept
// deliberately tiny and dim so they never read as real (tappable) memories.
interface BgStar { x: number; y: number; r: number; o: number; }

function dominantMood(entries: JournalEntry[]): number {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    const mood = entry.mood ?? 3;
    counts.set(mood, (counts.get(mood) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 3;
}

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

  const galaxies = useMemo<YearGalaxy[]>(() => clusterByYear(entries), [entries]);
  const [openYear, setOpenYear] = useState<number | null>(null);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [preview, setPreview] = useState<JournalEntry | null>(null);
  const [dayPreview, setDayPreview] = useState<DayPlanet | null>(null);
  // بايتات صور المعاينة تُقرأ من مخزن الهاش عند العرض — الاشتراك هنا يُعيد
  // الرسم لحظة وصولها. سؤال «هل للمذكرة صورة؟» في السماء نفسها لا يقرأ
  // بايتات إطلاقاً (entryHasPhoto)، وإلا حمّلنا المكتبة كلها لرسم نقاط.
  useMediaCacheVersion();
  const previewPhotos = preview ? resolveMedia(entryPhotoSources(preview)) : [];
  // مؤشّر تركيز واحد متنقّل في كل مستوى من مستويات السماء.
  const [focusIdx, setFocusIdx] = useState(0);
  const nodeRefs = useRef<(SVGGElement | null)[]>([]);

  const activeGalaxy = useMemo(
    () => (openYear === null ? null : galaxies.find((g) => g.year === openYear) ?? null),
    [openYear, galaxies]
  );
  const monthClusters = useMemo<MonthCluster[]>(() => activeGalaxy?.months ?? [], [activeGalaxy]);
  const activeMonth = useMemo(
    () => (openMonth ? monthClusters.find((m) => m.key === openMonth) ?? null : null),
    [openMonth, monthClusters]
  );
  const dayPlanets = useMemo<DayPlanet[]>(
    () => (activeMonth ? clusterByDay(activeMonth.entries) : []),
    [activeMonth]
  );
  const showGalaxies = !activeGalaxy;
  const showMonths = !!activeGalaxy && !activeMonth;
  const showPlanets = !!activeMonth;

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
    if (!activeMonth?.entries.length) return [] as string[];
    const from = `${activeMonth.key}-01`;
    const to = [`${activeMonth.key}-31`, now].sort()[0];
    return silentDates(activeMonth.entries, from, to);
  }, [activeMonth, now]);
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
  const showSilentMarks = showSilent && showPlanets && silentMarks.length > 0;

  // إعادة ضبط التركيز عند تبدّل ما يُعرض.
  useEffect(() => {
    setFocusIdx(0);
    nodeRefs.current = [];
    setSilentPick(null);
    setPreview(null);
    setDayPreview(null);
  }, [openYear, openMonth]);

  const interactiveCount = showGalaxies
    ? galaxies.length
    : showMonths
      ? monthClusters.length
      : dayPlanets.length;
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
  function previewPlanet(day: DayPlanet) {
    setSilentPick(null);
    if (day.count === 1) {
      setDayPreview(null);
      setPreview(day.entries[0]);
    } else {
      setPreview(null);
      setDayPreview(day);
    }
  }

  const galaxyMarks = useMemo<GalaxyMark[]>(() => {
    const points = scatterPoints(
      galaxies.map((g) => g.key),
      0x6a09e667,
      { minX: 12, maxX: 88, minY: 16, maxY: 53 }
    );
    return galaxies.map((galaxy) => {
      const point = points.get(galaxy.key) ?? { x: 50, y: 34 };
      return {
        galaxy,
        ...point,
        scale: 0.9 + Math.min(0.48, Math.log2(galaxy.count + 1) * 0.055),
        rotation: hashFrac(galaxy.key, 0xa113) * 160 - 80,
        color: MOOD_SKY[dominantMood(galaxy.entries)] ?? MOOD_SKY[3],
      };
    });
  }, [galaxies]);

  const monthMarks = useMemo<MonthStarMark[]>(() => {
    const points = scatterPoints(
      monthClusters.map((m) => m.key),
      0xbb67ae85,
      { minX: 9, maxX: 91, minY: 15, maxY: 54 }
    );
    return monthClusters.map((cluster) => {
      const point = points.get(cluster.key) ?? { x: 50, y: 34 };
      return {
        cluster,
        ...point,
        size: 0.95 + Math.min(0.72, Math.log2(cluster.count + 1) * 0.14),
        color: MOOD_SKY[dominantMood(cluster.entries)] ?? MOOD_SKY[3],
        delay: hashFrac(cluster.key, 0x2a) * 3.6,
      };
    });
  }, [monthClusters]);

  const planetMarks = useMemo<PlanetMark[]>(() => {
    const points = scatterPoints(
      dayPlanets.map((d) => d.key),
      0x3c6ef372,
      { minX: 7, maxX: 93, minY: 13, maxY: 57 }
    );
    return dayPlanets.map((day) => {
      const point = points.get(day.key) ?? { x: 50, y: 34 };
      const hasPhoto = day.entries.some(entryHasPhoto);
      const gold = day.entries.some((e) => !!e.starred);
      const voices = day.entries.map(entryVoice);
      const voice: EntryVoice = voices.includes("text") ? "text" : voices.includes("media") ? "media" : "empty";
      return {
        day,
        ...point,
        r: 0.95 + (hasPhoto ? 0.16 : 0) + (gold ? 0.18 : 0) + Math.min(0.28, Math.log2(day.count + 1) * 0.12),
        color: MOOD_SKY[dominantMood(day.entries)] ?? MOOD_SKY[3],
        gold,
        hasPhoto,
        voice,
        delay: hashFrac(day.key, 0x2a) * 3.6,
      };
    });
  }, [dayPlanets]);

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

  // فارغةٌ فقط حين لا مذكرات أصلاً؛ بقية الحالات تدخل هرم السنة/الشهر/اليوم.
  if (entries.length === 0) {
    return (
      <div className="mdr-memory-sky rounded-2xl overflow-hidden card-shadow" style={SKY_BG}>
        <div className="px-4 py-2">
          <EmptyState
            emoji="✦"
            title="سماؤك ما زالت خالية"
            subtitle="كل سنةٍ تصير مجرّة، وكل شهرٍ نجمة، وكل يومٍ كوكباً"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mdr-memory-sky relative rounded-2xl overflow-hidden card-shadow" style={SKY_BG}>
      {/* عنوان خافت أعلى اليمين — خط ثُمانية (serif) */}
      <div className="absolute top-3 right-4 z-10 text-right">
        <p className="text-[13px] font-bold text-[#e8c99a] leading-tight">
          {activeMonth
            ? toIndicDigits(activeMonth.label)
            : activeGalaxy
              ? "مجرة " + toIndicDigits(String(activeGalaxy.year))
              : "سماء الذكريات ✦"}
        </p>
        <p className="text-[10px] text-[#b9a8d6]/80 mt-0.5">
          {showGalaxies
            ? toIndicDigits(String(galaxies.length)) + " مجرات · " + toIndicDigits(String(entries.length)) + " ذكرى"
            : showMonths
              ? toIndicDigits(String(monthClusters.length)) + " نجمة شهر · " + toIndicDigits(String(activeGalaxy?.count ?? 0)) + " ذكرى"
              : toIndicDigits(String(dayPlanets.length)) + " كوكب يوم · " + toIndicDigits(String(activeMonth?.count ?? 0)) + " ذكرى"}
        </p>
      </div>

      {/* رجوعٌ مستوىً واحداً: الشهر ← السنة ← كل المجرات. */}
      {activeGalaxy && (
        <button
          onClick={() => {
            if (activeMonth) setOpenMonth(null);
            else setOpenYear(null);
          }}
          className="absolute top-3 left-3 z-10 inline-flex items-center gap-1 text-[11px] font-semibold text-[#e8c99a] bg-white/10 hover:bg-white/20 rounded-full px-2.5 py-1 press"
        >
          <ChevronRight size={13} />
          {activeMonth ? "مجرة " + toIndicDigits(String(activeGalaxy.year)) : "كل المجرات"}
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
            <radialGradient id="galaxyMist" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff8e6" stopOpacity="0.4" />
              <stop offset="45%" stopColor="#c9bce8" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#c9bce8" stopOpacity="0" />
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
          {comet && showGalaxies && (
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

          {/* المستوى الأول: مجرّةٌ حلزونية لكل سنة، متفرقة بلا هالات دائرية متلاصقة. */}
          {showGalaxies && galaxyMarks.map((g, i) => (
            <g
              key={g.galaxy.key}
              ref={(el) => { nodeRefs.current[i] = el; }}
              role="button"
              className="group focus:outline-none"
              tabIndex={i === focusIdx ? 0 : -1}
              aria-label={"مجرة " + toIndicDigits(String(g.galaxy.year)) + " — " + toIndicDigits(String(g.galaxy.count)) + " ذكرى"}
              onFocus={() => setFocusIdx(i)}
              onClick={() => { setOpenYear(g.galaxy.year); setOpenMonth(null); }}
              onKeyDown={(e) => onNodeKey(e, () => { setOpenYear(g.galaxy.year); setOpenMonth(null); })}
              style={{ cursor: "pointer" }}
            >
              <g transform={"translate(" + g.x + " " + g.y + ") rotate(" + g.rotation + ") scale(" + g.scale + ")"}>
                <ellipse rx="5.4" ry="2.5" fill="url(#galaxyMist)" />
                {GALAXY_DOTS.map((dot, k) => (
                  <circle key={k} cx={dot.x} cy={dot.y} r={dot.r} fill={k < 4 ? "#fff4d9" : g.color} opacity={dot.o} />
                ))}
                <ellipse rx="1.35" ry="0.62" fill={g.color} opacity="0.44" />
                <circle r="0.48" fill="#fff8e6" opacity="0.96" />
              </g>
              <ellipse
                cx={g.x} cy={g.y} rx={7.2 * g.scale} ry={4.2 * g.scale}
                fill="none" stroke="#f4d488" strokeOpacity="0.85" strokeWidth="0.45"
                className="opacity-0 group-focus-visible:opacity-100"
              />
              <ellipse cx={g.x} cy={g.y} rx={Math.max(7, 6.2 * g.scale)} ry={Math.max(4.5, 3.5 * g.scale)} fill="transparent" />
              <text x={g.x} y={g.y + 5.1 * g.scale} textAnchor="middle" fill="#f4ead6" fontSize="2.2" fontWeight="700">
                {toIndicDigits(String(g.galaxy.year))}
              </text>
            </g>
          ))}

          {/* المستوى الثاني: نجمٌ مستقل لكل شهر داخل مجرّة السنة. */}
          {showMonths && monthMarks.map((m, i) => (
            <g
              key={m.cluster.key}
              ref={(el) => { nodeRefs.current[i] = el; }}
              role="button"
              className="group focus:outline-none"
              tabIndex={i === focusIdx ? 0 : -1}
              aria-label={arabicMonthName(m.cluster.month - 1) + " — " + toIndicDigits(String(m.cluster.count)) + " ذكرى"}
              onFocus={() => setFocusIdx(i)}
              onClick={() => setOpenMonth(m.cluster.key)}
              onKeyDown={(e) => onNodeKey(e, () => setOpenMonth(m.cluster.key))}
              style={{ cursor: "pointer" }}
            >
              <circle cx={m.x} cy={m.y} r={m.size * 2.7} fill="url(#skyHalo)" opacity="0.34" />
              <g transform={"translate(" + m.x + " " + m.y + ") scale(" + m.size + ")"}>
                <path
                  d="M 0 -1.7 L .34 -.36 L 1.7 0 L .34 .36 L 0 1.7 L -.34 .36 L -1.7 0 L -.34 -.36 Z"
                  fill={m.color}
                  className={reduceMotion ? undefined : "sky-star"}
                  style={reduceMotion ? { opacity: 0.94 } : ({ "--star-o": 0.94, animationDelay: m.delay + "s" } as React.CSSProperties)}
                />
                <circle r="0.35" fill="#fff8e6" />
              </g>
              <circle
                cx={m.x} cy={m.y} r={m.size * 2.45}
                fill="none" stroke="#f4d488" strokeOpacity="0.85" strokeWidth="0.45"
                className="opacity-0 group-focus-visible:opacity-100"
              />
              <circle cx={m.x} cy={m.y} r={Math.max(3.8, m.size * 2.7)} fill="transparent" />
              <text x={m.x} y={m.y + m.size * 2.8} textAnchor="middle" fill="#dcd2eb" fontSize="1.75" fontWeight="650">
                {arabicMonthName(m.cluster.month - 1)}
              </text>
            </g>
          ))}

          {/* الأيام الصامتة — حلقاتٌ خافتة، لمسها يفتح اليوم للكتابة */}
          {showSilentMarks && silentMarks.map((m) => (
            <g
              key={`silent-${m.date}`}
              role="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => { setPreview(null); setDayPreview(null); setSilentPick(m.date); }}
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

          {/* المستوى الثالث: كوكبٌ لكل يوم، ورقم اليوم في قلبه. */}
          {showPlanets && planetMarks.map((planet, i) => (
            <g
              key={planet.day.key}
              ref={(el) => { nodeRefs.current[i] = el; }}
              role="button"
              className="group focus:outline-none"
              tabIndex={i === focusIdx ? 0 : -1}
              aria-label={formatDate(planet.day.date) + " — " + toIndicDigits(String(planet.day.count)) + " ذكرى"}
              onFocus={() => setFocusIdx(i)}
              onClick={() => previewPlanet(planet.day)}
              onKeyDown={(e) => onNodeKey(e, () => previewPlanet(planet.day))}
              style={{ cursor: "pointer" }}
            >
              {planet.gold && (
                <circle cx={planet.x} cy={planet.y} r={planet.r * 2.8} fill="url(#skyHaloGold)" opacity="0.62" />
              )}
              {planet.hasPhoto && (
                <ellipse
                  cx={planet.x} cy={planet.y}
                  rx={planet.r * 1.72} ry={planet.r * 0.56}
                  fill="none"
                  stroke={planet.gold ? "#f4d488" : "#d9d1e8"}
                  strokeOpacity="0.72"
                  strokeWidth="0.28"
                  transform={"rotate(-20 " + planet.x + " " + planet.y + ")"}
                />
              )}
              <circle
                cx={planet.x} cy={planet.y} r={planet.r}
                fill={planet.gold ? "#f4d488" : planet.color}
                fillOpacity={planet.voice === "text" ? 0.9 : 0.42}
                stroke={planet.gold ? "#fff0c2" : planet.color}
                strokeWidth={planet.voice === "text" ? 0.16 : 0.42}
                className={reduceMotion ? undefined : "sky-star"}
                style={reduceMotion ? { opacity: 0.96 } : ({ "--star-o": 0.96, animationDelay: planet.delay + "s" } as React.CSSProperties)}
              />
              <circle
                cx={planet.x - planet.r * 0.32}
                cy={planet.y - planet.r * 0.34}
                r={planet.r * 0.22}
                fill="#fff8e6"
                opacity="0.72"
                style={{ pointerEvents: "none" }}
              />
              <text
                x={planet.x} y={planet.y + 0.46}
                textAnchor="middle"
                fill="#120c22"
                fontSize="1.35"
                fontWeight="800"
                style={{ pointerEvents: "none" }}
              >
                {toIndicDigits(String(planet.day.day))}
              </text>
              {planet.day.count > 1 && (
                <circle
                  cx={planet.x + planet.r * 1.65}
                  cy={planet.y - planet.r * 1.05}
                  r="0.38"
                  fill="#d9d1e8"
                  opacity="0.9"
                />
              )}
              {(dayPreview?.key === planet.day.key || preview?.date === planet.day.date) && (
                <circle cx={planet.x} cy={planet.y} r={planet.r + 1.18} fill="none" stroke="#f4d488" strokeOpacity="0.86" strokeWidth="0.46" />
              )}
              <circle
                cx={planet.x} cy={planet.y} r={planet.r + 1.18}
                fill="none" stroke="#f4d488" strokeOpacity="0.86" strokeWidth="0.46"
                className="opacity-0 group-focus-visible:opacity-100"
              />
              <circle cx={planet.x} cy={planet.y} r={Math.max(2.7, planet.r + 1.5)} fill="transparent" />
            </g>
          ))}
        </svg>

        {/* تسمية المذنّب — بمحاذاة RTL قرب رأسه */}
        {comet && showGalaxies && (
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
              <p className="text-[11px] text-[#cfc4e6] mt-0.5">ما كتبت فيه شيئاً — تحبّ تضيء كوكبه الآن؟</p>
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

      {/* يومٌ يحمل أكثر من مذكرة: كلّها تبقى قابلةً للفتح من كوكب اليوم. */}
      {dayPreview && (
        <div className="absolute inset-x-3 bottom-3 z-20 bg-[#1c1435]/95 border border-[#e8c99a]/25 rounded-2xl p-3 backdrop-blur animate-fade-up">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-[#2b2147] border border-[#e8c99a]/35 flex items-center justify-center text-xs font-black text-[#f4ead6] shrink-0">
              {toIndicDigits(String(dayPreview.day))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-[#b9a8d6]">{formatDate(dayPreview.date)}</div>
              <p className="text-sm font-bold text-[#f4ead6]">
                {toIndicDigits(String(dayPreview.count))} مذكرات في هذا اليوم
              </p>
            </div>
            <button onClick={() => setDayPreview(null)} aria-label="إغلاق يوم الذكريات" className="shrink-0 text-[#b9a8d6] hover:text-white press">
              <X size={16} />
            </button>
          </div>
          <div className="mt-2.5 max-h-36 overflow-y-auto space-y-1.5">
            {dayPreview.entries.map((entry, index) => (
              <button
                key={entry.id || dayPreview.key + "-" + index}
                onClick={() => { setDayPreview(null); onOpen(entry); }}
                className="w-full text-right rounded-xl border border-white/10 bg-white/[0.055] hover:bg-white/10 px-3 py-2 press"
              >
                <span className="block text-xs font-bold text-[#f4ead6] truncate">
                  {plainTitle(entry.title) || "مذكرة " + toIndicDigits(String(index + 1))}
                </span>
                {entry.content && (
                  <span className="block text-[10px] text-[#cfc4e6] truncate mt-0.5">{entry.content}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* بطاقة معاينة كوكب اليوم — تاريخ، عنوان، سطر، صورة، وزر فتح */}
      {preview && (
        <div className="absolute inset-x-3 bottom-3 z-20 bg-[#1c1435]/95 border border-[#e8c99a]/25 rounded-2xl p-3 backdrop-blur animate-fade-up">
          <div className="flex items-start gap-3">
            {previewPhotos.length > 0 && (
              <Photo images={previewPhotos} index={0} className="w-14 h-14 rounded-xl object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-[#b9a8d6]">{formatDate(preview.date)}</div>
              {plainTitle(preview.title) && <div className="text-sm font-bold text-[#f4ead6] truncate">{plainTitle(preview.title)}</div>}
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

      {/* مفتاح الهرم السماوي، ثم دلالات كواكب الأيام عند الوصول إليها. */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 pb-3 pt-0.5 text-[10px] text-[#b9a8d6]/80">
        <span className="flex items-center gap-1"><span className="text-[#e8c99a]">✺</span> السنة مجرّة</span>
        <span className="flex items-center gap-1"><span className="text-white">✦</span> الشهر نجم</span>
        <span className="flex items-center gap-1"><span className="text-[#c9bce8]">●</span> اليوم كوكب</span>
        {showPlanets && <span className="flex items-center gap-1"><span className="text-[#f4d488]">●</span> مفضّلة</span>}
        {showPlanets && <span className="flex items-center gap-1"><span className="text-white">◯</span> بصورة</span>}
        {showPlanets && silentMarks.length > 0 && (
          <button
            onClick={() => { setShowSilent((v) => !v); setSilentPick(null); }}
            aria-pressed={showSilent}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border press transition-colors ${
              showSilent
                ? "border-[#e8c99a]/60 text-[#e8c99a] bg-white/10"
                : "border-white/15 text-[#b9a8d6]/80 hover:border-white/30"
            }`}
          >
            🌑 الأيام الصامتة ({toIndicDigits(String(silentMarks.length))})
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
  border: "1px solid rgba(232,201,154,.16)",
  boxShadow: "0 16px 36px rgba(8,5,16,.16), inset 0 0 0 1px rgba(255,255,255,.025)",
};
