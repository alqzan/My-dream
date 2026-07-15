"use client";
import { useEffect, useState } from "react";
import type { Transaction, JournalEntry, ReadingLog, Book } from "@/lib/types";
import { formatAmount, toDateStr, parseDate, formatDateShort } from "@/lib/utils";
import { showToast } from "@/components/ui/UndoToast";
import { Share2, Loader2 } from "lucide-react";

interface WeeklyWrapProps {
  transactions: Transaction[];
  journalEntries: JournalEntry[];
  readingLogs: ReadingLog[];
  books?: Book[];
}

// Draw the week's summary onto a portrait canvas and share it (native share
// sheet where available, otherwise a PNG download). A "Wrapped"-style keepsake,
// rendered fully on-device with no libraries.
async function shareWeeklyImage(stats: {
  spent: number;
  pagesRead: number;
  journalDays: number;
  readingDays: number;
  range: string;
  dots: { label: string; score: number }[];
}) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#4a3320");
  grad.addColorStop(0.5, "#6b4629");
  grad.addColorStop(1, "#8a5a24");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // soft glow
  const glow = ctx.createRadialGradient(W * 0.8, 120, 60, W * 0.8, 120, 700);
  glow.addColorStop(0, "rgba(232,177,90,0.35)");
  glow.addColorStop(1, "rgba(232,177,90,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.direction = "rtl";
  ctx.textAlign = "center";
  const font = (w: number, size: number) =>
    `${w} ${size}px "Tajawal", system-ui, "Segoe UI", Tahoma, sans-serif`;

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = font(600, 40);
  ctx.fillText("حصيلة أسبوعي 🏆", W / 2, 150);

  ctx.fillStyle = "#fff";
  ctx.font = font(800, 58);
  ctx.fillText("مدار", W / 2, 235);

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = font(500, 34);
  ctx.fillText(stats.range, W / 2, 300);

  // stat tiles (2x2)
  const tiles = [
    { icon: "📓", label: "أيام كتبت", value: `${stats.journalDays}/7` },
    { icon: "📚", label: "صفحات قرأت", value: formatAmount(stats.pagesRead) },
    { icon: "📖", label: "أيام قراءة", value: `${stats.readingDays}/7` },
    { icon: "💰", label: "مصاريف الأسبوع", value: formatAmount(stats.spent) },
  ];
  const tw = 440, th = 230, gap = 40;
  const startX = (W - tw * 2 - gap) / 2;
  const startY = 380;
  tiles.forEach((t, i) => {
    const x = startX + (i % 2) * (tw + gap);
    const y = startY + Math.floor(i / 2) * (th + gap);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(ctx, x, y, tw, th, 32);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.font = font(500, 60);
    ctx.fillText(t.icon, x + tw / 2, y + 85);
    ctx.fillStyle = "#f0d9a8";
    ctx.font = font(800, 66);
    ctx.fillText(t.value, x + tw / 2, y + 160);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = font(500, 32);
    ctx.fillText(t.label, x + tw / 2, y + 205);
  });

  // day dots
  const dotsY = startY + th * 2 + gap + 120;
  const dn = stats.dots.length;
  const dgap = 118;
  const dotsStart = W / 2 + ((dn - 1) / 2) * dgap; // rightmost (RTL first day)
  stats.dots.forEach((d, i) => {
    const cx = dotsStart - i * dgap;
    ctx.beginPath();
    ctx.arc(cx, dotsY, 38, 0, Math.PI * 2);
    ctx.fillStyle = d.score === 2 ? "#f97316" : d.score === 1 ? "#d4a017" : "rgba(255,255,255,0.12)";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = font(700, 34);
    ctx.fillText(d.score === 2 ? "🔥" : d.score > 0 ? String(d.score) : "·", cx, dotsY + 12);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = font(500, 28);
    ctx.fillText(d.label, cx, dotsY + 90);
  });

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = font(500, 30);
  ctx.textAlign = "center";
  ctx.fillText("مدار — مساحتك الشخصية", W / 2, H - 70);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return;
  const file = new File([blob], "madar-week.png", { type: "image/png" });

  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "حصيلة أسبوعي في مدار" });
      return;
    } catch {
      return; // user cancelled — don't fall through to a download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "madar-week.png";
  a.click();
  URL.revokeObjectURL(url);
  showToast("حُفظت صورة الحصيلة");
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function getThisWeekDates() {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(toDateStr(d));
  }
  return dates;
}

// ===================== سماء الأسبوع =====================
// The week as a small night-sky strip: seven stars strung along a gentle
// faint arc (a sibling to PrayerOrbit / سماء الذكريات — data as marks on a
// celestial diagram, thin gold line-work). Each star's size and brightness
// encode that day's overall activity level (مذكرة + قراءة + حركة صرف). The
// arc is a symmetric quadratic: with the control x at the midpoint, x is
// linear in t, so the seven stars land evenly spaced — أقدم يوم على اليمين
// (RTL) واليوم على اليسار.
const SKY_W = 100;
const SKY_H = 30;
const SKY_P0 = { x: 90, y: 20 }; // أقدم يوم (يمين)
const SKY_P1 = { x: 50, y: 7 }; // قمة القوس
const SKY_P2 = { x: 10, y: 20 }; // اليوم (يسار)
const SKY_ARC_PATH = `M ${SKY_P0.x} ${SKY_P0.y} Q ${SKY_P1.x} ${SKY_P1.y} ${SKY_P2.x} ${SKY_P2.y}`;

