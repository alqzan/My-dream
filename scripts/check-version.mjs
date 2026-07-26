// بوابة الإصدار: يتحقّق أن `package.json` يطابق `src/lib/version.ts` (المصدر
// الوحيد للرقم). يُشغَّل قبل `next build` فينكسر البناء عند أيّ انحراف بدل أن
// يُنشَر إصدارٌ متناقض (كان الرقم مكتوباً بيدٍ في موضعين فتخلّف أحدهما).
// لا يعدّل شيئاً — الرفعُ عمل `scripts/bump-version.mjs`.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const src = readFileSync(new URL("../src/lib/version.ts", import.meta.url), "utf8");

const buildMatch = src.match(/APP_BUILD\s*=\s*(\d+)/);
if (!buildMatch) {
  console.error("✗ تعذّر قراءة APP_BUILD من src/lib/version.ts");
  process.exit(1);
}
const build = Number(buildMatch[1]);
const expected = `0.1.${build}`;

if (pkg.version !== expected) {
  console.error(
    `✗ إصدارٌ متناقض: package.json = ${pkg.version} و APP_BUILD = ${build} (المتوقّع ${expected}).\n` +
    `  شغّل: npm run bump   (أو صحّح package.json يدوياً إلى ${expected})`
  );
  process.exit(1);
}

console.log(`✓ الإصدار ${expected} (تعديل رقم ${build})`);
