"use client";
/**
 * ورقةُ تسجيل الصلاة في صفحة الصلاة — غلافُ نافذةٍ حول `PrayerAnswer`.
 *
 * **لماذا حلَّت محلّ الضغطة الدوّارة؟** كانت الضغطةُ الواحدة «صلَّيت»،
 * والثانية «جماعة»، والثالثة تمسح — فمن أراد جماعةً ضغط مرّتين ورأى نفسه
 * «منفرداً» في الطريق، ومن أخطأ دار الدورةَ كلَّها ليعود. الحالةُ لم تكن
 * تُختار، كانت تُصادَف.
 *
 * والسؤالان نفسُهما ليسا هنا: هما في `PrayerAnswer` يشترك فيه هذا الموضعُ
 * والمطالبةُ ومحرّرُ يومٍ مضى — فلا تفترق صياغةٌ ولا حالةٌ بين موضعٍ وآخر.
 */
import type { KhushuLevel, PrayerLog, PrayerName, PrayerStatus } from "@/lib/types";
import { khushuOf } from "@/lib/khushu";
import { Modal } from "@/components/ui/Modal";
import { PrayerAnswer } from "./PrayerAnswer";

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
  /** وقتُ الفرض منسَّقاً — أو فارغٌ حين يتعذّر الحساب. */
  timeLabel?: string;
  onSetStatus: (prayer: PrayerName, status: PrayerStatus) => void;
  onSetKhushu: (prayer: PrayerName, level: KhushuLevel | undefined) => void;
  onClose: () => void;
}) {
  if (!prayer) return null;
  const status = log?.prayers[prayer];

  return (
    <Modal open onClose={onClose} title={prayer}>
      <div className="mdr">
        <PrayerAnswer
          prayer={prayer}
          timeLabel={timeLabel}
          status={status}
          khushu={khushuOf(log, prayer)}
          onStatus={(v) => {
            onSetStatus(prayer, v);
            // «فاتتني» لا قلبَ يُسأل عنه، فينتهي أمرُ الورقة عندها.
            if (v === "فائتة") onClose();
          }}
          onKhushu={(l) => { onSetKhushu(prayer, l); onClose(); }}
          onClear={() => { onSetStatus(prayer, "لم"); onClose(); }}
        />
      </div>
    </Modal>
  );
}
