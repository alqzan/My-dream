#!/usr/bin/env node
// ===================== توليد تخطيط أوجه المصحف =====================
// «أبعاد الآيات الحقيقية»: أين ينكسر السطر، وكم سطراً في الوجه، وكيف يُمطّ السطر
// ليملأ عرضه — هذه بيانات طباعةٍ لا تُشتقّ من النصّ، فلا بدّ من مصدرٍ يحملها.
//
// المصدر: حزمة `quran-madina-html` (رخصة ISC) — مصحف المدينة، الإصدار القديم
// (مجمّع الملك فهد، 1405هـ)، مقيسٌ على خطّ «أميري قرآن» بحجم 16px وعرض سطرٍ
// 270px. النصّ فيها يحمل **تطويلاً (ـ) مدسوساً** لملء السطر، ولكلّ سطرٍ معامل
// تمدّدٍ أفقيّ (`s`) يُكمل ما بقي من الفرق — بهذين معاً يستوي السطر على عرضه
// تماماً كالمطبوع.
//
// المخرَج: `src/lib/quran/mushaf/chunk-NN.json` — حِزَمٌ من 20 وجهاً تُحمّل عند
// الطلب (لا يُحمَّل المصحف كلّه لقراءة وجهٍ واحد). الشكل موصوفٌ في
// `src/lib/quran/mushafLayout.ts`، وهو المرجع الوحيد لقراءتها.
//
// التشغيل (يحتاج شبكةً لتنزيل الحزمة، ولا يُشغَّل في البناء ولا في CI —
// المخرَج مُودَعٌ في المستودع):
//     node scripts/gen-mushaf-layout.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "src/lib/quran/mushaf");
const FONT_OUT = path.join(ROOT, "public/fonts/AmiriQuranMushaf.woff2");
const PKG = "quran-madina-html";
// الإصدار مثبَّت: البيانات مقيسةٌ على خطٍّ بعينه، وأيّ ترقيةٍ للحزمة قد تغيّر
// القياس — فتُراجَع يدوياً لا أن تنزلق مع `latest`.
const PKG_VERSION = "1.0.1";
const VARIANT = "Madina05-Amiri_Quran-16px";
const PAGES_PER_CHUNK = 20;

// آيةٌ سقط رقمُها من بيانات المصدر (الرعد 37). نعيده ونسجّله هنا صراحةً بدل أن
// نترك وجهاً في المصحف بلا رقم آية.
const MISSING_MARKERS = [{ sura: 13, ayah: 37 }];

// وإعادةُ الرقم تزيد عرض سطره، ومعاملُ تمدّد المصدر مقيسٌ على السطر ناقصاً —
// فيفيض عن عرض الوجه. هنا معاملُه الصحيح، مقيساً في المتصفّح بعد الإعادة
// (عرض المحتوى ÷ عرض الوجه). سطرٌ واحدٌ في المصحف كلّه.
const STRETCH_OVERRIDES = [{ page: 254, line: 7, stretch: 0.884 }];

// ===================== إحضار الحزمة =====================
function fetchPackage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mushaf-"));
  console.log(`↓ ${PKG}@${PKG_VERSION} …`);
  execFileSync("npm", ["pack", `${PKG}@${PKG_VERSION}`, "--silent"], { cwd: dir, stdio: ["ignore", "pipe", "inherit"] });
  const tgz = fs.readdirSync(dir).find((f) => f.endsWith(".tgz"));
  if (!tgz) throw new Error("npm pack لم يُخرج ملفاً");
  execFileSync("tar", ["xzf", tgz], { cwd: dir });
  return path.join(dir, "package");
}

