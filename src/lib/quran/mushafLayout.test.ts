import { describe, it, expect } from "vitest";
import {
  buildPage, countWords, chunkOf, linesOnPage, pageFontSize, ayahRangeOf,
  loadPageLines, PAGE_WIDTH, BASE_FONT_SIZE, CHUNK_COUNT, PAGES_PER_CHUNK, SURA_HEADER, BASMALA,
} from "./mushafLayout";
import { pageRange, idToPage, TOTAL_PAGES, TOTAL_AYAT, SURAHS } from "./meta";
import ayahText from "./ayahText.json";

describe("chunkOf", () => {
  it("يقسم الأوجه حِزَماً متتالية تغطّي المصحف كلّه", () => {
    expect(chunkOf(1)).toBe(0);
    expect(chunkOf(PAGES_PER_CHUNK)).toBe(0);
    expect(chunkOf(PAGES_PER_CHUNK + 1)).toBe(1);
    expect(chunkOf(TOTAL_PAGES)).toBe(CHUNK_COUNT - 1);
  });
});

describe("linesOnPage", () => {
  it("ثمانيةٌ في الوجهين المؤطّرين وخمسةَ عشر فيما عداهما", () => {
    expect(linesOnPage(1)).toBe(8);
    expect(linesOnPage(2)).toBe(8);
    expect(linesOnPage(3)).toBe(15);
    expect(linesOnPage(604)).toBe(15);
  });
});

describe("pageFontSize", () => {
  it("يعيد المقاس الأصليّ عند عرض الوجه الأصليّ ويتناسب معه", () => {
    expect(pageFontSize(PAGE_WIDTH)).toBe(BASE_FONT_SIZE);
    expect(pageFontSize(PAGE_WIDTH * 2)).toBe(BASE_FONT_SIZE * 2);
  });
});

describe("countWords", () => {
  it("لا يعدّ علامة الحزب ولا سجدة التلاوة كلمةً", () => {
    expect(countWords("۞ مَّثَلُ ٱلْجَنَّةِ")).toBe(2);
    expect(countWords("لَهُۥ ۩")).toBe(1);
    expect(countWords("")).toBe(0);
  });
});

describe("buildPage", () => {
  it("يحسب ترتيب أوّل كلمةٍ في كلّ مقطعٍ من الآية الواحدة", () => {
    const lines = buildPage([
      [1, [[SURA_HEADER, "سورة البقرة", 0]]],
      [1, [[10, "كلمة كلمتان ثلاث", 0]]],
      [0.9, [[10, "أربع خمس", 7], [11, "ست", 0]]],
    ]);
    expect(lines[1].runs[0].wordOffset).toBe(0);
    expect(lines[2].runs[0].wordOffset).toBe(3); // تكملة الآية نفسها
    expect(lines[2].runs[0].num).toBe(7);
    expect(lines[2].runs[1].wordOffset).toBe(0); // آيةٌ جديدة
  });

  it("يستخرج مدى معرّفات الوجه متخطّياً سطرَي الترويسة", () => {
    const lines = buildPage([
      [1, [[SURA_HEADER, "سورة البقرة", 0]]],
      [1, [[BASMALA, "بسم الله", 0]]],
      [1, [[8, "الم", 1], [9, "ذلك الكتاب", 0]]],
    ]);
    expect(ayahRangeOf(lines)).toEqual({ start: 8, end: 9 });
  });
});

// ===================== انطباق التخطيط على بنية المصحف =====================
// هذه الاختبارات تقرأ البيانات المولَّدة كلّها: هي الحارس على أنّ ما وُلِّد مرّةً
// لا ينحرف عمّا يفترضه باقي التطبيق (مدى كلّ وجه، وترقيم الآيات، وترتيب
// الكلمات الذي حُفظت به مواضعُ الخطأ عند المستخدم).
describe("بيانات الأوجه", () => {
  it("كلُّ وجهٍ بعدد أسطره ومداه من المعرّفات كما في meta", async () => {
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      const lines = await loadPageLines(page);
      expect(lines, `ص${page}`).not.toBeNull();
      expect(lines!.length, `ص${page} عدد الأسطر`).toBe(linesOnPage(page));
      expect(ayahRangeOf(lines!), `ص${page} المدى`).toEqual(pageRange(page));
    }
  });

  it("لكلّ آيةٍ رقمٌ واحدٌ في موضعه، والمجموع 6236", async () => {
    const numbered = new Map<number, number>();
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      for (const line of (await loadPageLines(page))!) {
        for (const run of line.runs) {
          if (run.num) {
            expect(numbered.has(run.id), `تكرّر رقم الآية ${run.id}`).toBe(false);
            numbered.set(run.id, run.num);
          }
        }
      }
    }
    expect(numbered.size).toBe(TOTAL_AYAT);
    for (const [id, num] of numbered) {
      const s = SURAHS.findLast((x) => x.first <= id)!;
      expect(num, `الآية ${id}`).toBe(id - s.first + 1);
    }
  });

  // كلماتُ الآية في التخطيط تُعدّ كما تُعدّ في `ayahText.json`، فترتيبُ الكلمة
  // واحدٌ في الاثنين — وعليه تتعلّق مواضعُ الخطأ المحفوظة عند المستخدم. ستُّ
  // آياتٍ من 6236 يفترق فيها التقطيع بين الرسمين: خمسٌ يفترق فيها قطعُ الكلمة
  // ووصلُها (مثل «مَا لِىَ» موصولةً في أحدهما مفصولةً في الآخر)، وواحدةٌ فيها
  // مسافةٌ رفيعة داخل الكلمة في نصّنا المخزّن (البقرة 72). معدودةٌ صراحةً هنا
  // فلا تمرّ منها سابعةٌ بلا انتباه: وسمُ كلمةٍ في هذه الستّ قد ينزلق موضعاً.
  const KNOWN_SPLIT_DIFFS = new Set([
    "2:72", "15:7", "27:20", "36:22", "37:164", "41:47",
  ]);

  it("ترتيبُ كلمات الآية مطابقٌ لنصّ المصحف المخزّن", async () => {
    const words = new Map<number, number>();
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      for (const line of (await loadPageLines(page))!) {
        for (const run of line.runs) {
          if (run.id > 0) words.set(run.id, run.wordOffset + countWords(run.text));
        }
      }
    }
    const off: string[] = [];
    for (const [id, n] of words) {
      const s = SURAHS.findLast((x) => x.first <= id)!;
      const key = `${s.num}:${id - s.first + 1}`;
      if (KNOWN_SPLIT_DIFFS.has(key)) continue;
      if (n !== countWords((ayahText as string[])[id] ?? "")) off.push(key);
    }
    expect(off).toEqual([]);
  });

  it("لا يذكر الوجهُ آيةً من وجهٍ آخر", async () => {
    for (const page of [1, 2, 3, 100, 255, 604]) {
      for (const line of (await loadPageLines(page))!) {
        for (const run of line.runs) {
          if (run.id > 0) expect(idToPage(run.id), `ص${page} الآية ${run.id}`).toBe(page);
        }
      }
    }
  });
});
