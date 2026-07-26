// رفع الإصدار تعديلاً واحداً: يزيد `APP_BUILD` في src/lib/version.ts ويكتب
// `0.1.<build>` في package.json — في خطوةٍ واحدة فلا ينحرف أحدهما عن الآخر.
// تسلسليٌّ دائماً (+1)، بلا قفزٍ ولا إعادة تعيين. يُستدعى مع كل تعديلٍ جوهريّ:
//     npm run bump
// ثمّ يُسجّل السطر المقابل في ROADMAP.md.
import { readFileSync, writeFileSync } from "node:fs";

const versionUrl = new URL("../src/lib/version.ts", import.meta.url);
const pkgUrl = new URL("../package.json", import.meta.url);

const src = readFileSync(versionUrl, "utf8");
const m = src.match(/(APP_BUILD\s*=\s*)(\d+)/);
if (!m) {
  console.error("✗ تعذّر قراءة APP_BUILD من src/lib/version.ts");
  process.exit(1);
}
const next = Number(m[2]) + 1;
writeFileSync(versionUrl, src.replace(/(APP_BUILD\s*=\s*)\d+/, `$1${next}`));

const raw = readFileSync(pkgUrl, "utf8");
writeFileSync(pkgUrl, raw.replace(/("version"\s*:\s*")[^"]+(")/, `$10.1.${next}$2`));

// package-lock.json يحمل نسخةَ الجذر مرّتين (الترويسة + مدخل ""). تركُها متخلّفةً
// يجعل npm يعتبر الشجرة غير صالحة (فيفشل `npm audit` مثلاً)، فنُحدّثهما معاً.
const lockUrl = new URL("../package-lock.json", import.meta.url);
try {
  const lock = readFileSync(lockUrl, "utf8");
  writeFileSync(lockUrl, lock.replace(/("version"\s*:\s*")[^"]+(")/g, (m, a, b, off) =>
    off < 400 ? `${a}0.1.${next}${b}` : m // الترويسة ومدخل الجذر فقط، لا الاعتماديات
  ));
} catch { /* لا قفل (تثبيتٌ نظيف) — غير حرج */ }

console.log(`✓ الإصدار الآن 0.1.${next} (تعديل رقم ${next}) — سجّله في ROADMAP.md`);