// ===================== بنية المصحف من meta.ts =====================
// المعرّف العام للآية (1..6236) هو عملة التطبيق كلّه؛ نشتقّه من نفس الجدول الذي
// يستعمله الكود حتى لا يفترق ترقيمُ التخطيط عن ترقيم الحفظ والورد.
function surahFirsts() {
  const src = fs.readFileSync(path.join(ROOT, "src/lib/quran/meta.ts"), "utf8");
  const rows = [...src.matchAll(/\{ num: (\d+), name: "([^"]+)", ayat: (\d+), first: (\d+),/g)];
  if (rows.length !== 114) throw new Error(`توقّعنا 114 سورة، وجدنا ${rows.length}`);
  return rows.map((m) => ({ num: +m[1], name: m[2], ayat: +m[3], first: +m[4] }));
}

// ===================== التحويل =====================
const MARKER = /۝[0-9]+$/; // رقم الآية في آخر المقطع (يُرسم ﴿رقم﴾ في الخط)

function build(pkgDir) {
  const db = path.join(pkgDir, "assets/db", VARIANT);
  const manifest = JSON.parse(fs.readFileSync(path.join(db, "manifest.json"), "utf8"));
  const surahs = surahFirsts();

  // كلّ صفوف المصحف: [رقم السورة (0-based)، ترتيب الآية في السورة، الوجه، مقاطع]
  // وترتيب الآية: 0 اسم السورة، 1 البسملة، و2 فما فوق آياتٌ (رقم الآية = الترتيب − 1).
  const rows = [];
  for (let j = 1; j <= 30; j++) {
    const f = path.join(db, `juz-${String(j).padStart(2, "0")}.json`);
    rows.push(...JSON.parse(fs.readFileSync(f, "utf8")).d);
  }

  const missing = new Set(MISSING_MARKERS.map((m) => `${m.sura}:${m.ayah}`));
  const seen = new Set();
  const pages = new Map(); // page → Map(lineNo → { s, runs: [] })
  let markers = 0;

  for (const [suraIdx, ayaIdx, page, runs] of rows) {
    const key = `${suraIdx}:${ayaIdx}`;
    if (seen.has(key)) continue; // ملفات الأجزاء تتداخل عند حدودها
    seen.add(key);

    const surah = surahs[suraIdx];
    // 0 = سطر اسم السورة، ‎-1‎ = البسملة، وما عداهما معرّف الآية العام.
    const ayah = ayaIdx - 1;
    const id = ayaIdx === 0 ? 0 : ayaIdx === 1 && suraIdx !== 0 ? -1 : surah.first + ayah - 1;

    runs.forEach((run, i) => {
      let text = run.t;
      if (text === "") return; // صفٌّ حاجز في أول الفاتحة
      let num = 0;
      const m = text.match(MARKER);
      if (m) {
        num = +m[0].slice(1);
        text = text.slice(0, m.index);
        markers++;
      } else if (i === runs.length - 1 && id > 0 && missing.has(`${surah.num}:${ayah}`)) {
        num = ayah; // رقمٌ ساقطٌ من المصدر نُعيده
        markers++;
      }

      let pg = pages.get(page);
      if (!pg) pages.set(page, (pg = new Map()));
      let line = pg.get(run.l);
      if (!line) pg.set(run.l, (line = { s: run.s, runs: [] }));
      if (line.s !== run.s) throw new Error(`تمدّدان مختلفان لسطرٍ واحد: ص${page} س${run.l}`);
      line.runs.push([id, text, num]);
    });
  }

  for (const o of STRETCH_OVERRIDES) {
    const line = pages.get(o.page)?.get(o.line);
    if (!line) throw new Error(`تصحيحُ تمدّدٍ لسطرٍ غير موجود: ص${o.page} س${o.line}`);
    line.s = o.stretch;
  }

  // ===================== حراسة =====================
  if (pages.size !== 604) throw new Error(`توقّعنا 604 أوجه، وجدنا ${pages.size}`);
  if (markers !== 6236) throw new Error(`توقّعنا 6236 رقم آية، وجدنا ${markers}`);
  for (const [page, lines] of pages) {
    // وجها الفاتحة وأوّل البقرة مؤطّران بثمانية أسطر، وما عداهما خمسةَ عشر.
    const want = page <= 2 ? 8 : 15;
    if (lines.size !== want) throw new Error(`ص${page}: ${lines.size} سطراً بدل ${want}`);
    for (let l = 1; l <= want; l++) if (!lines.has(l)) throw new Error(`ص${page}: السطر ${l} مفقود`);
  }

  return { manifest, pages };
}

// ===================== الكتابة =====================
function write({ manifest, pages }) {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let chunks = 0;
  for (let from = 1; from <= 604; from += PAGES_PER_CHUNK) {
    const to = Math.min(604, from + PAGES_PER_CHUNK - 1);
    const out = {};
    for (let p = from; p <= to; p++) {
      const lines = pages.get(p);
      out[p] = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => [l.s, l.runs]);
    }
    const name = `chunk-${String(chunks).padStart(2, "0")}.json`;
    fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(out));
    chunks++;
  }

  const bytes = fs.readdirSync(OUT_DIR).reduce((n, f) => n + fs.statSync(path.join(OUT_DIR, f)).size, 0);
  console.log(`✓ ${chunks} حزمة · ${(bytes / 1024).toFixed(0)}KB · سطرٌ عرضه ${manifest.line_width}px عند ${manifest.font_size}px`);
  return { chunks, lineWidth: manifest.line_width, fontSize: manifest.font_size };
}

const pkgDir = process.argv[2] ?? fetchPackage();
const data = build(pkgDir);
const info = write(data);

// الخطّ نفسه الذي قِيس عليه التخطيط — نسخةٌ أخرى من «أميري قرآن» بمقاييس مختلفة
// تكسر انطباق الأسطر على عرضها.
fs.copyFileSync(path.join(pkgDir, "assets/fonts/AmiriQuran.woff2"), FONT_OUT);
console.log(`✓ الخط → ${path.relative(ROOT, FONT_OUT)}`);
console.log(`   PAGES_PER_CHUNK=${PAGES_PER_CHUNK} · LINE_WIDTH=${info.lineWidth} · FONT_SIZE=${info.fontSize}`);
