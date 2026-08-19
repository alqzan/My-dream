import { describe, it, expect } from "vitest";
import {
  isPrayed, prayedCount, jamaahCount, qadaOwed, qadaDoneOn, oldestMissed,
  qiyamOf, stepRakaat, qiyamChain, sunanOf, stepSunan, QIYAM_MAX, SUNAN_MAX,
  yearRingSpokes, YEAR_SPOKES,
} from "./prayerExtras";
import type { PrayerLog } from "./types";

const log = (date: string, prayers: PrayerLog["prayers"], extra: Partial<PrayerLog> = {}): PrayerLog =>
  ({ date, prayers, ...extra });

describe("isPrayed / العدّ", () => {
  it("«فائتة» دَينٌ لا أداء — لا تُعَدّ مع المؤدّى", () => {
    expect(isPrayed("جماعة")).toBe(true);
    expect(isPrayed("منفردة")).toBe(true);
    expect(isPrayed("قضاء")).toBe(true);
    expect(isPrayed("فائتة")).toBe(false);
    expect(isPrayed("لم")).toBe(false);
    expect(isPrayed(undefined)).toBe(false);
  });

  it("prayedCount يعدّ المؤدّى وحده، وjamaahCount الجماعةَ وحدها", () => {
    const l = log("2026-08-15", {
      الفجر: "جماعة", الظهر: "منفردة", العصر: "قضاء", المغرب: "فائتة", العشاء: "لم",
    });
    expect(prayedCount(l)).toBe(3);
    expect(jamaahCount(l)).toBe(1);
  });

  it("يومٌ بلا سجلّ = صفر، لا انهيار", () => {
    expect(prayedCount(undefined)).toBe(0);
    expect(jamaahCount(undefined)).toBe(0);
  });
});

describe("الفوائت والقضاء", () => {
  const logs = [
    log("2026-08-12", { الفجر: "فائتة", الظهر: "جماعة" }),
    log("2026-08-14", { العصر: "فائتة", المغرب: "فائتة" }),
    log("2026-08-15", { الفجر: "قضاء", الظهر: "قضاء", العصر: "جماعة" }),
  ];

  it("ما عليك = الفوائتُ المسجّلة + الدَّينُ السابق للتسجيل", () => {
    expect(qadaOwed(logs)).toBe(3);
    expect(qadaOwed(logs, 10)).toBe(13);
    expect(qadaOwed([], 4)).toBe(4);
    expect(qadaOwed([])).toBe(0);
  });

  it("الدَّينُ السالب لا يخصم من الفوائت المسجّلة", () => {
    expect(qadaOwed(logs, -5)).toBe(3);
  });

  it("«قضيتَ اليومَ» يعدّ حالةَ «قضاء» في ذلك اليوم وحدَه", () => {
    expect(qadaDoneOn(logs, "2026-08-15")).toBe(2);
    expect(qadaDoneOn(logs, "2026-08-14")).toBe(0);
    expect(qadaDoneOn(logs, "2026-01-01")).toBe(0);
  });

  it("«اقضِ واحدة» تستهدف أقدمَ فائتة، وداخلَ اليوم بترتيب الفروض", () => {
    expect(oldestMissed(logs)).toEqual({ date: "2026-08-12", prayer: "الفجر" });
    // بعد قضاء فجر ١٢، الهدفُ التالي عصرُ ١٤ (لا مغربُه — ترتيبُ الفروض).
    const after = [
      log("2026-08-12", { الفجر: "قضاء", الظهر: "جماعة" }),
      log("2026-08-14", { العصر: "فائتة", المغرب: "فائتة" }),
    ];
    expect(oldestMissed(after)).toEqual({ date: "2026-08-14", prayer: "العصر" });
  });

  it("بلا فائتةٍ مسجّلة لا هدفَ — فيُخصَم من الدَّين السابق بدلاً منه", () => {
    expect(oldestMissed([log("2026-08-15", { الفجر: "جماعة" })])).toBeNull();
    expect(oldestMissed([])).toBeNull();
  });
});

