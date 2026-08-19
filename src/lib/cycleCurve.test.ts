import { describe, it, expect } from "vitest";
import {
  buildCycleCurve, curveGeometry, disciplineDays, disciplineScore, CURVE_BASE,
} from "./cycleCurve";
import type { DailyBudget, Transaction } from "./types";

const budget = (amount: number): DailyBudget => ({ amount, startDate: "2026-08-01" });

const tx = (date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: date + amount, date, amount, category: "c", note: "", ...extra,
});

// دورةٌ من ١ أغسطس إلى ٣١ أغسطس (الراتب القادم ١ سبتمبر) واليومُ ١٠ أغسطس.
const START = "2026-08-01", NEXT = "2026-09-01", TODAY = "2026-08-10";

describe("بناءُ المنحنى", () => {
  it("طولُ الدورة وترتيبُ اليوم فيها", () => {
    const c = buildCycleCurve(budget(100), [], START, NEXT, TODAY)!;
    expect(c.total).toBe(31);
    expect(c.idx).toBe(10);
    expect(c.end).toBe("2026-08-31");
    expect(c.dayVals).toHaveLength(10);
  });

  it("يتراكم يوماً بيوم، والفراغُ صفرٌ لا ثغرة", () => {
    const c = buildCycleCurve(budget(100), [tx("2026-08-02", 50), tx("2026-08-05", 30)], START, NEXT, TODAY)!;
    expect(c.dayVals[0]).toBe(0);
    expect(c.dayVals[1]).toBe(50);
    expect(c.cums[9]).toBe(80);
    expect(c.spent).toBe(80);
  });

  it("دون الخطِّ فرقٌ لك، وفوقَه فرقٌ عليك", () => {
    const under = buildCycleCurve(budget(100), [tx("2026-08-02", 200)], START, NEXT, TODAY)!;
    expect(under.expectedNow).toBe(1000);
    expect(under.over).toBe(false);
    expect(under.diff).toBe(800);

    const over = buildCycleCurve(budget(100), [tx("2026-08-02", 1500)], START, NEXT, TODAY)!;
    expect(over.over).toBe(true);
    expect(over.diff).toBe(500);
  });

  it("**لا منحنى بلا ميزانية** — خطُّ خطّةٍ مخترَعٌ أسوأُ من لا خطّ", () => {
    expect(buildCycleCurve(null, [], START, NEXT, TODAY)).toBeNull();
    expect(buildCycleCurve(budget(0), [], START, NEXT, TODAY)).toBeNull();
    expect(buildCycleCurve({ amount: NaN, startDate: START }, [], START, NEXT, TODAY)).toBeNull();
  });

  it("نافذةُ الشهر الميلادي ليست دورةً — لا تُرسم", () => {
    expect(buildCycleCurve(budget(100), [], "2026-08", NEXT, TODAY)).toBeNull();
  });

  it("يُحاسِب بمقاييس مدار: المؤجّلُ صفرٌ، والخارجُ عن الميزانية صفر", () => {
    const c = buildCycleCurve(budget(100), [
      tx("2026-08-02", 1200, { deferred: true }),
      tx("2026-08-03", 300, { offBudget: true }),
      tx("2026-08-04", 70),
    ], START, NEXT, TODAY)!;
    expect(c.spent).toBe(70);
  });

  it("حصّةُ الاحتياطي تُخصَم — كما تخصمها بطاقةُ الميزانية اليومية", () => {
    const c = buildCycleCurve(budget(100), [
      tx("2026-08-02", 200, { reserveSplits: [{ fundId: "f", pct: 25 }] }),
    ], START, NEXT, TODAY)!;
    expect(c.spent).toBe(150);
  });

  it("ما خارجَ نافذة الدورة لا يدخلها", () => {
    const c = buildCycleCurve(budget(100), [
      tx("2026-07-31", 500), tx("2026-09-02", 500), tx("2026-08-03", 40),
    ], START, NEXT, TODAY)!;
    expect(c.spent).toBe(40);
  });

  it("يومٌ خارجَ الدورة (تأكيدُ راتبٍ لم يُضغط) يُثبَّت عند آخرها لا يتجاوزها", () => {
    const c = buildCycleCurve(budget(100), [], START, NEXT, "2026-09-20")!;
    expect(c.idx).toBe(31);
    expect(c.dayVals).toHaveLength(31);
  });

  it("أوّلُ يومٍ في الدورة يومٌ واحدٌ لا صفر", () => {
    const c = buildCycleCurve(budget(100), [], START, NEXT, START)!;
    expect(c.idx).toBe(1);
    expect(c.expectedNow).toBe(100);
  });
});

