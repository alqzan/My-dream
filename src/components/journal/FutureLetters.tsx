"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { FutureLetter } from "@/lib/types";
import { uid, today, formatDate, toDateStr } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Mail, MailOpen, Trash2, Send, Hourglass } from "lucide-react";

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setMonth(d.getMonth() + months);
  return toDateStr(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function agoLabel(days: number): string {
  if (days >= 365) {
    const y = Math.round(days / 365);
    return y === 1 ? "قبل سنة كاملة" : y === 2 ? "قبل سنتين" : `قبل ${y} سنوات`;
  }
  if (days >= 30) {
    const m = Math.round(days / 30);
    return m === 1 ? "قبل شهر" : m === 2 ? "قبل شهرين" : `قبل ${m} أشهر`;
  }
  return `قبل ${days} يوم`;
}

// مسار القوس المضيء لقمرٍ «متزايد» (نفس فكرة QuestionMoon): القرص نصف قطره r
// حول (cx,cy)، والطرف نصفه الأفقي rx=r·(1−2f) بإشارته — f=0 محاق (لا يضيء)،
// f=0.5 نصف، f=1 بدرٌ كامل. الجهة المضيئة يميناً.
function litPath(cx: number, cy: number, r: number, f: number): string {
  const rx = r * (1 - 2 * f);
  const sweep = rx > 0 ? 0 : 1;
  return (
    `M ${cx} ${cy - r} ` +
    `A ${r} ${r} 0 0 1 ${cx} ${cy + r} ` +
    `A ${Math.abs(rx).toFixed(3)} ${r} 0 0 ${sweep} ${cx} ${cy - r} Z`
  );
}

// الرسالة المختومة كهلالٍ يتزايد نحو البدر كلما اقترب موعد فتحها: نسبة
// الاستضاءة = (اليوم − يوم الكتابة)/(يوم الفتح − يوم الكتابة) محصورة 0..1.
// قرصٌ بنفسجي معتم (الختم) يمتلئ ذهباً حتى يكتمل بدراً يوم التسليم.
function LetterMoon({ frac }: { frac: number }) {
  const f = Math.max(0, Math.min(1, frac));
  const R = 15;
  const C = 20; // مركز القرص في مساحة 40×40
  return (
    <svg
      viewBox="0 0 40 40"
      className="w-9 h-9 shrink-0 motion-safe:animate-fade-up"
      role="img"
      aria-label={`الرسالة اكتملت ${Math.round(f * 100)}٪`}
    >
      <defs>
        <linearGradient id="letterMoonLit" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c9b3e6" />
          <stop offset="100%" stopColor="#e5b45f" />
        </linearGradient>
      </defs>
      {/* القرص المعتم — الرسالة ما زالت مختومة */}
      <circle cx={C} cy={C} r={R} className="fill-journal" fillOpacity={0.18} />
      {/* الجزء المضيء ينمو نحو موعد الفتح */}
      <path d={litPath(C, C, R, f)} fill="url(#letterMoonLit)" />
      {/* خط ذهبي رفيع حول الحافة */}
      <circle cx={C} cy={C} r={R} fill="none" stroke="#e5b45f" strokeWidth={1} strokeOpacity={0.7} />
    </svg>
  );
}

export function FutureLetters() {
  const { futureLetters, addFutureLetter, openFutureLetter, deleteFutureLetter } = useAppStore();
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [delivery, setDelivery] = useState(() => addMonths(today(), 6));
  const [sealed, setSealed] = useState(false);
  const [reading, setReading] = useState<FutureLetter | null>(null);

  const todayStr = today();
  const due = futureLetters.filter((l) => !l.opened && l.deliveryDate <= todayStr);
  const locked = futureLetters
    .filter((l) => !l.opened && l.deliveryDate > todayStr)
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  const openedLetters = futureLetters
    .filter((l) => l.opened)
    .sort((a, b) => (b.openedDate ?? "").localeCompare(a.openedDate ?? ""));

  function seal() {
    if (!content.trim() || delivery <= todayStr) return;
    addFutureLetter({
      id: uid(),
      writtenDate: todayStr,
      deliveryDate: delivery,
      ...(title.trim() ? { title: title.trim() } : {}),
      content: content.trim(),
    });
    setTitle("");
    setContent("");
    setDelivery(addMonths(todayStr, 6));
    setSealed(true);
  }

  function openCeremony(letter: FutureLetter) {
    openFutureLetter(letter.id);
    setReading(letter);
  }

  const quickPicks = [
    { label: "بعد ٣ أشهر", date: addMonths(todayStr, 3) },
    { label: "بعد ٦ أشهر", date: addMonths(todayStr, 6) },
    { label: "بعد سنة", date: addMonths(todayStr, 12) },
  ];

  return (
    <div className="space-y-3">
      {/* رسالة وصلت اليوم */}
      {due.map((l) => (
        <button
          key={l.id}
          onClick={() => openCeremony(l)}
          className="w-full rounded-2xl p-4 text-white text-right bg-gradient-to-l from-[#6d4514] via-[#a96c20] to-[#dc9f3c] shadow-md animate-pulse"
        >
          <div className="flex items-center gap-3">
            <Mail size={26} className="shrink-0" />
            <div className="flex-1">
              <p className="font-black text-base">وصلتك رسالة من نفسك القديمة 💌</p>
              <p className="text-xs opacity-90 mt-0.5">
                كتبتها {agoLabel(daysBetween(l.writtenDate, todayStr))} — اضغط لفتحها
              </p>
            </div>
          </div>
        </button>
      ))}

      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send size={15} className="text-journal" />
            <span className="text-sm font-bold text-gray-800">رسائل للمستقبل</span>
            {futureLetters.length > 0 && (
              <span className="text-[10px] text-gray-300">{futureLetters.length}</span>
            )}
          </div>
          <button
            onClick={() => { setComposing(true); setSealed(false); }}
            className="text-xs font-bold text-journal bg-journal/10 hover:bg-journal/20 px-3 py-1.5 rounded-full transition-colors"
          >
            ✍️ اكتب رسالة
          </button>
        </div>

        {futureLetters.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2 leading-relaxed">
            اكتب رسالة لنفسك وحدد موعد فتحها — تبقى مختومة 🔒
            <br />حتى يحين يومها، فتصلك من نفسك القديمة.
          </p>
        )}

        {/* المختومة */}
        {locked.map((l) => {
          const left = daysBetween(todayStr, l.deliveryDate);
          const span = daysBetween(l.writtenDate, l.deliveryDate);
          const frac = span > 0 ? daysBetween(l.writtenDate, todayStr) / span : 0;
          return (
            <div key={l.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
              <div className="shrink-0" title={`باقٍ ${left} يوم`}>
                <LetterMoon frac={frac} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-700 truncate">
                  {l.title || "رسالة مختومة"}
                </p>
                <p className="text-[11px] text-gray-400">
                  تُفتح في {formatDate(l.deliveryDate)}
                </p>
              </div>
              <span className="flex items-center gap-1 text-[11px] font-bold text-journal bg-journal/10 px-2 py-1 rounded-full shrink-0">
                <Hourglass size={10} />
                {left} يوم
              </span>
              <button
                onClick={() => deleteFutureLetter(l.id)}
                className="text-gray-300 hover:text-red-400 p-1 shrink-0"
                title="حذف الرسالة"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}

        {/* المفتوحة */}
        {openedLetters.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-bold text-gray-300">رسائل فتحتها</p>
            {openedLetters.map((l) => (
              <button
                key={l.id}
                onClick={() => setReading(l)}
                className="w-full flex items-center gap-3 text-right bg-white border border-gray-100 rounded-xl px-3 py-2 hover:border-journal/30 transition-colors"
              >
                <MailOpen size={15} className="text-brand-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-600 truncate">{l.title || "رسالة من الماضي"}</p>
                  <p className="text-[10px] text-gray-400">
                    كُتبت {formatDate(l.writtenDate)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* كتابة رسالة */}
      <Modal open={composing} onClose={() => setComposing(false)} title="رسالة لنفسك المستقبلية ✉️">
        {sealed ? (
          <div className="text-center space-y-3 py-4">
            <p className="text-5xl">🔏</p>
            <p className="text-sm text-gray-700 leading-relaxed font-medium">
              خُتمت الرسالة! لن تستطيع قراءتها
              <br />حتى يحين موعدها — وسننبهك يومها 💌
            </p>
            <Button onClick={() => setComposing(false)} className="w-full bg-journal hover:bg-journal/90">
              تم ✓
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-500 bg-journal/10 rounded-xl p-3 leading-relaxed">
              💡 اكتب لنفسك التي ستقرأ هذا لاحقاً: ماذا تتمنى أن تكون أنجزت؟
              بماذا تريد أن تذكّر نفسك؟ ما الذي يقلقك اليوم وتفضل أن تضحك عليه غداً؟
            </p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان الرسالة (اختياري)"
              dir="auto"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-journal/40"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={7}
              placeholder="عزيزي أنا المستقبلي..."
              dir="auto"
              className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-journal/40 resize-none"
            />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">متى تُفتح؟</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {quickPicks.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setDelivery(p.date)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      delivery === p.date
                        ? "bg-journal text-white border-journal font-bold"
                        : "border-gray-200 text-gray-500 hover:border-journal/40"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={delivery}
                min={todayStr}
                onChange={(e) => setDelivery(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-journal/40"
              />
              {delivery <= todayStr && (
                <p className="text-xs text-red-500 mt-1">اختر تاريخاً في المستقبل.</p>
              )}
            </div>
            <Button
              onClick={seal}
              disabled={!content.trim() || delivery <= todayStr}
              className="w-full bg-journal hover:bg-journal/90"
            >
              🔏 اختم الرسالة حتى {formatDate(delivery)}
            </Button>
          </div>
        )}
      </Modal>

      {/* طقس الفتح / القراءة */}
      <Modal open={!!reading} onClose={() => setReading(null)} className="sm:max-w-xl">
        {reading && (
          <div className="space-y-4 pt-2">
            <div className="text-center">
              <p className="text-5xl mb-2">💌</p>
              <p className="text-[11px] font-bold text-brand-600">
                رسالة من نفسك — كتبتها {agoLabel(daysBetween(reading.writtenDate, todayStr))}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(reading.writtenDate)}</p>
            </div>
            {reading.title && (
              <h2 className="text-xl font-black text-gray-900 text-center leading-snug">
                {reading.title}
              </h2>
            )}
            <div className="bg-brand-50 dark:bg-brand-500/10 rounded-2xl p-4">
              <p className="text-sm leading-loose whitespace-pre-line text-gray-800">
                {reading.content}
              </p>
            </div>
            <Button onClick={() => setReading(null)} className="w-full bg-journal hover:bg-journal/90">
              الحمد لله على كل حال 🤍
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
