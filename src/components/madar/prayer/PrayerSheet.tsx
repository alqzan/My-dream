"use client";
/**
 * ورقةُ تسجيل الصلاة — سؤالان لا دورةُ ضغطات.
 *
 * **لماذا حلَّت محلّ الضغطة الدوّارة؟** كانت الضغطةُ الواحدة «صلَّيت»،
 * والثانية «جماعة»، والثالثة تمسح — فمن أراد جماعةً ضغط مرّتين ورأى نفسه
 * «منفرداً» في الطريق، ومن أخطأ دار الدورةَ كلَّها ليعود. الحالةُ لم تكن
 * تُختار، كانت تُصادَف. وهنا تُختار: كلُّ حالةٍ زرٌّ باسمها، والمسحُ زرٌّ لا
 * محطّةٌ في دورة.
 *
 * والسؤال الثاني — **حضورُ القلب** — يلي الأوّل في اللحظة نفسِها لأنّ هذا
 * وقتُه: تُسأل عن صلاةٍ خرجتَ منها للتوّ لا عن ذكرى آخر النهار. وهو اختياريّ
 * صراحةً («أمرُّ»): إلزامُه يجعل تسجيلَ الفرض نفسِه أثقلَ، فيُترك التسجيل كلُّه.
 */
import { useEffect, useState } from "react";
import type { KhushuLevel, PrayerLog, PrayerName, PrayerStatus } from "@/lib/types";
import { KHUSHU_LEVELS, KHUSHU_META, isPrayedStatus } from "@/lib/types";
import { khushuOf } from "@/lib/khushu";
import { buzz } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";

/** الحالاتُ الخمسُ كما تُقرأ في الورقة — «لم» مسحٌ لا حال، فلها زرُّها أسفل. */
const STATES: { v: PrayerStatus; label: string; hint: string; color: string }[] = [
  { v: "جماعة", label: "في جماعة", hint: "مع الناس", color: "#1f7a6c" },
  { v: "منفردة", label: "وحدي", hint: "في وقتها", color: "#dc9f3c" },
  { v: "قضاء", label: "قضاءً", hint: "بعد وقتها", color: "#3f6f8f" },
  { v: "فائتة", label: "فاتتني", hint: "تُعَدُّ عليك", color: "#c15a34" },
];

function Chip({
  label, hint, color, on, onClick,
}: {
  label: string; hint: string; color: string; on: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="press"
      style={{
        minHeight: 64, width: "100%",
        display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center",
        gap: 3, padding: "10px 12px", textAlign: "right", cursor: "pointer",
        fontFamily: "inherit", boxSizing: "border-box",
        borderRadius: 18,
        border: `1.5px solid ${on ? color : "var(--line)"}`,
        background: on ? color : "var(--paper2)",
        color: on ? "var(--paper)" : "var(--ink)",
        transition: "background .15s ease, border-color .15s ease",
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.2 }}>{label}</span>
      <span style={{ fontSize: 10.5, lineHeight: 1.45, color: on ? "var(--paper)" : "var(--ink52)", opacity: on ? 0.85 : 1 }}>
        {hint}
      </span>
    </button>
  );
}

