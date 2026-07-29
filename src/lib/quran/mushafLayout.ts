// ===================== أسطر الوجه كما هي في المصحف =====================
// كان عرضُ الآيات نصّاً متّصلاً يتكسّر حيث شاء عرضُ الشاشة، فتختلف صورةُ الوجه
// من جهازٍ لآخر ومن حجم خطٍّ لآخر — وهي الصورة نفسها التي يتّكئ عليها الحافظ.
// هنا صارت الأسطر **معلومةً مقيسة**: 604 أوجه، خمسةَ عشر سطراً في الوجه (وثمانية
// في وجهَي الفاتحة وأوّل البقرة المؤطّرين)، وكلُّ سطرٍ ينتهي حيث ينتهي في
// المطبوع.
//
// كيف يستوي السطر على عرضه؟ بشيئين معاً، كلاهما من المصدر:
//   • **تطويلٌ مدسوس في النصّ** (حرف ـ داخل الكلمات) — وهو ما يفعله الخطّاط.
//   • **معامل تمدّدٍ أفقيّ للسطر** (`stretch`) يُكمل ما بقي من فرقٍ يسير.
// فمن رسم النصّ بلا هذين حصل على أسطرٍ مسنّنة الأطراف لا وجهَ مصحف.
//
// المقاس أصليّ لا مطلق: قِيس على عرض سطرٍ 270px بخطّ «أميري قرآن» حجم 16px. وكلّ
// عرضٍ آخر تكبيرٌ متناسب (`pageFontSize`) — النسب محفوظة فالأسطر تبقى منطبقة.
//
// البيانات مولَّدةٌ ومودَعة في `mushaf/chunk-NN.json` (راجع
// `scripts/gen-mushaf-layout.mjs`)، وتُحمّل حزمةً حزمة عند الطلب — لا يُنزَّل
// المصحف كلّه لقراءة وجهٍ واحد. هذا الملفّ نقيّ (بلا DOM ولا React) عدا استيراد
// البيانات، فيعبر إلى الغلاف الأصليّ كما هو.

/** مقطعٌ من آيةٍ داخل سطر: الآيات تنكسر على الأسطر، فللآية الواحدة مقاطع. */
export interface MushafRun {
  /** معرّف الآية العام (1..6236)، أو `SURA_HEADER` / `BASMALA` لسطرَي الترويسة. */
  id: number;
  text: string;
  /** رقم الآية يُختم به المقطع (0 إن لم تنتهِ الآية هنا). */
  num: number;
  /** ترتيب أوّل كلمةٍ من المقطع بين كلمات الآية — لوسم الكلمات بمواضعها. */
  wordOffset: number;
}

export interface MushafLine {
  /** معامل التمدّد الأفقيّ. `CENTERED` يعني سطراً يُتوسَّط بلا تمدّد. */
  stretch: number;
  runs: MushafRun[];
}

export type MushafPageLines = MushafLine[];

/** سطرُ اسم السورة. */
export const SURA_HEADER = 0;
/** سطرُ البسملة. */
export const BASMALA = -1;
/** سطرٌ يُتوسَّط بلا تمدّد (اسم السورة والبسملة). */
export const CENTERED = -1;

/** عرضُ السطر ومقاسُ الخطّ اللذان قِيس عليهما التخطيط. */
export const LINE_WIDTH = 270;
export const BASE_FONT_SIZE = 16;

/**
 * الوجه بعرض سطره، فتستوي الأسطر على حافّتيه كالمطبوع. والتمدّد المقيس يقارب
 * العرض ولا يصيبه تماماً — مسحُ الأسطر التسعة آلاف كلّها في المتصفّح وقع بين
 * 98.2% و102.5% من عرض السطر (والوسيط 99.4%). فما زاد يسيرٌ لا يُقصّ: حشوُ
 * الورقة حول الوجه يبتلعه، وهو أوسع من أعرض فيضٍ فيها.
 */
export const PAGE_WIDTH = LINE_WIDTH;

/** أوجهُ الحزمة الواحدة — يُحمّل منها ما يُقرأ فقط. */
export const PAGES_PER_CHUNK = 20;
export const CHUNK_COUNT = 31;

export function chunkOf(page: number): number {
  return Math.floor((page - 1) / PAGES_PER_CHUNK);
}

/**
 * مقاسُ الخطّ الذي يجعل أسطر وجهٍ بعرضٍ معلوم تستوي عليه — التخطيط نسبٌ، وهذه
 * ترجمتها إلى بكسلات. (في المتصفّح نستعمل `cqw` فيُحسب هذا تلقائياً؛ تبقى هذه
 * للحساب خارج CSS.)
 */
export function pageFontSize(width: number): number {
  return (width * BASE_FONT_SIZE) / PAGE_WIDTH;
}

/** عددُ أسطر الوجه: وجها الفاتحة وأوّل البقرة مؤطّران بثمانية، وما عداهما 15. */
export function linesOnPage(page: number): number {
  return page <= 2 ? 8 : 15;
}

// ===================== الكلمات =====================
// الرموز المفردة (علامة الحزب ۞ وسجدة التلاوة ۩) تُكتب في المصحف منفصلةً عمّا
// حولها، وهي ليست كلماتٍ من الآية. تخطّيها في العدّ يُبقي ترتيب الكلمات مطابقاً
// لترتيبها في نصّ `ayahText.json` — وهو الترتيب الذي حُفظت به مواضعُ الخطأ عند
// المستخدم، فلا تنزلق وسومُه القديمة عن كلماتها. (يحرسه `mushafLayout.test.ts`.)
const SYMBOL_ONLY = /^[۞۩\p{M}\s]+$/u;

