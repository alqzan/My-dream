/**
 * حارسُ التوافق مع ما قبل نقل شاشة الصلاة.
 *
 * السؤال الذي يجيب عنه هذا الملفّ سؤالٌ واحد: **هل يخسر جهازٌ عليه بياناتٌ
 * قديمة شيئاً بعد هذا التغيير؟** الحقولُ الثلاثة المضافة (`sunan` · `qiyam` ·
 * `qadaBacklog`) والحالتان الجديدتان (`فائتة` · `قضاء`) كلُّها اختيارية، لكنّ
 * «اختياريّ» ادّعاءٌ حتى يُختبر: الأصولُ كانت اختياريةً أيضاً وسقطت من `hydrate`
 * فلم تصل جهازاً جديداً أبداً.
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
import { normalizeBackup } from "@/components/settings/BackupCard";
import { countDayPrayers, getPrayerStreak } from "./utils";
import { qadaOwed } from "./prayerExtras";
import type { AppData, PrayerLog } from "./types";

/** سجلُّ صلاةٍ بصيغة ما قبل التغيير: ثلاثُ حالاتٍ فقط، بلا سننٍ ولا قيام. */
const LEGACY_LOGS: PrayerLog[] = [
  {
    date: "2026-05-01",
    prayers: { الفجر: "جماعة", الظهر: "منفردة", العصر: "جماعة", المغرب: "جماعة", العشاء: "جماعة" },
    prayerUpdatedAt: { الفجر: 1000 },
  },
  { date: "2026-05-02", prayers: { الفجر: "لم", الظهر: "جماعة" } },
];

/** `AppData` بصيغة ما قبل التغيير — بلا `qadaBacklog` أصلاً. */
function legacyData(): Partial<AppData> {
  return { prayerLogs: LEGACY_LOGS, lastUpdated: "2026-05-02T10:00:00.000Z" };
}

beforeEach(() => {
  idb.clear();
  useAppStore.setState(useAppStore.getInitialState?.() ?? {}, false);
});

describe("بياناتٌ قديمة تعبر الدورة بلا خسارة", () => {
  it("hydrate لبياناتٍ بلا الحقول الجديدة لا يُسقط سجلّاً ولا يخترع حالة", () => {
    useAppStore.getState().hydrate(legacyData());
    const out = useAppStore.getState().snapshot();
    expect(out.prayerLogs).toEqual(LEGACY_LOGS);
    // الحقلُ الغائب يأخذ صفراً لا `undefined` — وإلّا انكسر جمعُه في الواجهة.
    expect(out.qadaBacklog).toBe(0);
  });

  it("السننُ والقيامُ الغائبان يبقيان غائبين — لا يُحقنان في كلّ يوم", () => {
    useAppStore.getState().hydrate(legacyData());
    for (const log of useAppStore.getState().prayerLogs) {
      expect(log).not.toHaveProperty("sunan");
      expect(log).not.toHaveProperty("qiyam");
    }
  });

  it("نسخةٌ احتياطية قديمة تُستعاد بلا كسر، وتكسب الحقل الجديد بقيمته المحايدة", () => {
    const restored = normalizeBackup({ prayerLogs: LEGACY_LOGS, lastUpdated: "2026-05-02" });
    expect(restored.prayerLogs).toEqual(LEGACY_LOGS);
    expect(restored.qadaBacklog).toBe(0);
  });

  it("دمجُ جهازٍ قديم مع جهازٍ جديد لا يفقد سجلّاً من أيّهما", () => {
    const oldDevice = { ...normalizeBackup(legacyData() as Record<string, unknown>) };
    const newDevice = {
      ...normalizeBackup({ lastUpdated: "2026-05-03T10:00:00.000Z" } as Record<string, unknown>),
      prayerLogs: [{
        date: "2026-05-03", prayers: { الفجر: "قضاء" },
        sunan: 4, qiyam: { rakaat: 8, witr: true },
      }] as PrayerLog[],
      qadaBacklog: 7,
    };
    for (const merged of [mergeAppData(oldDevice, newDevice), mergeAppData(newDevice, oldDevice)]) {
      const dates = merged.prayerLogs.map((l) => l.date).sort();
      expect(dates).toEqual(["2026-05-01", "2026-05-02", "2026-05-03"]);
      const legacyDay = merged.prayerLogs.find((l) => l.date === "2026-05-01")!;
      expect(legacyDay.prayers).toEqual(LEGACY_LOGS[0].prayers);
      const newDay = merged.prayerLogs.find((l) => l.date === "2026-05-03")!;
      expect(newDay.sunan).toBe(4);
      expect(newDay.qiyam).toEqual({ rakaat: 8, witr: true });
      expect(merged.qadaBacklog).toBe(7);
    }
  });

  it("مسحُ سنّةٍ ينتشر بدل أن تعود من نسخةٍ قديمة", () => {
    const kept = {
      ...normalizeBackup({ lastUpdated: "2026-05-01T00:00:00.000Z" } as Record<string, unknown>),
      prayerLogs: [{ date: "2026-05-01", prayers: {}, sunan: 6, sunanUpdatedAt: 100 }] as PrayerLog[],
    };
    const cleared = {
      ...normalizeBackup({ lastUpdated: "2026-05-01T00:00:00.000Z" } as Record<string, unknown>),
      prayerLogs: [{ date: "2026-05-01", prayers: {}, sunanUpdatedAt: 9000 }] as PrayerLog[],
    };
    for (const merged of [mergeAppData(kept, cleared), mergeAppData(cleared, kept)]) {
      expect(merged.prayerLogs[0].sunan).toBeUndefined();
    }
  });
});

describe("الإحصاءُ القائم لا يتغيّر لبياناتٍ قديمة", () => {
  it("countDayPrayers وgetPrayerStreak يعطيان النتيجةَ نفسها لبياناتٍ بلا الحالتين الجديدتين", () => {
    expect(countDayPrayers(LEGACY_LOGS[0])).toEqual({ prayed: 5, mosque: 4 });
    expect(countDayPrayers(LEGACY_LOGS[1])).toEqual({ prayed: 1, mosque: 1 });
    expect(getPrayerStreak(LEGACY_LOGS)).toBe(0); // لا يومَ كاملاً متّصلاً باليوم
  });

  it("«قضاء» تُحتسب أداءً — وإلّا صار تسجيلُها يخفض إحصاءك", () => {
    const withQada: PrayerLog = {
      date: "2026-05-04",
      prayers: { الفجر: "قضاء", الظهر: "جماعة", العصر: "جماعة", المغرب: "جماعة", العشاء: "جماعة" },
    };
    expect(countDayPrayers(withQada)).toEqual({ prayed: 5, mosque: 4 });
  });

  it("«فائتة» لا تُحتسب أداءً وتُعَدّ ديناً", () => {
    const withMissed: PrayerLog = { date: "2026-05-05", prayers: { الفجر: "فائتة", الظهر: "جماعة" } };
    expect(countDayPrayers(withMissed)).toEqual({ prayed: 1, mosque: 1 });
    expect(qadaOwed([withMissed])).toBe(1);
  });

  it("بياناتٌ قديمةٌ خالصة لا دَينَ عليها البتّة", () => {
    expect(qadaOwed(LEGACY_LOGS)).toBe(0);
  });
});