export function PrayerSheet({
  prayer,
  log,
  timeLabel,
  onSetStatus,
  onSetKhushu,
  onClose,
}: {
  /** الفرضُ المفتوح، و`null` تُغلق الورقة. */
  prayer: PrayerName | null;
  log: PrayerLog | undefined;
  /** وقتُ الفرض منسَّقاً — سطرٌ تحت العنوان، أو فارغٌ حين يتعذّر الحساب. */
  timeLabel?: string;
  onSetStatus: (prayer: PrayerName, status: PrayerStatus) => void;
  onSetKhushu: (prayer: PrayerName, level: KhushuLevel | undefined) => void;
  onClose: () => void;
}) {
  const status = prayer ? log?.prayers[prayer] : undefined;
  const level = prayer ? khushuOf(log, prayer) : undefined;
  const prayed = isPrayedStatus(status);

  // السؤالُ الثاني يظهر بعد اختيار الأوّل في هذه الجلسة، أو فوراً على فرضٍ
  // مسجَّلٍ سلفاً — فمن فتح الورقة ليصحّح خشوعَه لا يُعيد اختيار الحالة.
  const [asked, setAsked] = useState(false);
  useEffect(() => { if (prayer) setAsked(isPrayedStatus(log?.prayers[prayer])); },
    // القراءةُ عند الفتح وحده: تغيُّرُ `log` بعد اختيارٍ داخل الورقة لا يعيد
    // ضبطَ الحالة (وإلّا انغلق السؤالُ الثاني على من مسح ثمّ أعاد الاختيار).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prayer]);

  if (!prayer) return null;

  const pick = (v: PrayerStatus) => {
    buzz();
    onSetStatus(prayer, v);
    // «فاتتني» لا قلبَ يُسأل عنه، فتُغلق الورقة فوراً — والباقي يفتح السؤال.
    if (v === "فائتة") onClose();
    else setAsked(true);
  };

  return (
    <Modal open onClose={onClose} title={prayer}>
      <div className="mdr" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <section>
          <p style={{ margin: "0 0 10px", fontSize: 13.5, fontWeight: 700 }}>
            صلَّيتَ {prayer}؟
            {timeLabel && (
              <span style={{ fontWeight: 400, color: "var(--ink34)", fontSize: 11.5 }}> · {timeLabel}</span>
            )}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {STATES.map((o) => (
              <Chip
                key={o.v}
                label={o.label}
                hint={o.hint}
                color={o.color}
                on={status === o.v}
                onClick={() => pick(o.v)}
              />
            ))}
          </div>
        </section>

        {asked && prayed && (
          <section style={{ animation: "fadeUp .22s ease backwards" }}>
            <p style={{ margin: "0 0 3px", fontSize: 13.5, fontWeight: 700 }}>وكيف كان قلبُك فيها؟</p>
            <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--ink52)", lineHeight: 1.7 }}>
              بلا حساب — إجابةٌ واحدةٌ تكفي، ولك أن تمرّ.
            </p>
            {/* الثلاثةُ في صفٍّ واحد: درجاتٌ من سلَّمٍ واحد، فسقوطُ واحدةٍ إلى
                سطرٍ عريضٍ تحتها يوحي بأنّها من نوعٍ آخر. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
              {KHUSHU_LEVELS.map((l) => {
                const m = KHUSHU_META[l];
                return (
                  <Chip
                    key={l}
                    label={m.label}
                    hint={m.hint}
                    color={m.color}
                    on={level === l}
                    onClick={() => {
                      buzz();
                      // الضغطةُ على الدرجة الحالية تمسحها — فمن أخطأ لا يحتاج
                      // زرَّ مسحٍ ثانياً.
                      onSetKhushu(prayer, level === l ? undefined : l);
                      if (level !== l) onClose();
                    }}
                  />
                );
              })}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                marginTop: 12, minHeight: 40, width: "100%",
                background: "transparent", border: "1px dashed var(--line)", borderRadius: 14,
                color: "var(--ink52)", fontSize: 12.5, fontFamily: "inherit", cursor: "pointer",
              }}
            >
              أمرُّ
            </button>
          </section>
        )}

        {status && status !== "لم" && (
          <button
            type="button"
            onClick={() => { buzz(); onSetStatus(prayer, "لم"); onClose(); }}
            style={{
              minHeight: 44, background: "transparent", border: "none",
              borderTop: "1px solid var(--line)", paddingTop: 14,
              color: "var(--clay)", fontSize: 12.5, fontWeight: 700,
              fontFamily: "inherit", cursor: "pointer",
            }}
          >
            امسح تسجيل {prayer}
          </button>
        )}
      </div>
    </Modal>
  );
}
