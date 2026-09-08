import { describe, expect, it } from "vitest";
import {
  PRAYER_REMINDER_DELAY_MS,
  duePrayerReminders,
  pickPrayerReminderGroup,
  duePrayerRemindersRange,
  lookbackDates,
  groupByDate,
  relativeDayLabel,
} from "./prayerReminder";
import type { PrayerLog, PrayerName } from "./types";
import { PRAYERS } from "./types";

const date = "2026-08-21";
const at = (hour: number, minute = 0) => new Date(2026, 7, 21, hour, minute);
const times = {
  الفجر: at(4, 30),
  الظهر: at(12),
  العصر: at(15, 30),
  المغرب: at(18, 45),
  العشاء: at(20, 15),
} as Record<PrayerName, Date>;

describe("duePrayerReminders", () => {
  it("لا يطالب قبل مرور نصف ساعة، ويطالب بعدها", () => {
    expect(duePrayerReminders(at(4, 59), date, times, undefined)).toHaveLength(0);
    const due = duePrayerReminders(at(5), date, times, undefined, 30 * 60 * 1000);
    expect(due[0]?.prayer).toBe("الفجر");
    expect(due[0]?.token).toBe(`${date}:الفجر`);
  });

  it("يتجاوز الصلاة المسجلة ويُبقي غير المسجلة فقط", () => {
    const due = duePrayerReminders(at(21), date, times, {
      date,
      prayers: { الفجر: "جماعة", الظهر: "منفردة", العصر: "لم", المغرب: "فائتة" },
    });
    expect(due.map((x) => x.prayer)).toEqual(["العصر", "العشاء"]);
  });

  it("يقبل حدّ الثلاثين دقيقة تمامًا", () => {
    const due = duePrayerReminders(new Date(at(4, 30).getTime() + PRAYER_REMINDER_DELAY_MS), date, times, undefined);
    expect(due[0]?.prayer).toBe("الفجر");
  });

  it("لا يخترع مطالبة إذا تعذّر حساب المواقيت", () => {
    expect(duePrayerReminders(at(23), date, null, undefined)).toEqual([]);
  });

  it("يجمع كل الصلوات المستحقّة في مطالبةٍ واحدة بترتيب اليوم", () => {
    const due = duePrayerReminders(at(19, 30), date, times, undefined);
    expect(pickPrayerReminderGroup(due, at(19, 30)).map((x) => x.prayer)).toEqual([
      "الفجر",
      "الظهر",
      "العصر",
      "المغرب",
    ]);
  });

  it("يبقي التذكير الحديث متاحاً خلال اليوم حتى لا تضيع فرصة التسجيل", () => {
    const due = duePrayerReminders(at(11), date, times, undefined);
    expect(pickPrayerReminderGroup(due, at(11)).map((x) => x.prayer)).toEqual(["الفجر"]);
  });

  it("يجمع صلوات اليوم كلها لمن فتح التطبيق متأخراً", () => {
    const due = duePrayerReminders(at(23), date, times, undefined);
    expect(pickPrayerReminderGroup(due, at(23))).toHaveLength(5);
  });

});

/* ═══════════ المطالبة تمتدّ لما مضى من الأيام ═══════════ */

