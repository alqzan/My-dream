/**
 * حارسُ طبقة الخشوع في المتجر والدمج.
 *
 * السؤالان اللذان لا يُجيب عنهما `khushu.test.ts`: **هل تسقط الدرجةُ حين تسقط
 * الصلاة؟** و**هل تعبر الدرجةُ جهازين بلا أن تدهس تصحيحَ الحالة؟** — والثاني
 * هو الفخُّ الذي وُجدت الطوابعُ المستقلّة من أجله (السننُ والقيام قبلها).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => { idb.set(k, v); },
  del: async (k: string) => { idb.delete(k); },
}));

import { useAppStore } from "./store";
import { mergeAppData } from "./merge";
import { khushuOf } from "./khushu";
import type { AppData, PrayerLog } from "./types";

const DATE = "2026-04-10";
const dayOf = () => useAppStore.getState().prayerLogs.find((l) => l.date === DATE);

beforeEach(() => {
  idb.clear();
  useAppStore.setState(useAppStore.getInitialState?.() ?? {}, false);
});

describe("المتجر: الدرجةُ تابعةٌ للحالة", () => {
  it("تُكتب وتُقرأ لفرضٍ أُدِّي", () => {
    const s = useAppStore.getState();
    s.setPrayerStatus(DATE, "الفجر", "جماعة");
    s.setKhushu(DATE, "الفجر", 3);
    expect(khushuOf(dayOf(), "الفجر")).toBe(3);
  });

  it("مسحُ الحالة يمسح الدرجة — لا تبقى صلاةٌ خاشعةٌ لم تقع", () => {
    const s = useAppStore.getState();
    s.setPrayerStatus(DATE, "الفجر", "جماعة");
    s.setKhushu(DATE, "الفجر", 3);
    useAppStore.getState().setPrayerStatus(DATE, "الفجر", "لم");
    expect(dayOf()!.khushu).toBeUndefined();
  });

  it("«فاتتني» تمسح الدرجة أيضاً، وأختُها في اليوم نفسِه تبقى", () => {
    const s = useAppStore.getState();
    s.setPrayerStatus(DATE, "الفجر", "منفردة");
    useAppStore.getState().setKhushu(DATE, "الفجر", 2);
    useAppStore.getState().setPrayerStatus(DATE, "الظهر", "جماعة");
    useAppStore.getState().setKhushu(DATE, "الظهر", 3);
    useAppStore.getState().setPrayerStatus(DATE, "الفجر", "فائتة");
    expect(dayOf()!.khushu).toEqual({ الظهر: 3 });
  });

  it("`undefined` تمسح الدرجة («أمرُّ») ولا تكتب درجةً رابعة", () => {
    const s = useAppStore.getState();
    s.setPrayerStatus(DATE, "العصر", "جماعة");
    useAppStore.getState().setKhushu(DATE, "العصر", 1);
    useAppStore.getState().setKhushu(DATE, "العصر", undefined);
    expect(dayOf()!.khushu).toBeUndefined();
  });

  it("الطابعُ مستقلٌّ عن طابع الحالة — لا يتحرّك أحدُهما بالآخر", () => {
    const s = useAppStore.getState();
    s.setPrayerStatus(DATE, "المغرب", "جماعة");
    const afterStatus = dayOf()!;
    const statusStamp = afterStatus.prayerUpdatedAt!["المغرب"]!;
    useAppStore.getState().setKhushu(DATE, "المغرب", 2);
    const afterKhushu = dayOf()!;
    expect(afterKhushu.prayerUpdatedAt!["المغرب"]).toBe(statusStamp);
    expect(afterKhushu.khushuUpdatedAt!["المغرب"]).toBeGreaterThanOrEqual(statusStamp);
  });
});

/** لقطةٌ صغيرةٌ بيومِ صلاةٍ واحد. */
function snap(log: PrayerLog, lastUpdated: string): AppData {
  useAppStore.setState(useAppStore.getInitialState?.() ?? {}, false);
  useAppStore.getState().hydrate({ prayerLogs: [log], lastUpdated });
  return useAppStore.getState().snapshot();
}

