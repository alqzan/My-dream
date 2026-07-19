// المتشابهات — لكلّ آيةٍ قائمةُ الآيات المتشابهة معها (متطابقةٌ بعد التطبيع أو
// تشترك في عبارةٍ طويلة). البيانات مولّدةٌ مسبقاً في mutashabihat.json عبر
// scripts/gen-mutashabihat.mjs، وتُحمّل عند الطلب أوّل مرّة (chunk منفصل).

export type SimMap = Record<string, number[]>;

let cache: SimMap | null = null;
let loading: Promise<SimMap> | null = null;

export async function loadMutashabihat(): Promise<SimMap> {
  if (cache) return cache;
  if (!loading) {
    loading = import("./mutashabihat.json").then((m) => {
      cache = (m.default ?? m) as unknown as SimMap;
      return cache;
    });
  }
  return loading;
}

// الآيات المتشابهة مع آيةٍ بعينها (فارغة إن لا متشابهات).
export function similarOf(map: SimMap | null, id: number): number[] {
  if (!map) return [];
  return map[String(id)] ?? [];
}

// آيات مقطعٍ [from, to] التي لها متشابهات — لتنبيه المستخدم عند المرور بها.
export function similarInRange(map: SimMap | null, from: number, to: number): number[] {
  if (!map) return [];
  const out: number[] = [];
  for (let id = from; id <= to; id++) if ((map[String(id)]?.length ?? 0) > 0) out.push(id);
  return out;
}

// تطبيعٌ يجرّد علامات الرسم العثماني ويوحّد الألفات/الهمزات — لمقارنة الكلمات.
function normWord(w: string): string {
  return w
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "")
    .replace(/[أإآٱ]/g, "ا") // أإآٱ → ا
    .replace(/ى/g, "ي") // ى → ي
    .replace(/ؤ/g, "و") // ؤ → و
    .replace(/ئ/g, "ي") // ئ → ي
    .replace(/ة/g, "ه"); // ة → ه
}

export interface DiffWord { text: string; same: boolean }

// فرق الكلمات بين آيتين: يحاذيهما بأطول تتابعٍ فرعيٍّ مشترك (LCS) ويعلّم الكلمات
// المختلفة في كلٍّ منهما — لإبراز مواضع الاختلاف بين المتشابهات.
export function wordDiff(aRaw: string, bRaw: string): { a: DiffWord[]; b: DiffWord[] } {
  const aw = aRaw.split(/\s+/).filter(Boolean);
  const bw = bRaw.split(/\s+/).filter(Boolean);
  const an = aw.map(normWord);
  const bn = bw.map(normWord);
  const n = an.length, m = bn.length;
  // جدول LCS
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i][j] = an[i - 1] === bn[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const aSame = new Array(n).fill(false);
  const bSame = new Array(m).fill(false);
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (an[i - 1] === bn[j - 1]) { aSame[i - 1] = true; bSame[j - 1] = true; i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return {
    a: aw.map((t, k) => ({ text: t, same: aSame[k] })),
    b: bw.map((t, k) => ({ text: t, same: bSame[k] })),
  };
}
