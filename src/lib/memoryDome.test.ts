import { describe, it, expect } from "vitest";
import {
  dayOfYear, hashUnit, domePoint, baseAngle, skyStars, skyDust, todayInHistory,
  DOME_W, DOME_H, MOOD_SKY,
} from "./memoryDome";
import type { JournalEntry } from "./types";

const e = (id: string, date: string, extra: Partial<JournalEntry> = {}): JournalEntry =>
  ({ id, date, content: "نصّ", ...extra });

describe("اليوم من السنة", () => {
  it("أوّلُ يناير ١ وآخرُ ديسمبر ٣٦٥/٣٦٦", () => {
    expect(dayOfYear("2026-01-01")).toBe(1);
    expect(dayOfYear("2026-12-31")).toBe(365);
    expect(dayOfYear("2028-12-31")).toBe(366); // كبيسة
  });

  it("تاريخٌ مشوّه لا يرمي", () => {
    expect(dayOfYear("")).toBe(1);
    expect(dayOfYear("nope")).toBe(1);
  });
});

describe("الحتميّة — السماءُ لا تتحرّك", () => {
  it("الهاشُ ثابتٌ لنفس المدخل", () => {
    expect(hashUnit("abc", 0x811c9dc5)).toBe(hashUnit("abc", 0x811c9dc5));
    expect(hashUnit("abc", 0x811c9dc5)).not.toBe(hashUnit("abd", 0x811c9dc5));
    expect(hashUnit("abc", 0x811c9dc5)).toBeGreaterThanOrEqual(0);
    expect(hashUnit("abc", 0x811c9dc5)).toBeLessThan(1);
  });

  it("موضعُ النجمة نفسُه في كلّ نداء — لا Math.random", () => {
    const list = [e("a", "2026-03-04"), e("b", "2026-08-19")];
    expect(skyStars(list)).toEqual(skyStars(list));
  });

  it("الغبارُ ثابتٌ كذلك", () => {
    expect(skyDust()).toEqual(skyDust());
    expect(skyDust()).toHaveLength(40);
    expect(skyDust(7)).toHaveLength(7);
  });
});

describe("هندسةُ القبّة", () => {
  it("كلُّ النقاط داخل اللوحة", () => {
    for (let a = 8; a <= 172; a += 4) {
      for (const f of [0.15, 0.5, 1]) {
        const p = domePoint(a, f);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(DOME_W);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(DOME_H);
      }
    }
  });

  it("زاويةُ السنة تمشي من ١٢° إلى ١٦٨°", () => {
    expect(baseAngle(1)).toBeCloseTo(12.43, 1);
    expect(baseAngle(366)).toBeCloseTo(168, 1);
  });

  it("مذكرةُ يناير في جهةٍ ومذكرةُ ديسمبر في الجهة الأخرى", () => {
    const [jan] = skyStars([e("j", "2026-01-02")]);
    const [dec] = skyStars([e("d", "2026-12-20")]);
    expect(jan.x).toBeGreaterThan(dec.x); // ١٢° يمينُ اللوحة، ١٦٨° يسارُها
  });

  it("كلُّ النجوم داخل اللوحة مهما كان التاريخ", () => {
    const many = Array.from({ length: 366 }, (_, i) => {
      const d = new Date(2026, 0, i + 1);
      const key = `2026-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return e(`n${i}`, key);
    });
    for (const s of skyStars(many)) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(DOME_W);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(DOME_H);
    }
  });
});

describe("شكلُ النجمة يحكي عن مذكرتها", () => {
  it("المفضّلةُ أكبرُ وأوضحُ ولها هالة", () => {
    const [plain] = skyStars([e("p", "2026-05-01")]);
    const [star] = skyStars([e("s", "2026-05-01", { starred: true })]);
    expect(star.r).toBeGreaterThan(plain.r);
    expect(star.halo).toBeGreaterThan(0);
    expect(plain.halo).toBe(0);
    expect(star.opacity).toBeGreaterThan(plain.opacity);
  });

  it("ذاتُ الصورة لها هالةٌ كذلك", () => {
    const [withPhoto] = skyStars([e("f", "2026-05-01", { photos: ["data:x"] })]);
    expect(withPhoto.halo).toBeGreaterThan(0);
  });

  it("المذكرةُ بلا نصٍّ تُرسم مجوّفة — أثرٌ بلا كلمات", () => {
    const [hollow] = skyStars([e("h", "2026-05-01", { content: "" })]);
    expect(hollow.hollow).toBe(true);
    const [tagsOnly] = skyStars([e("t", "2026-05-01", { content: "<p></p>" })]);
    expect(tagsOnly.hollow).toBe(true);
  });

  it("لونُ النجمة من المزاج، والغائبُ يأخذ المحايد", () => {
    expect(skyStars([e("a", "2026-05-01", { mood: 5 })])[0].color).toBe(MOOD_SKY[5]);
    expect(skyStars([e("b", "2026-05-01", { mood: 1 })])[0].color).toBe(MOOD_SKY[1]);
    expect(skyStars([e("c", "2026-05-01")])[0].color).toBe(MOOD_SKY[3]);
  });
});

describe("في مثل هذا اليوم", () => {
  it("يفضّل ما وافق الشهرَ واليومَ من سنةٍ ماضية", () => {
    const list = [e("old", "2025-08-19"), e("other", "2026-03-19")];
    expect(todayInHistory(list, "2026-08-19")?.id).toBe("old");
  });

  it("وإلّا فما وافق رقمَ اليوم وحدَه", () => {
    const list = [e("x", "2026-03-19")];
    expect(todayInHistory(list, "2026-08-19")?.id).toBe("x");
  });

  it("لا يختار اليومَ نفسَه ولا مستقبلاً", () => {
    expect(todayInHistory([e("today", "2026-08-19")], "2026-08-19")).toBeNull();
    expect(todayInHistory([e("later", "2027-08-19")], "2026-08-19")).toBeNull();
  });

  it("سماءٌ خالية لا تُرجع مذنَّباً", () => {
    expect(todayInHistory([], "2026-08-19")).toBeNull();
  });
});