describe("هندسةُ الرسم", () => {
  it("**الزمنُ يجري يميناً→يساراً**: يبدأ الخطّان من الحافّة اليمنى وينتهيان يساراً", () => {
    const g = curveGeometry(buildCycleCurve(budget(100), [tx("2026-08-02", 50)], START, NEXT, TODAY)!);
    expect(g.allowD.startsWith(`M300 ${CURVE_BASE} L0 `)).toBe(true);
    expect(g.spendD.startsWith(`M300 ${CURVE_BASE} L`)).toBe(true);
    expect(g.areaD.endsWith(` ${CURVE_BASE} Z`)).toBe(true);
    // اليومُ الأوّل ألصقُ بالحافّة اليمنى من اليوم العاشر
    const xs = [...g.spendD.matchAll(/L([\d.]+) /g)].map((m) => Number(m[1]));
    expect(xs[0]).toBeGreaterThan(xs[xs.length - 1]);
  });

  it("**التجاوزُ يبقى داخل الإطار** — لا خطَّ مبتوراً عند الحافّة", () => {
    const c = buildCycleCurve(budget(100), [tx("2026-08-02", 9000)], START, NEXT, TODAY)!;
    const g = curveGeometry(c);
    const ys = [...g.spendD.matchAll(/ (-?[\d.]+)(?= L|$)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  });

  it("«الآن» عند نسبة اليوم من الدورة، مقيسةً من اليمين", () => {
    const g = curveGeometry(buildCycleCurve(budget(100), [], START, NEXT, TODAY)!);
    expect(g.nowX).toBeCloseTo(300 - (10 / 31) * 300, 1);
  });

  it("دورةٌ بلا صرفٍ لا تقسم على صفر", () => {
    const g = curveGeometry(buildCycleCurve(budget(100), [], START, NEXT, TODAY)!);
    expect(g.spendD).not.toMatch(/NaN/);
    expect(g.areaD).not.toMatch(/NaN/);
  });
});

describe("انضباطُ الأيام", () => {
  it("ذهبيٌّ داخل البدل، طينيٌّ فوقه", () => {
    const d = disciplineDays(buildCycleCurve(budget(100), [
      tx("2026-08-01", 80), tx("2026-08-02", 150),
    ], START, NEXT, TODAY)!);
    expect(d[0].over).toBe(false);
    expect(d[1].over).toBe(true);
  });

  it("**اليومُ الخالي يبقى خطّاً مرئيّاً** (٣ لا صفر)", () => {
    const d = disciplineDays(buildCycleCurve(budget(100), [tx("2026-08-02", 400)], START, NEXT, TODAY)!);
    expect(d[0].height).toBe(3);
    expect(d.every((x) => x.height >= 3)).toBe(true);
  });

  it("يومٌ ببدلِه تماماً ليس تجاوزاً", () => {
    const d = disciplineDays(buildCycleCurve(budget(100), [tx("2026-08-01", 100)], START, NEXT, TODAY)!);
    expect(d[0].over).toBe(false);
  });

  it("النسبةُ من الأيام المنقضية لا من الدورة كلِّها", () => {
    const s = disciplineScore(buildCycleCurve(budget(100), [tx("2026-08-02", 400)], START, NEXT, TODAY)!);
    expect(s.of).toBe(10);
    expect(s.within).toBe(9);
    expect(s.ratio).toBeCloseTo(0.9, 5);
  });

  it("دورةٌ بلا صرفٍ كلُّها منضبطة", () => {
    const s = disciplineScore(buildCycleCurve(budget(100), [], START, NEXT, TODAY)!);
    expect(s.ratio).toBe(1);
  });
});
