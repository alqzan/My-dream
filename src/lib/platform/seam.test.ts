import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ===== حارسُ حاجز النقاء =====
// القاعدة في `CLAUDE.md`: **الحساب النقيّ في `src/lib/*.ts` بلا `window` ولا
// DOM** — هكذا يعبر إلى الغلاف الأصليّ بلا تعديل ويبقى مختبَراً. وكلُّ ما هو
// منصّة خلف واجهةٍ قابلة للاستبدال.
//
// وقياسُ ٠٫١٫٤٢٤ قال إنّ الحاجز **مُخترَقٌ في تسعة ملفّات**: تفضيلاتٌ وقرآنٌ
// وثيمٌ وموقعٌ واهتزازٌ ومفتاحُ مزامنةٍ و**بصمةُ القفل** — وهذه الأخيرة بلا
// حارس `typeof window` أصلاً. جُمعت كلُّها خلف `src/lib/platform/` في ٠٫١٫٤٢٨.
//
// والحارسُ هنا يمنع عودتَها: ملفٌّ جديد في `src/lib` يلمس المنصّة مباشرةً
// يُسقط هذا الاختبار ويُقال له أين يذهب. بلا حارسٍ يعود التسرّبُ في أوّل ميزة،
// ويُكتشف عند النقل لا قبله — حين تصير كلفتُه أضعافاً.

const LIB = fileURLToPath(new URL("..", import.meta.url));

/** المسموح لها لمسُ المنصّة — **وهي الواجهةُ نفسُها**. أيُّ إضافةٍ لهذه القائمة
 *  قرارُ معمار لا تصحيحُ اختبار: اسأل أوّلاً لماذا لا يصلح غلافٌ في `platform/`. */
const PLATFORM_LAYER = [
  "/platform/",        // الواجهات نفسُها (prefs · files · haptics · fullscreen)
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(p) && !/\.test\./.test(p)) out.push(p);
  }
  return out;
}

/** أسقِط التعليقات والنصوص — الشرحُ يذكر `localStorage` ولا يلمسها. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/`[^`]*`/g, "``")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/'[^'\n]*'/g, "''");
}

describe("src/lib لا يلمس المنصّة إلّا خلف واجهة", () => {
  const files = walk(LIB).filter((f) => !PLATFORM_LAYER.some((ok) => f.includes(ok)));

  it("لا window ولا localStorage ولا sessionStorage", () => {
    const browserStorage = /\b(?:typeof\s+window\b|window\s*(?:\.|\[)|localStorage\b|sessionStorage\b)/;
    const offenders = files.filter((f) => browserStorage.test(code(readFileSync(f, "utf8"))));
    expect(offenders.map((f) => f.slice(LIB.length - 1)),
      "استعمل واجهةً في `platform/`").toEqual([]);
  });

  it("لا `navigator.*`", () => {
    const browserNavigator = /\b(?:typeof\s+navigator\b|navigator\s*\.)/;
    const offenders = files.filter((f) => browserNavigator.test(code(readFileSync(f, "utf8"))));
    expect(offenders.map((f) => f.slice(LIB.length - 1)),
      "استعمل واجهةً في `platform/` (مثل `haptics.ts`)").toEqual([]);
  });

  it("لا إنشاءَ عناصر DOM ولا `URL.createObjectURL`", () => {
    // `document` المسموحة الوحيدة وسيطٌ محلّيّ من Firestore في `sync.ts` —
    // فنمنع **الاستعمال** (`createElement`/`body`) لا الاسمَ المجرّد.
    const bad = /typeof\s+document\b|document\s*\.\s*(createElement|body|documentElement|addEventListener|querySelector)|URL\s*\.\s*createObjectURL/;
    const offenders = files.filter((f) => bad.test(code(readFileSync(f, "utf8"))));
    expect(offenders.map((f) => f.slice(LIB.length - 1)),
      "استعمل `platform/files.ts` لحفظ الملفّات").toEqual([]);
  });

  it("وطبقةُ المنصّة نفسُها ليست فارغة — الحارسُ يحرس شيئاً موجوداً", () => {
    const layer = walk(join(LIB, "platform"));
    expect(layer.length).toBeGreaterThanOrEqual(4); // prefs · files · haptics · fullscreen
  });
});
