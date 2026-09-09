"use client";
/**
 * **بطاقةُ جواب الصلاة — المصدرُ الوحيد لسؤالَي التسجيل في التطبيق كلِّه.**
 *
 * كانت الأسئلةُ نفسُها تُرسم في أربعة أمكنة بأربعة أشكالٍ وأربع صياغات: ورقةُ
 * صفحة الصلاة · مطالبةُ الصلاة الواحدة · صفوفُ المطالبة الممتدّة · ومحرّرُ
 * يومٍ مضى في تقويم الشهر. فكان المالك يُسأل «صلَّيتَ الظهر؟» هنا و«هل صلّيت
 * الفجر؟» هناك، ويجد أربعَ حالاتٍ في موضعٍ وحالتين في آخر، وأزراراً بأحجامٍ
 * وألوانٍ لا تجمعها هويّة. والسؤالُ واحد، فليكن شكلُه واحداً.
 *
 * وتوحيدُها ليس تجميلاً فحسب: كلُّ نسخةٍ كانت تنسى شيئاً — القضاءُ غائبٌ عن
 * المطالبة، و«فاتتني» غائبةٌ عن محرّر اليوم الماضي، وسؤالُ القلب غائبٌ عن
 * بعضها. المصدرُ الواحد يعني أنّ ما يُضاف يظهر في الأربعة معاً.
 *
 * **كثافتان لا شكلان**: `dense` تُصغّر المقاسات لتسع صفَّ قائمةٍ فيه صلواتُ
 * أيام، والنصُّ والترتيبُ واللونُ واحدٌ في الحالين — فما تعلَّمه المالك في
 * موضعٍ يعرفه في الآخر.
 */
import type { KhushuLevel, PrayerName, PrayerStatus } from "@/lib/types";
import { KHUSHU_LEVELS, KHUSHU_META, isPrayedStatus } from "@/lib/types";
import { buzz } from "@/lib/utils";

/** الحالاتُ الأربع بترتيبها وصياغتها ولونها — تُقرأ من هنا وحدها. */
export const PRAYER_ANSWER_STATES: {
  v: Extract<PrayerStatus, "جماعة" | "منفردة" | "قضاء" | "فائتة">;
  label: string;
  hint: string;
  color: string;
}[] = [
  { v: "جماعة", label: "في جماعة", hint: "مع الناس", color: "#1f7a6c" },
  { v: "منفردة", label: "وحدي", hint: "في وقتها", color: "#dc9f3c" },
  { v: "قضاء", label: "قضاءً", hint: "بعد وقتها", color: "#3f6f8f" },
  { v: "فائتة", label: "فاتتني", hint: "تُعَدُّ عليك", color: "#c15a34" },
];

/** نصُّ السؤالين — صياغةٌ واحدةٌ لا أربع. */
export const askedStatus = (prayer: PrayerName, when?: string) =>
  `صلَّيتَ ${prayer}${when ? ` ${when}` : ""}؟`;
export const ASKED_KHUSHU = "وكيف كان قلبُك فيها؟";

function Chip({
  label, hint, color, on, dense, onClick,
}: {
  label: string; hint: string; color: string; on: boolean; dense?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`mdr-answer-chip press${on ? " is-on" : ""}`}
      style={{ "--c": color } as React.CSSProperties}
    >
      <strong>{label}</strong>
      {!dense && <small>{hint}</small>}
    </button>
  );
}

export function PrayerAnswer({
  prayer,
  /** «أمس» أو «قبل يومين» — يُلحق بالسؤال حين لا يكون اليومَ الجاري. */
  when,
  timeLabel,
  status,
  khushu,
  dense,
  onStatus,
  onKhushu,
  onClear,
}: {
  prayer: PrayerName;
  when?: string;
  timeLabel?: string;
  status: PrayerStatus | undefined;
  khushu: KhushuLevel | undefined;
  dense?: boolean;
  onStatus: (status: PrayerStatus) => void;
  /** `undefined` تعني «أمرُّ» — تُمسح الدرجةُ ولا تُكتب رابعة. */
  onKhushu: (level: KhushuLevel | undefined) => void;
  /** يُعرض «امسح التسجيل» حين تُمرَّر — لا معنى له في مطالبةٍ لم تُسجَّل بعد. */
  onClear?: () => void;
}) {
  const prayed = isPrayedStatus(status);

  return (
    <div className={`mdr-answer${dense ? " is-dense" : ""}`}>
      <section>
        <p className="mdr-answer-q">
          <strong>{askedStatus(prayer, when)}</strong>
          {timeLabel && <small>{timeLabel}</small>}
        </p>
        <div className="mdr-answer-grid is-status">
          {PRAYER_ANSWER_STATES.map((o) => (
            <Chip
              key={o.v}
              label={o.label}
              hint={o.hint}
              color={o.color}
              on={status === o.v}
              dense={dense}
              onClick={() => { buzz(); onStatus(o.v); }}
            />
          ))}
        </div>
      </section>

      {/* سؤالُ القلب لما أُدِّي وحده — و«فاتتني» لا قلبَ يُسأل عنه. */}
      {prayed && (
        <section className="mdr-answer-heart">
          <p className="mdr-answer-q">
            <strong>{ASKED_KHUSHU}</strong>
            {!dense && <small>بلا حساب — ولك أن تمرّ.</small>}
          </p>
          <div className="mdr-answer-grid is-khushu">
            {KHUSHU_LEVELS.map((l) => {
              const m = KHUSHU_META[l];
              return (
                <Chip
                  key={l}
                  label={m.label}
                  hint={m.hint}
                  color={m.color}
                  on={khushu === l}
                  dense={dense}
                  // الضغطةُ على الدرجة الحالية تمسحها، فالتصحيحُ بلا زرٍّ ثالث.
                  onClick={() => { buzz(); onKhushu(khushu === l ? undefined : l); }}
                />
              );
            })}
          </div>
          <button type="button" className="mdr-answer-skip press" onClick={() => onKhushu(undefined)}>
            أمرُّ
          </button>
        </section>
      )}

      {onClear && status && status !== "لم" && (
        <button type="button" className="mdr-answer-clear press" onClick={() => { buzz(); onClear(); }}>
          امسح تسجيل {prayer}
        </button>
      )}
    </div>
  );
}
