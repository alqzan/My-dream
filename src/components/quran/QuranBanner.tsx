"use client";
import { useEffect, useState } from "react";
import { shortVerseOfDay, dayOfYear, type QuranVerse } from "@/lib/quranVerses";
import { AyahNumber } from "@/components/quran/MushafSheet";

// ===================== ختمُ الصفحة: آيةُ اليوم =====================
// الآيةُ كانت تُعرض كأيّ نصٍّ في بطاقة: سطرٌ رماديّ، ثمّ مرجعٌ بين قوسين
// `﴿ الأحزاب 41 ﴾` — وهي صيغةُ اقتباسٍ في مقال، لا صورةُ آيةٍ في مصحف.
//
// الآن تُعرض **بلسان المصحف نفسه**، وكلُّ عنصرٍ هنا مأخوذٌ من الورقة المطبوعة
// لا مخترَعاً: **إطارٌ مزدوج** (خطّان متوازيان بينهما فرجة) بزوايا مذهَّبة —
// وهو تأطيرُ صفحات المصاحف؛ و**اسمُ السورة في طُرّةٍ** فوق الآية بالإطار
// المزدوج نفسه الذي يرسمه `.mushaf-sura` داخل الوجه؛ و**رقمُ الآية في وردته**
// (`۝` — نفس `AyahNumber` في اللوح) في آخر النصّ حيث موضعه في المصحف، لا
// مرجعاً بين قوسين تحته. والدعاء تحت فاصلٍ بمعيَّنٍ ذهبيّ — إشارةُ «مدار»
// المتكرّرة (`.mdr-diamond`).
//
// النصُّ بخطّ المصحف وبحبر الصفحة لا رمادياً: هي متنُ البطاقة لا حاشيتها.
export function QuranBanner() {
  const [verse, setVerse] = useState<QuranVerse | null>(null);
  // إزاحة 5 لتختلف عبارة اللافتة عن «آية اليوم» في التدبّر بنفس اليوم.
  useEffect(() => setVerse(shortVerseOfDay(dayOfYear(), 5)), []);

  return (
    <section className="mdr-ayah-seal" aria-label="آية اليوم">
      <span className="mdr-ayah-seal-frame" aria-hidden>
        <i className="mdr-ayah-seal-corner is-ts" />
        <i className="mdr-ayah-seal-corner is-te" />
        <i className="mdr-ayah-seal-corner is-bs" />
        <i className="mdr-ayah-seal-corner is-be" />
      </span>

      {verse && (
        <>
          <span className="mdr-ayah-seal-sura">سورة {verse.surah}</span>
          <p className="mdr-ayah-seal-text font-quran">
            {verse.text} <AyahNumber num={verse.ayah} />
          </p>
        </>
      )}

      <span className="mdr-ayah-seal-rule" aria-hidden>
        <i /><span className="mdr-diamond" /><i />
      </span>
      <p className="mdr-ayah-seal-dua">اللهم اجعل القرآن ربيع قلبي</p>
    </section>
  );
}
