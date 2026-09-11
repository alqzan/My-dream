// Post-build step: scan the exported `out/` tree and write `out/precache.json`
// (the list of URLs the service worker precaches so EVERY route works offline
// after the first install, not just visited ones). Also stamps a build id into
// `out/sw.js` so each deploy's SW bytes change → the browser reinstalls it →
// the new assets get precached (and stale chunks purged).
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

const OUT = "out";
const basePath = process.env.BASE_PATH || "";

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

// ===== حزمٌ لا يحتاجها مسارٌ ليعمل دون شبكة =====
// الخزنُ المسبق يُنزّل ما يجعل **كلَّ صفحةٍ تعمل** حتى لو لم تُفتح قطّ. لكنّه
// كان يمشي على `out/` ويأخذ كلّ ملف — فأخذ معه حزماً قُسِّمت عمداً لتُحمَّل
// عند الحاجة وحدها، وأثقلُها `heic2any` (١٫٣ م.ب من libheif): لا يحتاجها
// عرضُ صفحةٍ ولا تصفُّحٌ ولا كتابةُ مذكرة — تُطلب في لحظةٍ واحدة: أن يختار
// المالك صورةَ HEIC ليُحوَّلها، وهي لحظةٌ يكون فيها حاضراً لا مستعرِضاً
// أرشيفَه في طائرة. فتُترك للتخزين وقتَ التشغيل: تُنزَّل مرّةً عند أوّل
// تحويلٍ وتبقى.
//
// التعرُّفُ بالمحتوى لا بالاسم: أسماءُ الحزم مجزَّأةٌ وتتغيّر كلَّ بناء، فبصمةٌ
// مكتوبةٌ بيدٍ تتقادم صامتةً. والبحثُ عن `libheif` داخل الحزمة يصمد.
//
// وما بقي (نصُّ المصحف · رسومُ الإحصاءات) يبقى مخزوناً: تلك **يحتاجها المسار
// نفسُه** ليعمل دون شبكة، وكلفتُها لم تعد كلفةَ كلّ نشرة بعد أن صار العامل
// ينقل ما لم يتغيّر من خزن النشرة السابقة (راجع `public/sw.js`).
const RUNTIME_ONLY_MARKERS = ["libheif"];

function isRuntimeOnlyChunk(file, rel) {
  if (!/^_next\/static\/chunks\/.*\.js$/.test(rel)) return false;
  if (statSync(file).size < 256 * 1024) return false; // لا نقرأ الحزمَ الصغيرة
  const head = readFileSync(file, "utf8");
  return RUNTIME_ONLY_MARKERS.some((m) => head.includes(m));
}

const urls = new Set();
const skipped = [];
for (const file of walk(OUT)) {
  const rel = relative(OUT, file).split(/[\\/]/).join("/");
  if (rel.endsWith(".map")) continue;             // source maps: not needed offline
  if (rel === "sw.js" || rel === "precache.json") continue;
  if (isRuntimeOnlyChunk(file, rel)) { skipped.push([rel, statSync(file).size]); continue; }
  if (rel === "index.html" || rel.endsWith("/index.html")) {
    // trailingSlash:true → the page is served at its directory URL.
    const dir = rel.slice(0, rel.length - "index.html".length); // keeps trailing "/"
    urls.add(`${basePath}/${dir}`);
  } else if (rel.endsWith(".html")) {
    continue; // real routes are index.html; skip any stray flat html
  } else {
    urls.add(`${basePath}/${rel}`);               // _next chunks, icons, fonts, manifest
  }
}

const list = [...urls].sort();
const buildId = createHash("sha256").update(list.join("\n")).digest("hex").slice(0, 12);
writeFileSync(join(OUT, "precache.json"), JSON.stringify({ buildId, urls: list }));

// Replace the __BUILD__ placeholder in the copied SW so its bytes are unique
// per deploy (forces reinstall → re-precache). Harmless no-op if absent.
const swPath = join(OUT, "sw.js");
try {
  writeFileSync(swPath, readFileSync(swPath, "utf8").replaceAll("__BUILD__", buildId));
} catch { /* sw.js not exported (shouldn't happen) — precache.json still written */ }

// ===== بوّابةُ سلامةٍ للعامل: هل ما تحت `_next/static` معنوَنٌ بمحتواه؟ =====
// `public/sw.js` ينقل ما تحت هذا المسار من خزن النشرة السابقة **بلا تنزيل**،
// وحجّتُه الوحيدة أنّ اسمَ الملفّ يحمل بصمةَ بايتاته: فاتّفاقُ الاسم اتّفاقُ
// محتوىً يقيناً. ولو أخرج Next يوماً ملفاً باسمٍ ثابتٍ ومحتوىً متغيّر تحت هذا
// المسار (ترقيةُ إصدارٍ رئيسي مثلاً) لصار النقلُ تقديمَ بايتاتٍ قديمة — عطلٌ
// صامتٌ لا يكشفه اختبارٌ ولا نوع. فيُكسَر البناءُ هنا بدل أن يُنشَر.
//
// الشكلان المقبولان: بصمةٌ سداسيةٌ في اسم الملفّ (`main-a1b2….js` ·
// `0bb9a02f587d380f-s.p.woff2`)، أو ملفٌّ تحت مجلّد `buildId` الفريد لكلّ بناء
// (`_next/static/<buildId>/_buildManifest.js`).
const HASHED_NAME = /[-/.][a-f0-9]{8,}([-.][\w.]*)?\.\w+$/;
const UNDER_BUILD_ID = /^_next\/static\/[^/]+\/(_buildManifest|_ssgManifest)\.js$/;
const unaddressed = [...urls]
  .map((u) => u.slice(basePath.length).replace(/^\//, ""))
  .filter((rel) => rel.startsWith("_next/static/"))
  .filter((rel) => !HASHED_NAME.test(rel) && !UNDER_BUILD_ID.test(rel));
if (unaddressed.length) {
  console.error("\n✗ ملفّاتٌ تحت _next/static بلا بصمةِ محتوىً في اسمها:");
  for (const rel of unaddressed) console.error("   " + rel);
  console.error(
    "\n  العاملُ (public/sw.js) ينقل هذا المسار من خزن النشرة السابقة بلا تنزيل،\n" +
    "  فاسمٌ ثابتٌ بمحتوىً متغيّر = تقديمُ بايتاتٍ قديمة. عالِج قبل النشر:\n" +
    "  إمّا أن يُستثنى المسارُ في `isContentAddressed` داخل sw.js، وإمّا أن\n" +
    "  يُخرَج من الخزن المسبق."
  );
  process.exit(1);
}

const totalBytes = list.reduce((sum, u) => {
  const p = join(OUT, u.slice(basePath.length).replace(/^\//, "") || "index.html");
  try { return sum + statSync(p.endsWith("/") ? join(p, "index.html") : p).size; } catch { return sum; }
}, 0);
const mb = (n) => (n / 1048576).toFixed(1);
console.log(`precache.json: ${list.length} urls · ${mb(totalBytes)} MB · build ${buildId}`);
for (const [rel, size] of skipped) {
  console.log(`  ↷ خارج الخزن المسبق (تُنزَّل عند الحاجة): ${rel} — ${mb(size)} MB`);
}
