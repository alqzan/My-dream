// ===================== ترتيبُ الآيات ومواضعُها من الأوجه =====================
// بياناتُ التخطيط مولَّدةٌ عن مصدرٍ خارجيّ (راجع `mushafSource.test.ts` لسلامة
// الملفّات نفسها)، وهذا الحارسُ يسأل سؤالاً آخر: **هل ما فيها مصحفٌ فعلاً؟**
// أي: هل الآياتُ متتابعةٌ بلا قفزٍ ولا تكرار، وهل كلُّ آيةٍ في وجهها من المصحف
// المطبوع، وهل رقمُها رقمُها في سورتها.
//
// وهو يقيس البياناتِ على **`meta.ts`** — وهو مصدرٌ مستقلٌّ عنها تماماً (جدولُ
// السور وبداياتُ الأوجه)، فاتّفاقُهما ليس دَوراً.
//
// ولوحُ الفاتحة (ص١) ووجهُ أوّل البقرة (ص٢) ثمانيةُ أسطر، وما عداهما خمسةَ عشر.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SURAHS, PAGE_STARTS, TOTAL_AYAT, TOTAL_PAGES } from "./meta";
import { CHUNK_COUNT, PAGES_PER_CHUNK, linesOnPage } from "./mushafLayout";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "mushaf");
type RawRun = [number, string, number];
type RawLine = [number, RawRun[]];

const pages = new Map<number, RawLine[]>();
for (let i = 0; i < CHUNK_COUNT; i++) {
  const name = `chunk-${String(i).padStart(2, "0")}.json`;
  const chunk = JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8")) as Record<string, RawLine[]>;
  for (const [page, lines] of Object.entries(chunk)) pages.set(+page, lines);
}

/** مقاطعُ الوجه بترتيبها، بلا سطرَي اسم السورة والبسملة. */
const ayahRuns = (page: number): RawRun[] =>
  (pages.get(page) ?? []).flatMap(([, runs]) => runs).filter(([id]) => id > 0);

describe("أوجهُ المصحف", () => {
  it("كلُّها موجودة، وكلُّ وجهٍ بعدد أسطره", () => {
    expect(pages.size).toBe(TOTAL_PAGES);
    const wrong: string[] = [];
    for (let p = 1; p <= TOTAL_PAGES; p++) {
      const lines = pages.get(p);
      if (!lines) { wrong.push(`ص${p} مفقود`); continue; }
      if (lines.length !== linesOnPage(p)) wrong.push(`ص${p}: ${lines.length} بدل ${linesOnPage(p)}`);
    }
    expect(wrong).toEqual([]);
  });

  it("حِزَمُ التخطيط تغطّي المصحف بلا فراغ", () => {
    expect(CHUNK_COUNT * PAGES_PER_CHUNK).toBeGreaterThanOrEqual(TOTAL_PAGES);
  });
});