describe("مطالبةٌ تجمع أيامًا مضت", () => {
  /** مواقيتُ مصنوعة: كلُّ فرضٍ على ساعةٍ ثابتة من يومه. */
  const HOURS: Record<PrayerName, number> = {
    الفجر: 5, الظهر: 12, العصر: 15, المغرب: 18, العشاء: 20,
  };
  const timesFor = (date: string): Record<PrayerName, Date> => {
    const [y, m, d] = date.split("-").map(Number);
    const out = {} as Record<PrayerName, Date>;
    for (const p of PRAYERS) out[p] = new Date(y, m - 1, d, HOURS[p], 0, 0);
    return out;
  };

  it("ثلاثةُ أيامٍ بلا فتحٍ للتطبيق تُعرض كلُّها، الأقدمُ أوّلاً", () => {
    const dates = lookbackDates("2026-05-04", 4); // ٠١ ← ٠٤
    const now = new Date(2026, 4, 4, 21, 0, 0);   // بعد عشاء اليوم الأخير
    const out = duePrayerRemindersRange(now, dates, timesFor, () => undefined);
    expect(out).toHaveLength(20); // ٤ أيام × ٥
    expect(out[0].date).toBe("2026-05-01");
    expect(out[0].prayer).toBe("الفجر");
    expect(out[out.length - 1].date).toBe("2026-05-04");
    // الترتيب زمنيٌّ صاعدٌ بلا انكسار.
    for (let i = 1; i < out.length; i++) {
      expect(out[i].adhanAt.getTime()).toBeGreaterThan(out[i - 1].adhanAt.getTime());
    }
  });

  it("ما سُجِّل في يومٍ مضى لا يُطالَب به — ولو بـ«فائتة»", () => {
    const dates = lookbackDates("2026-05-02", 2);
    const now = new Date(2026, 4, 2, 21, 0, 0);
    const logs: Record<string, PrayerLog> = {
      "2026-05-01": {
        date: "2026-05-01",
        prayers: { الفجر: "جماعة", الظهر: "فائتة", العصر: "قضاء", المغرب: "لم" },
      },
    };
    const out = duePrayerRemindersRange(now, dates, timesFor, (d) => logs[d]);
    const first = out.filter((c) => c.date === "2026-05-01").map((c) => c.prayer);
    // «لم» حالةٌ فارغة فتُطالَب، والثلاثُ المحسومة لا.
    expect(first).toEqual(["المغرب", "العشاء"]);
  });

  it("صلواتُ اليوم الجاري تبقى محكومةً بمهلة الثلاثين دقيقة", () => {
    const dates = lookbackDates("2026-05-02", 2);
    // بعد المغرب بعشر دقائق: المغربُ لم تحن مطالبتُه، وما قبله حان.
    const now = new Date(2026, 4, 2, 18, 10, 0);
    const out = duePrayerRemindersRange(now, dates, timesFor, () => undefined);
    const todayPrayers = out.filter((c) => c.date === "2026-05-02").map((c) => c.prayer);
    expect(todayPrayers).toEqual(["الفجر", "الظهر", "العصر"]);
    // ويومُ أمس كاملٌ رغم ذلك — المهلةُ مضت عليه كلِّه.
    expect(out.filter((c) => c.date === "2026-05-01")).toHaveLength(5);
  });

  it("يومٌ بمواقيتَ متعذّرةِ الحساب يُتخطّى ولا يُسقط بقيّة الأيام", () => {
    const dates = lookbackDates("2026-05-02", 2);
    const now = new Date(2026, 4, 2, 21, 0, 0);
    const out = duePrayerRemindersRange(
      now, dates, (d) => (d === "2026-05-01" ? null : timesFor(d)), () => undefined
    );
    expect(out.every((c) => c.date === "2026-05-02")).toBe(true);
    expect(out).toHaveLength(5);
  });

  it("التجميعُ بيومه يحفظ ترتيب الفروض داخل اليوم", () => {
    const dates = lookbackDates("2026-05-03", 3);
    const now = new Date(2026, 4, 3, 21, 0, 0);
    const groups = groupByDate(duePrayerRemindersRange(now, dates, timesFor, () => undefined));
    expect(groups.map((g) => g.date)).toEqual(["2026-05-01", "2026-05-02", "2026-05-03"]);
    expect(groups[0].items.map((i) => i.prayer)).toEqual(PRAYERS);
  });

  it("مسمّى اليوم النسبيّ", () => {
    expect(relativeDayLabel("2026-05-10", "2026-05-10")).toBe("اليوم");
    expect(relativeDayLabel("2026-05-09", "2026-05-10")).toBe("أمس");
    expect(relativeDayLabel("2026-05-08", "2026-05-10")).toBe("قبل يومين");
    expect(relativeDayLabel("2026-05-06", "2026-05-10")).toBe("قبل 4 أيام");
  });

  it("نافذةُ الرجوع تنتهي باليوم وتبدأ قبله بستّة", () => {
    const d = lookbackDates("2026-05-10");
    expect(d).toHaveLength(7);
    expect(d[0]).toBe("2026-05-04");
    expect(d[6]).toBe("2026-05-10");
  });
});
