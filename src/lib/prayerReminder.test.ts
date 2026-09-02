import { describe, expect, it } from "vitest";
import {
  PRAYER_REMINDER_DELAY_MS,
  duePrayerReminders,
  latestRecordedPrayerAt,
  pickSmartPrayerReminder,
} from "./prayerReminder";
import type { PrayerName } from "./types";

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

  it("يختار آخر صلاة حديثة بدل تراكم الصلوات القديمة", () => {
    const due = duePrayerReminders(at(14), date, times, undefined);
    expect(pickSmartPrayerReminder(due, at(14))?.prayer).toBe("الظهر");
  });

  it("يبقي التذكير الحديث متاحاً خلال اليوم حتى لا تضيع فرصة التسجيل", () => {
    const due = duePrayerReminders(at(11), date, times, undefined);
    expect(pickSmartPrayerReminder(due, at(11))?.prayer).toBe("الفجر");
  });

  it("لا يفتح مطالبة لصلاة أقدم من العمر المسموح", () => {
    const due = duePrayerReminders(at(23), date, times, undefined);
    expect(pickSmartPrayerReminder(due, at(23), 60 * 60 * 1000)).toBeNull();
  });

  it("يعرف آخر صلاة حُسمت كي لا يعيد فتح ما قبلها", () => {
    expect(latestRecordedPrayerAt(times, {
      date,
      prayers: { الفجر: "لم", الظهر: "جماعة", العصر: "لم" },
    })).toBe(times.الظهر.getTime());
    expect(latestRecordedPrayerAt(times, undefined)).toBe(0);
  });
});