describe("قيام الليل", () => {
  it("الخطوةُ ركعتان ومحصورةٌ في [٠، ٢١]", () => {
    expect(stepRakaat(0, 1)).toBe(2);
    expect(stepRakaat(8, 1)).toBe(10);
    expect(stepRakaat(0, -1)).toBe(0);
    expect(stepRakaat(2, -1)).toBe(0);
    expect(stepRakaat(QIYAM_MAX, 1)).toBe(QIYAM_MAX);
    expect(stepRakaat(20, 1)).toBe(QIYAM_MAX);
  });

  it("ليلةٌ بلا تسجيل تُقرأ صفراً بلا وتر", () => {
    expect(qiyamOf(undefined)).toEqual({ rakaat: 0, witr: false });
    expect(qiyamOf(log("2026-08-15", {}))).toEqual({ rakaat: 0, witr: false });
    expect(qiyamOf(log("2026-08-15", {}, { qiyam: { rakaat: 8, witr: true } })))
      .toEqual({ rakaat: 8, witr: true });
  });

  it("السلسلةُ ثلاثون ليلةً تنتهي باليوم، الأقدمُ أوّلاً", () => {
    const logs = [
      log("2026-08-15", {}, { qiyam: { rakaat: 8, witr: true } }),
      log("2026-08-01", {}, { qiyam: { rakaat: 2, witr: false } }),
    ];
    const chain = qiyamChain(logs, "2026-08-15");
    expect(chain).toHaveLength(30);
    expect(chain[0].date).toBe("2026-07-17");
    expect(chain[29]).toEqual({ date: "2026-08-15", rakaat: 8, witr: true });
    expect(chain.find((c) => c.date === "2026-08-01")).toEqual({
      date: "2026-08-01", rakaat: 2, witr: false,
    });
    // ليلةٌ خارج السجلّ تظهر خاليةً لا مفقودة.
    expect(chain.find((c) => c.date === "2026-08-02")).toEqual({
      date: "2026-08-02", rakaat: 0, witr: false,
    });
  });

  it("السلسلةُ تقبل طولاً آخر", () => {
    expect(qiyamChain([], "2026-08-15", 7)).toHaveLength(7);
  });
});

describe("السنن الرواتب", () => {
  it("محصورةٌ في [٠، ١٢] بخطوةِ واحدة", () => {
    expect(stepSunan(0, -1)).toBe(0);
    expect(stepSunan(0, 1)).toBe(1);
    expect(stepSunan(SUNAN_MAX, 1)).toBe(SUNAN_MAX);
    expect(stepSunan(5, -1)).toBe(4);
  });

  it("الغيابُ صفرٌ والسالبُ لا يُقرأ", () => {
    expect(sunanOf(undefined)).toBe(0);
    expect(sunanOf(log("2026-08-15", {}))).toBe(0);
    expect(sunanOf(log("2026-08-15", {}, { sunan: 6 }))).toBe(6);
    expect(sunanOf(log("2026-08-15", {}, { sunan: -3 }))).toBe(0);
  });
});

describe("حلقةُ السنة", () => {
  const full = (date: string): PrayerLog =>
    log(date, { الفجر: "جماعة", الظهر: "جماعة", العصر: "جماعة", المغرب: "جماعة", العشاء: "جماعة" });

  it("ثلاثٌ وسبعون شعبةً دائماً", () => {
    expect(yearRingSpokes([], 2026, "2026-08-15")).toHaveLength(YEAR_SPOKES);
  });

  it("الشعبةُ تُضيء عند أربعٍ من خمسٍ فأعلى لا عند الكمال وحدَه", () => {
    // الأيامُ ١–٥ من ٢٠٢٦: أربعةُ أيامٍ كاملة ويومٌ بأربع = ٢٤/٢٥ = ٠٫٩٦
    const logs = [
      full("2026-01-01"), full("2026-01-02"), full("2026-01-03"), full("2026-01-04"),
      log("2026-01-05", { الفجر: "جماعة", الظهر: "جماعة", العصر: "جماعة", المغرب: "منفردة" }),
    ];
    const spokes = yearRingSpokes(logs, 2026, "2026-08-15");
    expect(spokes[0].met).toBe(true);
    expect(spokes[0].ratio).toBeCloseTo(24 / 25);
  });

  it("دون الحدّ لا تُضيء، وتبقى «ماضيةً» لا مستقبلاً", () => {
    const spokes = yearRingSpokes([log("2026-01-01", { الفجر: "جماعة" })], 2026, "2026-08-15");
    expect(spokes[0].met).toBe(false);
    expect(spokes[0].past).toBe(true);
    expect(spokes[0].ratio).toBeCloseTo(1 / 25);
  });

  it("ما لم يأتِ بعدُ ليس ماضياً ولا موفًّى", () => {
    const spokes = yearRingSpokes([], 2026, "2026-01-03");
    expect(spokes[0].past).toBe(true); // الشعبةُ الجارية بدأت
    expect(spokes[0].now).toBe(true);
    expect(spokes[5].past).toBe(false);
    expect(spokes[5].met).toBe(false);
  });

  it("«فائتة» تخفض النسبة و«قضاء» ترفعها — وإلّا صار تسجيلُ القضاء عقوبة", () => {
    const missed = [log("2026-01-01", { الفجر: "فائتة" })];
    const made = [log("2026-01-01", { الفجر: "قضاء" })];
    expect(yearRingSpokes(missed, 2026, "2026-08-15")[0].ratio).toBe(0);
    expect(yearRingSpokes(made, 2026, "2026-08-15")[0].ratio).toBeCloseTo(1 / 25);
  });

  it("سنةٌ ماضيةٌ كاملةُ الاحتساب، وسنةٌ قادمةٌ خالية", () => {
    expect(yearRingSpokes([full("2025-01-01")], 2025, "2026-08-15")[0].past).toBe(true);
    expect(yearRingSpokes([], 2027, "2026-08-15").every((s) => !s.past)).toBe(true);
  });
});
