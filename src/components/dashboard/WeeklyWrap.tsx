"use client";
import { useState } from "react";
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

export function WeeklyWrap({ transactions, journalEntries, readingLogs }: WeeklyWrapProps) {
  const [sharing, setSharing] = useState(false);
  const week = getThisWeekDates();
  const weekSet = new Set(week);

  const weekTx = transactions.filter((t) => weekSet.has(t.date));
  const weekJournal = journalEntries.filter((e) => weekSet.has(e.date));
  const weekLogs = readingLogs.filter((l) => weekSet.has(l.date));

  const spent = weekTx.reduce((s, t) => s + t.amount, 0);
  const pagesRead = weekLogs.reduce((s, l) => s + l.pagesRead, 0);
  const journalDays = weekJournal.length;
  const readingDays = new Set(weekLogs.map((l) => l.date)).size;

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

      <div className="flex gap-1 justify-center pt-1">
        {week.map((d, i) => {
          const hasJ = weekJournal.some((e) => e.date === d);
          const hasR = readingLogs.some((l) => l.date === d);
          const score = [hasJ, hasR].filter(Boolean).length;
          return (
            <div key={d} className="flex flex-col items-center gap-1">
              <div className="text-[10px] text-white/45">
                {["أح","إث","ثل","أر","خم","جم","سب"][parseDate(d).getDay()]}
              </div>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                style={{
                  backgroundColor: score === 2 ? "#f97316" : score === 1 ? "#d4a017" : "rgba(255,255,255,0.12)",
                }}
              >
                {score === 2 ? "🔥" : score > 0 ? score : "·"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