describe("ترتيبُ الآيات عبر المصحف كلّه", () => {
  // مقاطعُ المصحف كلّها بترتيب القراءة (يمين الوجه إلى يساره، وجهاً بعد وجه).
  const runs: { page: number; run: RawRun }[] = [];
  for (let p = 1; p <= TOTAL_PAGES; p++) for (const run of ayahRuns(p)) runs.push({ page: p, run });

  it("متتابعةٌ بلا رجوعٍ ولا قفزٍ ولا انقطاعٍ ثمّ عودة", () => {
    const wrong: string[] = [];
    const firstSeen = new Map<number, number>();
    let prev = 0;
    for (const { page, run } of runs) {
      const id = run[0];
      if (id < prev) wrong.push(`ص${page}: الآية ${id} بعد ${prev}`);
      if (id !== prev) {
        if (firstSeen.has(id)) wrong.push(`ص${page}: الآية ${id} عادت بعد انقطاع (ص${firstSeen.get(id)})`);
        else firstSeen.set(id, page);
        if (prev && id !== prev + 1) wrong.push(`ص${page}: قفزٌ من ${prev} إلى ${id}`);
      }
      prev = id;
    }
    expect(wrong).toEqual([]);
    expect(firstSeen.size).toBe(TOTAL_AYAT);
  });

  it("لكلّ آيةٍ رقمٌ واحد، وهو ترتيبُها في سورتها", () => {
    const num = new Map<number, number>();
    let marks = 0;
    for (const { run } of runs) if (run[2] > 0) { num.set(run[0], run[2]); marks++; }
    expect(marks).toBe(TOTAL_AYAT);
    const wrong: string[] = [];
    for (const s of SURAHS) {
      for (let a = 1; a <= s.ayat; a++) {
        const id = s.first + a - 1;
        if (num.get(id) !== a) wrong.push(`${s.name} ${a}: رقمُها ${num.get(id)}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe("مواضعُ الآيات من الأوجه", () => {
  it("كلُّ وجهٍ يبدأ بالآية التي يقول جدولُ المصحف إنّه يبدأ بها", () => {
    const wrong: string[] = [];
    for (let p = 1; p <= TOTAL_PAGES; p++) {
      const first = ayahRuns(p)[0]?.[0];
      if (first !== PAGE_STARTS[p - 1]) wrong.push(`ص${p}: ${first} بدل ${PAGE_STARTS[p - 1]}`);
    }
    expect(wrong).toEqual([]);
  });

  it("وينتهي حيث يبدأ الذي بعده (أو بالآية التي قبلها)", () => {
    // الآيةُ قد تمتدّ على وجهين، فآخرُ الوجه إمّا آيةُ بداية التالي أو ما قبلها.
    const wrong: string[] = [];
    for (let p = 1; p < TOTAL_PAGES; p++) {
      const ids = ayahRuns(p).map(([id]) => id);
      const last = ids[ids.length - 1];
      const next = PAGE_STARTS[p];
      if (last !== next && last !== next - 1) wrong.push(`ص${p}: ينتهي بـ${last} والتالي يبدأ بـ${next}`);
    }
    expect(wrong).toEqual([]);
  });
});

// ===================== صورةُ وجهٍ بعينه =====================
// الوجه ٨ (البقرة ٤٩–٥٧) هو الوجه الذي أرسل المالك صورةً من مصحفه المطبوع له،
// وقُوبل به **سطراً بسطر** فانطبقت الخمسةَ عشر كلُّها على كلماتها. والقيمُ أدناه
// مأخوذةٌ من البيانات نفسها بعد تلك المقابلة — فهي **تثبيتٌ لا برهان**: البرهانُ
// وقع مرّةً بالعين على الورق، وهذا يمنع أن تنزلق الصورةُ بعده صامتةً في إعادة
// توليد. وصورةُ الوجه رأسُ مال الحافظ: إزاحةُ كلمةٍ بين سطرين تهدمها.
const PAGE_8_EDGES: [string, string][] = [
  ["وَإِذْ", "ٱلْعَذَابِ"],
  ["يُذَبِّحُونَ", "بَلَآءٌ"],
  ["مِّن", "فَأَنجَيْنَـٰكُمْ"],
  ["وَأَغْرَقْنَآ", "مُوسَىٰٓ"],
  ["أَرْبَعِيـنَ", "ظَـٰلِمُونَ"],
  ["ثُمَّ", "تَشْكُرُونَ"],
  ["وَإِذْ", "تَهْتَدُونَ"],
  ["وَإِذْ", "أَنفُسَكُم"],
  ["بِٱتِّخَاذِكُمُ", "ذَٰلِكُمْ"],
  ["خَيْرٌ", "ٱلرَّحِيمُ"],
  ["وَإِذْ", "جَهْرَةً"],
  ["فَأَخَذَتْكُمُ", "مِّنۢ"],
  ["بَعْـدِ", "عَلَيْكُمُ"],
  ["ٱلْغَمَامَ", "مَا"],
  ["رَزَقْنَـٰكُمْۖ", "يَظْلِمُونَ"],
];

describe("الوجه ٨ — كما في المصحف المطبوع", () => {
  it("خمسةَ عشر سطراً ينكسر كلٌّ منها عند كلمته", () => {
    const lines = pages.get(8)!;
    expect(lines).toHaveLength(15);
    const edges = lines.map(([, runs]) => {
      const words = runs.map(([, t]) => t).join("").trim().split(/\s+/);
      return [words[0], words[words.length - 1]];
    });
    expect(edges).toEqual(PAGE_8_EDGES);
  });

  it("وأرقامُ آياته ٤٩ إلى ٥٧", () => {
    const nums = ayahRuns(8).filter(([, , n]) => n > 0).map(([, , n]) => n);
    expect(nums).toEqual([49, 50, 51, 52, 53, 54, 55, 56, 57]);
  });
});