export function countWords(text: string): number {
  let n = 0;
  for (const w of text.split(/\s+/)) if (w && !SYMBOL_ONLY.test(w)) n++;
  return n;
}

/** قطعةٌ من نصّ المقطع: كلمةٌ لها ترتيبها، أو فاصلٌ/رمزٌ لا ترتيب له. */
export interface WordToken {
  text: string;
  /** ترتيب الكلمة بين كلمات الآية، أو `null` لفراغٍ أو رمز. */
  index: number | null;
}

/**
 * تقطيعُ مقطعٍ إلى كلماتٍ **مع إبقاء الفراغات كما هي**. الفراغ ليس زينةً هنا:
 * عرضُ السطر مقيسٌ بنصّه بفراغاته، فمن أعاد تركيبه بمسافةٍ واحدةٍ بعد كلّ كلمة
 * أزاح السطر عن عرضه. `wordOffset` يجعل ترتيب الكلمة ترتيبَها في **الآية** لا
 * في المقطع — فوسمُ الكلمة يبقى عليها ولو انكسرت الآية على سطرين.
 */
export function tokenizeRun(text: string, wordOffset = 0): WordToken[] {
  let i = wordOffset;
  return text.split(/(\s+)/).filter((t) => t !== "").map((t) => (
    /^\s+$/.test(t) || SYMBOL_ONLY.test(t) ? { text: t, index: null } : { text: t, index: i++ }
  ));
}

// ===================== التحميل =====================
type RawRun = [number, string, number];
type RawLine = [number, RawRun[]];
type RawChunk = Record<string, RawLine[]>;

/**
 * محمِّلُ الحزمة. الاستيراد الديناميّ هو الأصل (يقسمه المُحزِّم إلى ملفّاتٍ
 * تُطلب عند الحاجة)، وهذا المتغيّر منفذٌ لاستبداله في الاختبار وحده — فمحاكاةُ
 * فشل شبكةٍ لا تُنال من `import()` مباشرةً.
 */
type ChunkLoader = (index: number) => Promise<RawChunk>;

const importChunk: ChunkLoader = (index) => {
  const name = String(index).padStart(2, "0");
  return import(`./mushaf/chunk-${name}.json`).then((m) => (m.default ?? m) as RawChunk);
};

let loader: ChunkLoader = importChunk;

const chunks = new Map<number, Promise<RawChunk>>();

/**
 * وعدُ الحزمة يُحفظ ليُشارَك بين الأوجه — لكنّ **الوعد المرفوض لا يُحفظ**.
 * كان يُحفظ، فانقطاعةٌ واحدة أو ملفٌّ لم يصل تُبقي الرفضَ في الخريطة إلى نهاية
 * الجلسة: كلُّ وجهٍ من تلك الحزمة يفشل بعدها فوراً بلا محاولةٍ ثانية، ويبقى
 * القارئ على هيكلٍ فارغ إلى الأبد. الآن يُنزع المرفوض فتصحّ إعادةُ المحاولة.
 */
function loadChunk(index: number): Promise<RawChunk> {
  let p = chunks.get(index);
  if (!p) {
    p = loader(index).catch((err) => {
      if (chunks.get(index) === p) chunks.delete(index);
      throw err;
    });
    chunks.set(index, p);
  }
  return p;
}

/** استبدالُ محمِّل الحِزَم — للاختبار. `null` يعيد الاستيراد الديناميّ الأصليّ. */
export function setChunkLoader(fn: ChunkLoader | null): void {
  loader = fn ?? importChunk;
}

/** إفراغُ ما حُفظ من حِزَمٍ وأوجه — للاختبار. */
export function clearChunkCache(): void {
  chunks.clear();
  built.clear();
}

const built = new Map<number, MushafPageLines>();

/** أسطرُ وجهٍ بعينه — تُحمّل حزمتُه أوّل مرّة ثم تُحفظ. */
export async function loadPageLines(page: number): Promise<MushafPageLines | null> {
  const ready = built.get(page);
  if (ready) return ready;
  if (page < 1 || page > 604) return null;
  const chunk = await loadChunk(chunkOf(page));
  const raw = chunk[String(page)];
  if (!raw) return null;
  const lines = buildPage(raw);
  built.set(page, lines);
  return lines;
}

/** أسطرُ وجهٍ إن كانت حزمتُه محمّلةً — للرسم الأوّل بلا انتظار. */
export function peekPageLines(page: number): MushafPageLines | null {
  return built.get(page) ?? null;
}

/**
 * تحويل الشكل المضغوط إلى أسطرٍ مقروءة، وحسابُ ترتيب أوّل كلمةٍ في كلّ مقطع.
 * نقيّة ومختبَرة — لا تُكرّر هذا الحساب في مكوّن.
 */
export function buildPage(raw: RawLine[]): MushafPageLines {
  const consumed = new Map<number, number>(); // معرّف الآية → كم كلمةً مضت منها
  return raw.map(([stretch, runs]) => ({
    stretch,
    runs: runs.map(([id, text, num]) => {
      const wordOffset = consumed.get(id) ?? 0;
      if (id > 0) consumed.set(id, wordOffset + countWords(text));
      return { id, text, num, wordOffset };
    }),
  }));
}

/** أوّلُ آيةٍ وآخرُها في أسطر وجه — لربط الوجه بمدى معرّفاته. */
export function ayahRangeOf(lines: MushafPageLines): { start: number; end: number } | null {
  let start = Infinity;
  let end = -Infinity;
  for (const line of lines) {
    for (const run of line.runs) {
      if (run.id <= 0) continue;
      if (run.id < start) start = run.id;
      if (run.id > end) end = run.id;
    }
  }
  return start === Infinity ? null : { start, end };
}
