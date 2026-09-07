/**
 * حارسُ طبقة الخشوع.
 *
 * الأسئلةُ التي يجيب عنها: **هل يُحتسب إلّا ما أُدِّي؟** و**هل تصمت البطاقةُ
 * حين لا تملك عيّنة؟** و**هل تُقارَن الجماعةُ بالفرادى بلا خلطٍ بالقضاء؟**
 * وهذه الثلاثةُ هي كلُّ ما تقوم عليه أرقامٌ يقرأها المالك عن نفسه.
 */
import { describe, it, expect } from "vitest";
import type { KhushuLevel, PrayerLog, PrayerName, PrayerStatus } from "./types";
import {
  khushuOf, unansweredOn, windowLogs, khushuOverall, khushuByCompany,
  khushuByPrayer, khushuHighlights, khushuTrend, MIN_SAMPLE,
} from "./khushu";

/** يومٌ مختصر: `{ الفجر: ["جماعة", 3] }`. */
function day(date: string, spec: Partial<Record<PrayerName, [PrayerStatus, KhushuLevel?]>>): PrayerLog {
  const prayers: PrayerLog["prayers"] = {};
  const khushu: NonNullable<PrayerLog["khushu"]> = {};
  for (const [name, [status, level]] of Object.entries(spec) as [PrayerName, [PrayerStatus, KhushuLevel?]][]) {
    prayers[name] = status;
    if (level) khushu[name] = level;
  }
  return Object.keys(khushu).length ? { date, prayers, khushu } : { date, prayers };
}

describe("لا درجةَ إلّا لصلاةٍ أُدِّيت", () => {
  it("درجةٌ عالقةٌ على فرضٍ صار «فائتة» لا تُقرأ ولا تُحتسب", () => {
    // بقيّةُ تسجيلٍ قديم: الحالةُ رجعت فائتةً والدرجةُ لم تُمسح في البيانات.
    const log: PrayerLog = { date: "2026-03-01", prayers: { الفجر: "فائتة" }, khushu: { الفجر: 3 } };
    expect(khushuOf(log, "الفجر")).toBeUndefined();
    expect(khushuOverall([log]).n).toBe(0);
  });

  it("«قضاء» أداءٌ متأخّرٌ فتُحتسب درجتُه — كما تُحتسب في `isPrayedStatus`", () => {
    const log = day("2026-03-01", { الظهر: ["قضاء", 2] });
    expect(khushuOf(log, "الظهر")).toBe(2);
    expect(khushuOverall([log]).n).toBe(1);
  });

  it("درجةٌ خارج الثلاث (نسخةٌ أقدم أو ملفٌّ محرَّر) تُهمَل ولا ترمي", () => {
    const log = { date: "2026-03-01", prayers: { الفجر: "جماعة" }, khushu: { الفجر: 9 } } as unknown as PrayerLog;
    expect(khushuOf(log, "الفجر")).toBeUndefined();
    expect(khushuOverall([log]).avg).toBe(0);
  });

  it("«بقي سؤال» يعدّ ما أُدِّي ولم يُجب عنه وحده", () => {
    const log = day("2026-03-01", {
      الفجر: ["جماعة", 3], الظهر: ["منفردة"], العصر: ["فائتة"], المغرب: ["قضاء"],
    });
    expect(unansweredOn(log)).toEqual(["الظهر", "المغرب"]);
  });
});

describe("التجميعات", () => {
  const logs = [
    day("2026-03-01", { الفجر: ["جماعة", 3], الظهر: ["منفردة", 1], العصر: ["قضاء", 3] }),
    day("2026-03-02", { الفجر: ["جماعة", 3], الظهر: ["منفردة", 1] }),
  ];

  it("المتوسّطُ والعدّ والتوزيع", () => {
    const t = khushuOverall(logs);
    expect(t.n).toBe(5);
    expect(t.counts).toEqual([2, 0, 3]);
    expect(t.avg).toBeCloseTo(11 / 5);
  });

  it("القضاءُ لا يُنسب لجماعةٍ ولا لفرادى — حالٌ ثالثة", () => {
    const c = khushuByCompany(logs);
    expect(c["جماعة"].n).toBe(2);
    expect(c["منفردة"].n).toBe(2);
    expect(c["جماعة"].avg).toBe(3);
    expect(c["منفردة"].avg).toBe(1);
  });

  it("كلُّ فرضٍ على حدة", () => {
    const p = khushuByPrayer(logs);
    expect(p["الفجر"].n).toBe(2);
    expect(p["العصر"].n).toBe(1);
    expect(p["العشاء"].n).toBe(0);
    expect(p["العشاء"].avg).toBe(0);
  });

  it("النافذةُ تقطع ما قبلها", () => {
    const all = [day("2026-01-01", { الفجر: ["جماعة", 3] }), ...logs];
    expect(windowLogs(all, "2026-03-02", 30).map((l) => l.date)).toEqual(["2026-03-01", "2026-03-02"]);
  });

  it("المنحنى يترك يومَ الصمت `null` لا صفراً", () => {
    const t = khushuTrend(logs, "2026-03-03", 3);
    expect(t.map((d) => d.avg)).toEqual([7 / 3, 2, null]);
  });
});

describe("لا تنطق البطاقةُ برأيٍ قبل أن تملكه", () => {
  it("عيّنةٌ دون الحدّ → لا جُملَ أصلاً", () => {
    const logs = [day("2026-03-01", { الفجر: ["جماعة", 3], الظهر: ["منفردة", 1] })];
    expect(khushuOverall(logs).n).toBeLessThan(MIN_SAMPLE);
    expect(khushuHighlights(logs)).toEqual([]);
  });

  it("عيّنةٌ كافيةٌ وفرقٌ واضح → «قلبُك أحضرُ مع الناس» و«أخشعُ صلواتك»", () => {
    const logs = Array.from({ length: 5 }, (_, i) =>
      day(`2026-03-0${i + 1}`, {
        الفجر: ["جماعة", 3], الظهر: ["جماعة", 3],
        العصر: ["منفردة", 1], المغرب: ["منفردة", 1],
      })
    );
    const h = khushuHighlights(logs);
    expect(h.find((x) => x.key === "company")?.text).toContain("مع الناس");
    expect(h.find((x) => x.key === "best")?.text).toContain("الفجر");
    expect(h.find((x) => x.key === "worst")?.text).toMatch(/العصر|المغرب/);
  });

  it("طرفٌ بعيّنةٍ ضئيلةٍ لا يُقارَن — صدفةٌ لا نمط", () => {
    const logs = Array.from({ length: 4 }, (_, i) =>
      day(`2026-03-0${i + 1}`, { الفجر: ["جماعة", 3], الظهر: ["جماعة", 3] })
    );
    // «منفردة» مرّةً واحدة: لا مقارنةَ حالٍ رغم كفاية العيّنة الكليّة.
    logs.push(day("2026-03-05", { الفجر: ["جماعة", 3], العشاء: ["منفردة", 1] }));
    expect(khushuHighlights(logs).some((h) => h.key === "company")).toBe(false);
  });

  it("فرقٌ ضئيلٌ بين الحالين يُقال صراحةً لا يُختلق", () => {
    const logs = Array.from({ length: 4 }, (_, i) =>
      day(`2026-03-0${i + 1}`, { الفجر: ["جماعة", 2], الظهر: ["منفردة", 2] })
    );
    expect(khushuHighlights(logs).find((h) => h.key === "company")?.text).toContain("حضورُك واحد");
  });
});