describe("الدمج: درجةٌ من هنا وتصحيحُ حالةٍ من هناك", () => {
  it("الدرجةُ المتأخّرةُ على جهازٍ لا تُرجع حالةً صُحّحت على الآخر", () => {
    // الجوّال: سجّل «منفردة» ثمّ أجاب عن خشوعه متأخّراً (طابعٌ أحدث للدرجة).
    const phone = snap(
      {
        date: DATE,
        prayers: { الفجر: "منفردة" },
        prayerUpdatedAt: { الفجر: 1_000 },
        khushu: { الفجر: 2 },
        khushuUpdatedAt: { الفجر: 9_000 },
      },
      "2026-04-10T09:00:00.000Z"
    );
    // الآيباد: صحّح الحالةَ إلى «جماعة» بعد الجوّال، ولم يُسأل عن الخشوع.
    const ipad = snap(
      { date: DATE, prayers: { الفجر: "جماعة" }, prayerUpdatedAt: { الفجر: 5_000 } },
      "2026-04-10T08:00:00.000Z"
    );

    const merged = mergeAppData(phone, ipad).prayerLogs[0];
    // الحالةُ للأحدث بطابعها، والدرجةُ للأحدث بطابعها — لا يدهس أحدُهما الآخر.
    expect(merged.prayers["الفجر"]).toBe("جماعة");
    expect(merged.khushu?.["الفجر"]).toBe(2);
  });

  it("مسحُ الدرجة على الجهاز الأحدث ينتشر ولا تُعيده نسخةٌ قديمة", () => {
    const answered = snap(
      {
        date: DATE, prayers: { الظهر: "جماعة" }, prayerUpdatedAt: { الظهر: 1_000 },
        khushu: { الظهر: 3 }, khushuUpdatedAt: { الظهر: 2_000 },
      },
      "2026-04-10T07:00:00.000Z"
    );
    const cleared = snap(
      {
        date: DATE, prayers: { الظهر: "جماعة" }, prayerUpdatedAt: { الظهر: 1_000 },
        khushuUpdatedAt: { الظهر: 6_000 },
      },
      "2026-04-10T09:00:00.000Z"
    );
    const merged = mergeAppData(cleared, answered).prayerLogs[0];
    expect(merged.khushu?.["الظهر"]).toBeUndefined();
    // ولا يبقى حقلٌ فارغٌ يوهم بإجابة.
    expect(merged.khushu).toBeUndefined();
  });

  it("درجتان لفرضين مختلفين في اليوم نفسِه تجتمعان", () => {
    const a = snap(
      { date: DATE, prayers: { الفجر: "جماعة" }, khushu: { الفجر: 3 }, khushuUpdatedAt: { الفجر: 100 } },
      "2026-04-10T07:00:00.000Z"
    );
    const b = snap(
      { date: DATE, prayers: { العشاء: "منفردة" }, khushu: { العشاء: 1 }, khushuUpdatedAt: { العشاء: 200 } },
      "2026-04-10T08:00:00.000Z"
    );
    const merged = mergeAppData(a, b).prayerLogs[0];
    expect(merged.khushu).toEqual({ الفجر: 3, العشاء: 1 });
  });

  it("يومٌ قديمٌ بلا خشوعٍ يبقى بلا حقلٍ محقون", () => {
    const a = snap({ date: DATE, prayers: { الفجر: "جماعة" } }, "2026-04-10T07:00:00.000Z");
    const b = snap({ date: DATE, prayers: { الظهر: "جماعة" } }, "2026-04-10T08:00:00.000Z");
    const merged = mergeAppData(a, b).prayerLogs[0];
    expect(merged.khushu).toBeUndefined();
    expect(merged.khushuUpdatedAt).toBeUndefined();
  });
});

describe("الدورةُ الكاملة: لقطةٌ ← ترطيب", () => {
  it("الدرجاتُ وطوابعُها تعبر `snapshot`/`hydrate` بلا خسارة", () => {
    const s = useAppStore.getState();
    s.setPrayerStatus(DATE, "الفجر", "جماعة");
    useAppStore.getState().setKhushu(DATE, "الفجر", 3);
    const out = useAppStore.getState().snapshot();

    useAppStore.setState(useAppStore.getInitialState?.() ?? {}, false);
    useAppStore.getState().hydrate(out);
    expect(khushuOf(dayOf(), "الفجر")).toBe(3);
    expect(dayOf()!.khushuUpdatedAt!["الفجر"]).toBeGreaterThan(0);
  });
});