function skyPoint(t: number): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * SKY_P0.x + 2 * u * t * SKY_P1.x + t * t * SKY_P2.x,
    y: u * u * SKY_P0.y + 2 * u * t * SKY_P1.y + t * t * SKY_P2.y,
  };
}

// A four-point sparkle (نجمة) around (cx,cy) — outer radius r, waist ri.
function sparklePath(cx: number, cy: number, r: number): string {
  const ri = r * 0.36;
  return `M ${cx} ${cy - r} L ${cx + ri} ${cy - ri} L ${cx + r} ${cy} L ${cx + ri} ${cy + ri} L ${cx} ${cy + r} L ${cx - ri} ${cy + ri} L ${cx - r} ${cy} L ${cx - ri} ${cy - ri} Z`;
}

const WEEKDAYS_SHORT = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];
const WEEKDAYS_FULL = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
// Star radius (viewBox units) and brightness per activity level 0..3.
const STAR_R = [1.3, 2.8, 3.7, 4.6];
const STAR_O = [0.32, 0.6, 0.8, 1];

export function WeeklyWrap({ transactions, journalEntries, readingLogs }: WeeklyWrapProps) {
  const [sharing, setSharing] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    setReduceMotion(
      typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  const week = getThisWeekDates();
  const weekSet = new Set(week);

  const weekTx = transactions.filter((t) => weekSet.has(t.date));
  const weekJournal = journalEntries.filter((e) => weekSet.has(e.date));
  const weekLogs = readingLogs.filter((l) => weekSet.has(l.date));

  const spent = weekTx.reduce((s, t) => s + t.amount, 0);
  const pagesRead = weekLogs.reduce((s, l) => s + l.pagesRead, 0);
  const journalDays = weekJournal.length;
  const readingDays = new Set(weekLogs.map((l) => l.date)).size;

  // Per-day breakdown — one star each. Activity level (0..3) combines the
  // signals this card already tracks: مذكرة + قراءة + حركة صرف that day.
  const dayInfo = week.map((d) => {
    const journaled = weekJournal.some((e) => e.date === d);
    const read = weekLogs.some((l) => l.date === d);
    const dayTx = weekTx.filter((t) => t.date === d);
    const daySpent = dayTx.reduce((s, t) => s + t.amount, 0);
    const dayPages = weekLogs.filter((l) => l.date === d).reduce((s, l) => s + l.pagesRead, 0);
    const level = (journaled ? 1 : 0) + (read ? 1 : 0) + (dayTx.length ? 1 : 0);
    return { date: d, journaled, read, hasTx: dayTx.length > 0, daySpent, dayPages, level };
  });
  const openInfo = openDay ? dayInfo.find((x) => x.date === openDay) ?? null : null;

  async function onShare() {
    setSharing(true);
    try {
      await shareWeeklyImage({
        spent,
        pagesRead,
        journalDays,
        readingDays,
        range: `${formatDateShort(week[0])} — ${formatDateShort(week[6])}`,
        dots: week.map((d) => ({
          label: ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"][parseDate(d).getDay()],
          score:
            (weekJournal.some((e) => e.date === d) ? 1 : 0) +
            (readingLogs.some((l) => l.date === d) ? 1 : 0),
        })),
      });
    } catch {
      showToast("تعذّرت مشاركة الصورة", "warning");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="bg-gradient-to-br from-[#4a3320] via-[#6b4629] to-[#8a5a24] rounded-2xl p-4 text-white space-y-3 card-shadow shine">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-white/55 font-medium">حصيلة الأسبوع</p>
          <p className="text-base font-bold mt-0.5">هذا ما أنجزته 🏆</p>
        </div>
        <button
          onClick={onShare}
          disabled={sharing}
          className="relative z-10 flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-bold rounded-full px-3 py-1.5 press disabled:opacity-60"
          aria-label="شارك صورة الحصيلة"
        >
          {sharing ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />}
          شارك
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatPill icon="📓" label="أيام كتبت" value={`${journalDays}/7`} color="text-purple-300" />
        <StatPill icon="📚" label="صفحات" value={formatAmount(pagesRead)} color="text-orange-300" />
        <StatPill
          icon="💰"
          label="مصاريف الأسبوع"
          value={formatAmount(spent)}
          color="text-red-300"
        />
        <StatPill icon="📖" label="أيام قراءة" value={`${readingDays}/7`} color="text-blue-300" />
      </div>

      {/* سماء الأسبوع — سبع نجوم على قوس خافت؛ حجم/سطوع كل نجمة = نشاط يومها */}
      <div className="pt-1">
        <div className="relative w-full" style={{ aspectRatio: `${SKY_W} / ${SKY_H}` }}>
          <svg viewBox={`0 0 ${SKY_W} ${SKY_H}`} className="absolute inset-0 w-full h-full overflow-visible">
            <defs>
              <radialGradient id="weekStarHalo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f6dca0" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#f6dca0" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* القوس الخافت — خط ذهبيّ رفيع */}
            <path
              d={SKY_ARC_PATH}
              fill="none"
              stroke="#f0d9a8"
              strokeOpacity="0.3"
              strokeWidth="0.8"
              strokeLinecap="round"
            />

            {/* غبار نجميّ خافت للأجواء — غير قابل للضغط */}
            <g style={{ pointerEvents: "none" }}>
              <circle cx="30" cy="5" r="0.4" fill="#f0d9a8" opacity="0.45" />
              <circle cx="70" cy="6" r="0.5" fill="#f0d9a8" opacity="0.4" />
              <circle cx="50" cy="2.5" r="0.35" fill="#f0d9a8" opacity="0.35" />
            </g>

            {/* النجوم — واحدة لكل يوم من الأسبوع */}
            {dayInfo.map((info, i) => {
              const { x, y } = skyPoint(i / 6);
              const selected = info.date === openDay;
              const r = STAR_R[info.level];
              const o = STAR_O[info.level];
              const starStyle = (reduceMotion
                ? { opacity: o }
                : { "--star-o": o, animationDelay: `${i * 0.5}s` }) as React.CSSProperties;
              return (
                <g
                  key={info.date}
                  role="button"
                  tabIndex={0}
                  aria-label={`${WEEKDAYS_FULL[parseDate(info.date).getDay()]} — ${info.level > 0 ? "فيه نشاط" : "هادئ"}`}
                  onClick={() => setOpenDay(selected ? null : info.date)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpenDay(selected ? null : info.date);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {info.level >= 2 && <circle cx={x} cy={y} r={r * 2.2} fill="url(#weekStarHalo)" />}
                  {selected && (
                    <circle cx={x} cy={y} r={r + 2.4} fill="none" stroke="#f6dca0" strokeOpacity="0.75" strokeWidth="0.7" />
                  )}
                  {info.level === 0 ? (
                    <circle
                      cx={x}
                      cy={y}
                      r={STAR_R[0]}
                      fill="#f0d9a8"
                      className={reduceMotion ? undefined : "sky-star"}
                      style={starStyle}
                    />
                  ) : (
                    <path
                      d={sparklePath(x, y, r)}
                      fill="#f6dca0"
                      className={reduceMotion ? undefined : "sky-star"}
                      style={starStyle}
                    />
                  )}
                  {/* منطقة ضغط أوسع للنجوم الصغيرة */}
                  <circle cx={x} cy={y} r={6} fill="transparent" />
                </g>
              );
            })}
          </svg>

          {/* أسماء الأيام — صف أسفل النجوم */}
          {dayInfo.map((info, i) => {
            const { x } = skyPoint(i / 6);
            const selected = info.date === openDay;
            return (
              <span
                key={info.date}
                className={`absolute -translate-x-1/2 -translate-y-1/2 text-[8px] font-medium whitespace-nowrap pointer-events-none ${
                  selected ? "text-[#f6dca0]" : "text-white/45"
                }`}
                style={{ left: `${x}%`, top: "88%" }}
              >
                {WEEKDAYS_SHORT[parseDate(info.date).getDay()]}
              </span>
            );
          })}
        </div>

        {/* تفاصيل الليلة المختارة — أو تلميح */}
        <div className="mt-1 min-h-[1.75rem] flex items-center justify-center">
          {openInfo ? (
            <div className="flex items-center gap-1.5 flex-wrap justify-center animate-fade-up">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#f6dca0]">
                <span>{WEEKDAYS_FULL[parseDate(openInfo.date).getDay()]}</span>
                <span className="opacity-50">·</span>
                <bdi>{formatDateShort(openInfo.date)}</bdi>
              </span>
              {openInfo.journaled && <DayBadge>📓 مذكرة</DayBadge>}
              {openInfo.dayPages > 0 && <DayBadge>📚 {formatAmount(openInfo.dayPages)} صفحة</DayBadge>}
              {openInfo.hasTx && <DayBadge>💰 {formatAmount(openInfo.daySpent)}</DayBadge>}
              {openInfo.level === 0 && <span className="text-[11px] text-white/55">ليلة هادئة 🌙</span>}
            </div>
          ) : (
            <p className="text-[11px] text-white/45">اضغط أي نجمة لتفاصيل يومها ✦</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DayBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-white/10 rounded-lg px-2 py-0.5 text-[11px] text-white/85 whitespace-nowrap">
      {children}
    </span>
  );
}

function StatPill({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div className="bg-white/10 rounded-xl px-3 py-2">
      <div className="text-xs text-white/55">{icon} {label}</div>
      <div className={`text-base font-bold ${color} mt-0.5`}>{value}</div>
    </div>
  );
}
