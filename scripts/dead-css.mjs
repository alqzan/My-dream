// ===================== كاشفُ الأصناف الميتة في globals.css =====================
// `globals.css` ١٩٩ ك.ب وهي **كلُّ** حمولة CSS تقريباً (أدواتُ Tailwind بعد
// التشذيب لا تتجاوز بضعةَ كيلوبايت) — فهي مشروعُ CSS مكتوبٌ بيدٍ لا مشروعَ
// Tailwind بالوزن. ومع كلّ بابٍ يُحذف تبقى أصنافُه.
//
// **ولماذا تقريرٌ لا حذفٌ آليّ؟** لأنّ المسح وحده يكذب: `mdr-weekly-metric--*`
// تبدو ميتةً في كلّ بحثٍ نصّيّ، وهي حيّةٌ تُبنى في `WeeklySummary` من
// `mdr-weekly-metric--${tone}`. فالحذفُ قرارٌ يُتَّخذ بالعين على الشاشة، وهذا
// يُعدّ القائمة ويستبعد ما يُبنى ديناميكياً ويقيس الوزن — ثمّ يترك القرار.
//
//     node scripts/dead-css.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CSS_PATH = "src/app/globals.css";
const css = readFileSync(CSS_PATH, "utf8");

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

// كلُّ ما قد يحمل اسمَ صنف: المصدر، والملفّات الثابتة (العاملُ والبيان).
const sources = [...walk("src"), ...walk("public")]
  .filter((p) => /\.(tsx?|jsx?|html|json|webmanifest)$/.test(p) && p !== CSS_PATH)
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");

const escape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#]/g, "\\$&");
const defined = [...new Set([...css.matchAll(/^\s*\.([a-zA-Z][\w-]*)/gm)].map((m) => m[1]))];

// صنفٌ يُبنى من قطعتين (`` `x--${tone}` ``) لا يظهر كاملاً في أيّ مصدر. فكلُّ
// بادئةٍ تظهر داخل نصٍّ حرفيٍّ متبوعةً بتعويض تُعَدّ حيّةً كلُّ فروعها.
// لا يُشترط أن تبدأ البادئةُ بعد علامة الاقتباس مباشرةً: `x y--${t}` الأمرُ
// الشائع. والإفراطُ في الاستبعاد هنا هو الجانبُ الآمن — تقريرٌ ينقص أفضلُ من
// حذفٍ يكسر.
const dynamicPrefixes = [...sources.matchAll(/([a-zA-Z][\w-]*-{1,2})\$\{/g)].map((m) => m[1]);

const dead = [];
const dynamic = [];
for (const c of defined) {
  if (sources.includes(c)) continue;
  const all = (css.match(new RegExp(`\\.${escape(c)}(?![\\w-])`, "g")) ?? []).length;
  const defs = (css.match(new RegExp(`^\\s*\\.${escape(c)}(?![\\w-])`, "gm")) ?? []).length;
  if (all > defs) continue; // مستعمَلٌ داخل globals نفسِه (محدِّدُ نسَب)
  if (dynamicPrefixes.some((p) => c.startsWith(p))) { dynamic.push(c); continue; }
  dead.push(c);
}

// وزنُ ما يُمكن حذفه: كتلةٌ محدِّدُها مبنيٌّ من أصنافٍ ميتةٍ وحدها.
const deadSet = new Set(dead);
let bytes = 0;
let blocks = 0;
for (const m of css.matchAll(/(^|\n)([^{}\n][^{}]*)\{([^{}]*)\}/g)) {
  const sel = m[2].trim();
  if (sel.startsWith("@") || !sel.includes(".")) continue;
  const names = [...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((x) => x[1]);
  if (names.length && names.every((n) => deadSet.has(n))) { bytes += m[0].length; blocks++; }
}

const kb = (n) => (n / 1024).toFixed(1);
console.log(`globals.css: ${kb(css.length)} KB · ${defined.length} صنفاً معرَّفاً`);
console.log(`مرشَّحٌ للحذف: ${dead.length} صنفاً في ${blocks} كتلة ≈ ${kb(bytes)} KB`);
if (dynamic.length) {
  console.log(`\nاستُبعدت (تُبنى ديناميكياً — لا تحذفها): ${dynamic.length}`);
  console.log("  " + dynamic.join(" · "));
}
console.log("\nالمرشَّحون:");
for (const c of dead) console.log("  ." + c);
console.log("\n⚠ راجِعها بالعين على الشاشة قبل الحذف: المسحُ النصّيّ لا يرى");
console.log("  صنفاً يصل من مصدرٍ خارجيّ أو من HTML مُولَّد.");
